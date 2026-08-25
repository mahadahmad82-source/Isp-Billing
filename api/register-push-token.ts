// api/register-push-token.ts — called by Billcollector-Android and Wabot-Android
// after login to register/refresh their Expo push token. Goes through the
// service role key here rather than letting the app's anon key write to
// push_tokens directly, consistent with the ongoing move away from open
// anon table access elsewhere in this repo.
//
// SECURITY: the caller's identity (managerId / owner_role / owner_username) is
// always re-derived server-side from the verified Bearer token below — never
// trusted from the request body. Without this, any caller could register a
// push token against any manager's managerId and receive that manager's
// billing/complaint/customer push notifications (api/webhook.ts's delivery
// path trusts push_tokens.manager_id fully once a token is registered there).
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { token, deviceName } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const bearerToken = String(authHeader).replace(/^Bearer\s+/i, '');
  if (!bearerToken) return res.status(401).json({ error: 'Unauthorized' });

  const dbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Verify the token against Supabase Auth and get the real auth user id —
    // this is the only source of truth for identity, never req.body.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${bearerToken}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Unauthorized' });
    const user = await userRes.json();
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    // Resolve managerId/owner_role/owner_username server-side from the verified
    // auth user id — check sub_managers first, then fall back to profiles (manager).
    let managerId: string;
    let ownerRole: string;
    let ownerUsername: string;

    const agentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(user.id)}&select=username,manager_id&limit=1`,
      { headers: dbHeaders }
    );
    const agents = agentRes.ok ? await agentRes.json().catch(() => []) : [];

    if (agents?.[0]?.manager_id) {
      managerId = agents[0].manager_id;
      ownerRole = 'sub-manager';
      ownerUsername = agents[0].username;
    } else {
      const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=username`,
        { headers: dbHeaders }
      );
      const profs = profRes.ok ? await profRes.json().catch(() => []) : [];
      if (!profs?.[0]?.username) {
        return res.status(403).json({ error: 'No manager mapping for this account' });
      }
      managerId = profs[0].username;
      ownerRole = 'manager';
      ownerUsername = profs[0].username;
    }

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?on_conflict=token`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        manager_id: managerId,
        owner_role: ownerRole,
        owner_username: ownerUsername,
        token,
        device_name: deviceName || null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upsertRes.ok) {
      const errText = await upsertRes.text();
      return res.status(502).json({ error: 'Supabase upsert failed', detail: errText });
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
