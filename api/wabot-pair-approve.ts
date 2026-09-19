// api/wabot-pair-approve.ts — called from the NetBot Android app's "Link a
// Device" scanner, with the SCANNING account's own Supabase Auth JWT.
// Approves a pending pairing token so the *web* screen that showed that QR
// gets logged in as the SAME account that scanned it (self-service device
// linking, like WhatsApp Web's phone-approves-desktop flow) — never a
// different account, since identity is taken from the verified JWT only,
// never from anything the client sends in the body (same principle as the
// managerId fix in wabot-send.ts).
//
// Real Supabase Auth accounts only for now (managers + migrated
// sub-managers). Legacy (non-migrated) sub-manager agentToken accounts
// aren't covered — they still use password login on /wabot until migrated.
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const { token } = req.body || {};

  if (!jwt) return res.status(401).json({ error: 'Login required to approve a device' });
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token is required' });

  try {
    // 1. Verify the scanning device's own session and read its email — the
    //    ONLY source of identity, so approving a QR can never grant access
    //    to any account other than your own.
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!ur.ok) return res.status(401).json({ error: 'Invalid or expired session' });
    const authUser = await ur.json();
    const email = authUser?.email;
    if (!email) {
      return res.status(400).json({ error: 'This account type does not support Link a Device yet.' });
    }

    // 2. Load the pending pairing row.
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?token=eq.${encodeURIComponent(token)}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await pr.json();
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'QR code not found — it may have expired.' });
    if (row.status !== 'pending') return res.status(410).json({ error: 'This QR code was already used or has expired.' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await fetch(`${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?token=eq.${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'expired' }),
      });
      return res.status(410).json({ error: 'QR code expired — generate a new one.' });
    }

    // 3. Mint a magic-link OTP for the SAME account (no password ever
    //    touches this device) — the web side redeems it once via
    //    supabase.auth.verifyOtp().
    const gr = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    if (!gr.ok) {
      const d = await gr.text();
      console.error('[wabot-pair-approve] generate_link failed', d);
      return res.status(500).json({ error: 'Could not approve device' });
    }
    const gd = await gr.json();
    const hashedToken = gd?.hashed_token || gd?.properties?.hashed_token;
    if (!hashedToken) return res.status(500).json({ error: 'Could not approve device' });

    // 4. Mark approved. The next (and only) successful poll from the web
    //    side flips this to 'used' — see wabot-pair-poll.ts.
    await fetch(`${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?token=eq.${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        magic_token_hash: hashedToken,
        approved_username: email.split('@')[0],
        approved_at: new Date().toISOString(),
      }),
    });

    return res.status(200).json({ ok: true, username: email.split('@')[0] });
  } catch (e: any) {
    console.error('[wabot-pair-approve]', e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
