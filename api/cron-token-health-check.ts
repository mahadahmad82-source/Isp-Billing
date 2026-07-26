// api/cron-token-health-check.ts
// Runs daily. Pings Meta Graph API for each active/trial client token.
// Updates token_status (active / expired / invalid / not_set) + last_token_check.
// Vercel cron: "0 3 * * *" (3 AM UTC — off-peak, after quota-reset)

import { decryptToken } from '../lib/whatsappCrypto';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch all active/trial configs that have a stored token
  let rows: any[] = [];
  try {
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_configs?service_status=in.(active,trial)&select=manager_id,access_token,token_status`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    rows = await fetchRes.json();
  } catch (e: any) {
    console.error('[token-health] fetch failed:', e?.message);
    return res.status(500).json({ error: e?.message });
  }

  if (!rows.length) {
    return res.status(200).json({ checked: 0, message: 'No active configs to check' });
  }

  const results: { manager_id: string; status: string; error?: string }[] = [];

  for (const row of rows) {
    // No token stored yet
    if (!row.access_token) {
      await updateTokenStatus(row.manager_id, 'not_set');
      results.push({ manager_id: row.manager_id, status: 'not_set' });
      continue;
    }

    // Decrypt token
    let plainToken: string;
    try {
      plainToken = decryptToken(row.access_token);
    } catch (e: any) {
      console.error(`[token-health] decrypt failed manager=${row.manager_id}:`, e?.message);
      results.push({ manager_id: row.manager_id, status: 'error', error: 'decrypt_failed' });
      continue;
    }

    // Ping Meta Graph API
    try {
      const metaRes  = await fetch(
        `https://graph.facebook.com/v20.0/me?access_token=${plainToken}&fields=id,name`
      );
      const metaData = await metaRes.json();

      let newStatus: string;
      if (metaRes.ok && metaData?.id) {
        newStatus = 'active';
      } else if (metaData?.error?.code === 190) {
        // OAuth token expired (code 190 = Invalid OAuth access token)
        newStatus = 'expired';
      } else {
        newStatus = 'invalid';
      }

      await updateTokenStatus(row.manager_id, newStatus);
      results.push({ manager_id: row.manager_id, status: newStatus });

      if (newStatus !== 'active') {
        console.warn(`[token-health] ⚠️ manager=${row.manager_id} token=${newStatus} — needs attention`);
      } else {
        console.log(`[token-health] ✅ manager=${row.manager_id} token=active`);
      }
    } catch (e: any) {
      console.error(`[token-health] Meta ping failed manager=${row.manager_id}:`, e?.message);
      results.push({ manager_id: row.manager_id, status: 'error', error: e?.message });
    }
  }

  // Summary log for quick Vercel log scan
  const bad = results.filter(r => r.status !== 'active');
  if (bad.length) {
    console.warn(`[token-health] ${bad.length} token(s) need attention:`, bad.map(b => `${b.manager_id}=${b.status}`).join(', '));
  }

  return res.status(200).json({ checked: rows.length, results });
}

async function updateTokenStatus(managerId: string, status: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({
        token_status:     status,
        last_token_check: new Date().toISOString(),
      }),
    });
  } catch (e: any) {
    console.error(`[token-health] updateTokenStatus failed manager=${managerId}:`, e?.message);
  }
}
