// api/wabot-pair-create.ts — creates a short-lived pairing token for NetBot
// Web's "Scan with NetBot Android app" QR login. Called by the web login
// screen (unauthenticated — that's the whole point, no credentials yet). The
// token carries no identity by itself; it's a random single-use claim check
// that an already-logged-in phone can later approve via
// api/wabot-pair-approve.ts, WhatsApp-Web style.
import crypto from 'crypto';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only

const EXPIRY_MS = 3 * 60 * 1000; // 3 minutes
const MAX_PENDING_PER_IP = 5;    // light abuse guard
const IP_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  const deviceLabel = (req.headers['user-agent'] || '').toString().slice(0, 200);

  try {
    if (ip) {
      const since = new Date(Date.now() - IP_WINDOW_MS).toISOString();
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?creator_ip=eq.${encodeURIComponent(ip)}&created_at=gte.${since}&select=token`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length >= MAX_PENDING_PER_IP) {
        return res.status(429).json({ error: 'Too many QR requests — wait a few minutes and try again.' });
      }
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ token, expires_at: expiresAt, device_label: deviceLabel, creator_ip: ip || null }),
    });
    if (!ins.ok) {
      const d = await ins.text();
      console.error('[wabot-pair-create] insert failed', d);
      return res.status(500).json({ error: 'Could not create pairing session' });
    }

    return res.status(200).json({ token, expiresAt });
  } catch (e: any) {
    console.error('[wabot-pair-create]', e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
