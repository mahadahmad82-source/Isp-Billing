// api/admin-maintenance.ts
// Consolidated admin/maintenance endpoint (merged to stay under Vercel Hobby's
// 12-serverless-function limit). Action is chosen via ?action= query param:
//
//   POST /api/admin-maintenance?action=add-token    → add/verify/encrypt a client's WhatsApp token
//   GET  /api/admin-maintenance?action=reset-quota   → daily cron: reset expired billing cycles
//   GET  /api/admin-maintenance?action=token-health  → daily cron: verify all stored tokens with Meta
//
// Auth:
//  - reset-quota / token-health: server-to-server only → Authorization: Bearer <CRON_SECRET>
//  - add-token: called from the browser (Admin Panel) → Authorization: Bearer <Supabase user access_token>,
//    verified against Supabase Auth + profiles.role === 'admin'. CRON_SECRET is NEVER shipped to the
//    frontend bundle, so this action cannot use the CRON_SECRET path.

import { encryptToken, decryptToken } from '../lib/whatsappCrypto';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const QUOTA_MAP: Record<string, number> = {
  basic:     1000,
  pro:       5000,
  unlimited: Number.MAX_SAFE_INTEGER,
  enterprise: Number.MAX_SAFE_INTEGER,
  text_only: 1000,
};

export default async function handler(req: any, res: any) {
  const action = req.query?.action;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (action === 'add-token') {
    // Frontend path: verify Supabase session belongs to an admin
    const isAdmin = await verifyAdminSession(token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized — admin session required' });
  } else {
    // Cron path: server-to-server secret only
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  switch (action) {
    case 'add-token':
      return handleAddToken(req, res);
    case 'reset-quota':
      return handleResetQuota(req, res);
    case 'token-health':
      return handleTokenHealth(req, res);
    default:
      return res.status(400).json({ error: 'Unknown or missing ?action=. Use add-token | reset-quota | token-health' });
  }
}

async function verifyAdminSession(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  try {
    // 1. Resolve the user from their Supabase access token
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    if (!user?.id) return false;

    // 2. Check profiles.role === 'admin' for that user (service role bypasses RLS)
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows: any[] = await profileRes.json();
    return rows?.[0]?.role === 'admin';
  } catch (e: any) {
    console.error('[verifyAdminSession]', e?.message);
    return false;
  }
}


// ── Action: add-token ──────────────────────────────────────────────────────
// Receive an ISP manager's Meta token → test connection → encrypt → upsert whatsapp_configs
async function handleAddToken(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { manager_id, waba_id, phone_number_id, access_token, plan_type } = req.body || {};

  if (!manager_id || !waba_id || !phone_number_id || !access_token) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['manager_id', 'waba_id', 'phone_number_id', 'access_token'],
    });
  }

  // 1. Test token against Meta /me
  let tokenStatus: 'active' | 'invalid' = 'invalid';
  let metaUserId: string | null = null;
  try {
    const metaRes  = await fetch(
      `https://graph.facebook.com/v20.0/me?access_token=${access_token}&fields=id,name`
    );
    const metaData = await metaRes.json();
    if (metaRes.ok && metaData?.id) {
      tokenStatus = 'active';
      metaUserId  = metaData.id;
      console.log(`[add-token] Meta OK manager=${manager_id} fb_id=${metaData.id} name=${metaData.name}`);
    } else {
      console.error('[add-token] Meta test failed:', JSON.stringify(metaData).slice(0, 200));
    }
  } catch (e: any) {
    console.error('[add-token] Meta fetch error:', e?.message);
  }

  // 2. Encrypt token
  let encryptedToken: string;
  try {
    encryptedToken = encryptToken(access_token);
  } catch (e: any) {
    return res.status(500).json({ error: 'Encryption failed: ' + e?.message });
  }

  // 3. Compute quota + cycle dates
  const resolvedPlan  = plan_type || 'basic';
  const message_quota = QUOTA_MAP[resolvedPlan] ?? 1000;
  const now           = new Date();
  const cycleStart    = now.toISOString().split('T')[0];
  const cycleEndDate  = new Date(now);
  cycleEndDate.setDate(cycleEndDate.getDate() + 29);
  const cycleEnd      = cycleEndDate.toISOString().split('T')[0];

  // 4. Upsert to whatsapp_configs
  try {
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        manager_id,
        waba_id,
        phone_number_id,
        access_token:             encryptedToken,
        token_status:             tokenStatus,
        plan_type:                resolvedPlan,
        message_quota,
        messages_used_this_cycle: 0,
        cycle_start_date:         cycleStart,
        cycle_end_date:           cycleEnd,
        service_status:           'trial',
        last_token_check:         now.toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      console.error('[add-token] Supabase upsert failed:', err);
      return res.status(500).json({ error: 'DB upsert failed', detail: err });
    }

    return res.status(200).json({
      success:          true,
      manager_id,
      token_status:     tokenStatus,
      meta_user_id:     metaUserId,
      plan_type:        resolvedPlan,
      message_quota,
      cycle_start_date: cycleStart,
      cycle_end_date:   cycleEnd,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Unexpected error: ' + e?.message });
  }
}

