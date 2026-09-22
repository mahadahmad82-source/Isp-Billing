// api/wabot-pair.ts — NetBot Web "Link a Device" QR login, all three steps
// in one endpoint (action: 'create' | 'approve' | 'poll') so this doesn't
// add 3 separate functions against Vercel Hobby's 12-function cap — folds
// in per this project's established "action discriminator" convention.
//
// Flow: web calls action=create (unauthenticated) to get a token + QR image
// source; the already-logged-in NetBot Android app scans it and calls
// action=approve with ITS OWN Supabase Auth JWT (never a different account —
// identity always comes from the verified JWT, never the request body, same
// principle as the managerId fix in wabot-send.ts); the web screen polls
// action=poll, and on approval gets a one-time-use Supabase magic-link hash
// to redeem via supabase.auth.verifyOtp() — no password ever touches either
// the wire or this endpoint.
//
// Real Supabase Auth accounts only for now (managers + migrated
// sub-managers). Legacy (non-migrated) sub-manager agentToken accounts
// aren't covered — they still use password login on /wabot until migrated.
import crypto from 'crypto';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only

const EXPIRY_MS = 3 * 60 * 1000; // 3 minutes
const MAX_PENDING_PER_IP = 5;    // light abuse guard on QR creation
const IP_WINDOW_MS = 5 * 60 * 1000;

async function handleCreate(req: any, res: any) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  const deviceLabel = (req.headers['user-agent'] || '').toString().slice(0, 200);

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
    console.error('[wabot-pair:create] insert failed', await ins.text());
    return res.status(500).json({ error: 'Could not create pairing session' });
  }
  return res.status(200).json({ token, expiresAt });
}

async function handleApprove(req: any, res: any) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const { token } = req.body || {};

  if (!jwt) return res.status(401).json({ error: 'Login required to approve a device' });
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token is required' });

  // 1. Verify the scanning device's own session — the ONLY source of
  //    identity, so approving a QR can never grant access to any account
  //    other than your own.
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!ur.ok) return res.status(401).json({ error: 'Invalid or expired session' });
  const authUser = await ur.json();
  const email = authUser?.email;
  const authUserId = authUser?.id;
  if (!email) return res.status(400).json({ error: 'This account type does not support Link a Device yet.' });

  // BUG FIX: this used to key the web session off the auth email's local
  // part — that only equals the real app username by coincidence (true for
  // the synthetic username@myisp.local accounts, but NOT for accounts
  // registered with a real personal email). mahadnet's own login is
  // mahadnet2026@gmail.com — auth/verification worked fine (real JWT, real
  // magic link), but the web side then went looking for a manager_data row
  // keyed by that email's local part, which doesn't exist (the real row is
  // keyed 'mahadnet', from profiles.username) — so the scan "succeeded" but
  // landed on an empty account. Resolve the real username from `profiles`
  // by the verified auth user id instead; only fall back to the email guess
  // if no profile row is found.
  let realUsername = email.split('@')[0];
  try {
    const pfr = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(authUserId)}&select=username`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const profileRows = await pfr.json();
    if (Array.isArray(profileRows) && profileRows[0]?.username) {
      realUsername = profileRows[0].username;
    }
  } catch (e: any) {
    console.error('[wabot-pair:approve] profiles lookup failed, falling back to email-derived username', e?.message);
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

  // 3. Mint a magic-link OTP for the SAME account — the web side redeems it
  //    once via supabase.auth.verifyOtp(). No password ever exposed here.
  const gr = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!gr.ok) {
    console.error('[wabot-pair:approve] generate_link failed', await gr.text());
    return res.status(500).json({ error: 'Could not approve device' });
  }
  const gd = await gr.json();
  const hashedToken = gd?.hashed_token || gd?.properties?.hashed_token;
  if (!hashedToken) return res.status(500).json({ error: 'Could not approve device' });

  // 4. Mark approved. The next (and only) successful poll flips this to
  //    'used' — see handlePoll below.
  await fetch(`${SUPABASE_URL}/rest/v1/wabot_web_pairing_sessions?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'approved',
      magic_token_hash: hashedToken,
      approved_username: realUsername,
      approved_at: new Date().toISOString(),
    }),
  });

  return res.status(200).json({ ok: true, username: realUsername });
}

async function handlePoll(req: any, res: any) {
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token is required' });

  // Atomic claim: this PATCH only matches (and only returns a row) on the
  // ONE poll that catches status='approved' — single-use, by construction.
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
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const action = req.body?.action;
  try {
    if (action === 'create') return await handleCreate(req, res);
    if (action === 'approve') return await handleApprove(req, res);
    if (action === 'poll') return await handlePoll(req, res);
    return res.status(400).json({ error: 'Unknown action — expected create, approve, or poll' });
  } catch (e: any) {
    console.error('[wabot-pair]', action, e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
