// api/wabot-pair-poll.ts — polled every ~2s by the NetBot Web QR screen
// while waiting for the phone to approve. Atomically flips an approved row
// to 'used' on the exact poll that returns it (via a conditional PATCH), so
// the magic-link hash can only ever be handed to a browser ONCE — a second
// poll, or a replay, gets nothing back.
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token is required' });

  try {
    // Atomic claim: this PATCH only matches (and only returns a row) on the
    // ONE poll that catches status='approved'.
    const claim = await fetch(
      `${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?token=eq.${encodeURIComponent(token)}&status=eq.approved`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ status: 'used', used_at: new Date().toISOString() }),
      }
    );
    const claimed = await claim.json();
    if (Array.isArray(claimed) && claimed[0]) {
      const row = claimed[0];
      return res.status(200).json({ status: 'approved', tokenHash: row.magic_token_hash, username: row.approved_username });
    }

    // Not approved yet on this poll — report current state.
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?token=eq.${encodeURIComponent(token)}&select=status,expires_at`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await pr.json();
    const row = rows?.[0];
    if (!row) return res.status(200).json({ status: 'expired' });
    if (row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(200).json({ status: 'expired' });
    }
    return res.status(200).json({ status: row.status === 'pending' ? 'pending' : row.status });
  } catch (e: any) {
    console.error('[wabot-pair-poll]', e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
