// api/register-push-token.ts — called by the Wabot BillCollector Android app
// (mahadahmad82-source/Wabot-Android) after login to register/refresh its
// Expo push token. Goes through the service role key here rather than
// letting the app's anon key write to push_tokens directly, consistent with
// the ongoing move away from open anon table access elsewhere in this repo.
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { managerId, token, deviceName } = req.body || {};
  if (!managerId || !token) return res.status(400).json({ error: 'managerId and token are required' });

  try {
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?on_conflict=token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        manager_id: managerId,
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