// ── Action: reset-quota ──────────────────────────────────────────────────────
// Daily cron. Finds configs whose cycle_end_date has passed, resets usage to 0,
// rolls the cycle window forward by 30 days.
async function handleResetQuota(req: any, res: any) {
  const today = new Date().toISOString().split('T')[0];

  let rows: any[] = [];
  try {
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_configs?cycle_end_date=lte.${today}&service_status=in.(active,trial)&select=manager_id,cycle_end_date,messages_used_this_cycle,message_quota`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    rows = await fetchRes.json();
  } catch (e: any) {
    console.error('[reset-quota] fetch failed:', e?.message);
    return res.status(500).json({ error: e?.message });
  }

  if (!rows.length) {
    return res.status(200).json({ reset: 0, message: 'No configs due for reset today' });
  }

  let reset = 0;
  const details: any[] = [];

  for (const row of rows) {
    const prevEnd  = new Date(row.cycle_end_date);
    const newStart = new Date(prevEnd);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + 29);

    const newStartStr = newStart.toISOString().split('T')[0];
    const newEndStr   = newEnd.toISOString().split('T')[0];

    try {
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.${row.manager_id}`,
        {
          method: 'PATCH',
          headers: {
            apikey:         SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer:         'return=minimal',
          },
          body: JSON.stringify({
            messages_used_this_cycle: 0,
            cycle_start_date:         newStartStr,
            cycle_end_date:           newEndStr,
          }),
        }
      );

      if (patchRes.ok) {
        reset++;
        console.log(`[reset-quota] ✅ manager=${row.manager_id} was ${row.messages_used_this_cycle}/${row.message_quota} → reset. New cycle ${newStartStr}→${newEndStr}`);
        details.push({ manager_id: row.manager_id, prev_used: row.messages_used_this_cycle, new_cycle_start: newStartStr, new_cycle_end: newEndStr });
      } else {
        const err = await patchRes.text();
        console.error(`[reset-quota] ❌ manager=${row.manager_id}:`, err);
        details.push({ manager_id: row.manager_id, error: err });
      }
    } catch (e: any) {
      console.error(`[reset-quota] ❌ manager=${row.manager_id}:`, e?.message);
      details.push({ manager_id: row.manager_id, error: e?.message });
    }
  }

  return res.status(200).json({ reset, total: rows.length, details });
}

// ── Action: token-health ─────────────────────────────────────────────────────
// Daily cron. Pings Meta Graph API for each active/trial client token.
// Updates token_status (active / expired / invalid / not_set) + last_token_check.
async function handleTokenHealth(req: any, res: any) {
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
    if (!row.access_token) {
      await updateTokenStatus(row.manager_id, 'not_set');
      results.push({ manager_id: row.manager_id, status: 'not_set' });
      continue;
    }

    let plainToken: string;
    try {
      plainToken = decryptToken(row.access_token);
    } catch (e: any) {
      console.error(`[token-health] decrypt failed manager=${row.manager_id}:`, e?.message);
      results.push({ manager_id: row.manager_id, status: 'error', error: 'decrypt_failed' });
      continue;
    }

    try {
      const metaRes  = await fetch(
        `https://graph.facebook.com/v20.0/me?access_token=${plainToken}&fields=id,name`
      );
      const metaData = await metaRes.json();

      let newStatus: string;
      if (metaRes.ok && metaData?.id) {
        newStatus = 'active';
      } else if (metaData?.error?.code === 190) {
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
