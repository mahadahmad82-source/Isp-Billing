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

import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '../lib/whatsappCrypto.js';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

  if (action === 'add-token' || action === 'list-sub-manager-accounts') {
    // Browser path: only an authenticated admin may use these actions.
    const isAdmin = await verifyAdminSession(token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized — admin session required' });
  } else if (action === 'create-sub-manager-auth' || action === 'reset-sub-manager-auth-password' || action === 'resolve-sub-manager-session' || action === 'resolve-sub-manager-state') {
    // Browser/mobile path: each handler performs its own ownership check. The
    // resolver is intentionally authenticated too, so it can only disclose the
    // caller's own parent-manager mapping.
    const caller = await getCallerContext(token);
    if (!caller) return res.status(401).json({ error: 'Unauthorized — authenticated session required' });
    req.__caller = caller;
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
    case 'create-sub-manager-auth':
      return handleCreateSubManagerAuth(req, res);
    case 'reset-sub-manager-auth-password':
      return handleResetSubManagerAuthPassword(req, res);
    case 'resolve-sub-manager-session':
      return handleResolveSubManagerSession(req, res);
    case 'resolve-sub-manager-state':
      return handleResolveSubManagerState(req, res);
    case 'list-sub-manager-accounts':
      return handleListSubManagerAccounts(req, res);
    case 'reset-quota':
      return handleResetQuota(req, res);
    case 'token-health':
      return handleTokenHealth(req, res);
    default:
      return res.status(400).json({ error: 'Unknown or missing ?action=. Use add-token | create-sub-manager-auth | list-sub-manager-accounts | reset-quota | token-health' });
  }
}

interface CallerContext { userId: string; role: string; username: string | null; }

async function getCallerContext(accessToken: string): Promise<CallerContext | null> {
  if (!accessToken) return null;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (!user?.id) return null;

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,username`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!profileRes.ok) return null;
    const rows: any[] = await profileRes.json();
    const profile = rows?.[0];
    if (profile) return { userId: user.id, role: profile.role || 'manager', username: profile.username || null };

    // Auth-only field agents do not get a profiles row. Resolve their own
    // identity from sub_managers so the mobile session can safely obtain its
    // parent manager mapping without exposing any other agent's data.
    const agentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(user.id)}&select=username&limit=1`,
      { headers: dbHeaders }
    );
    if (!agentRes.ok) return null;
    const agents: any[] = await agentRes.json();
    const agent = agents?.[0];
    return agent?.username ? { userId: user.id, role: 'sub-manager', username: agent.username } : null;
  } catch (e: any) {
    console.error('[getCallerContext]', e?.message);
    return null;
  }
}

async function verifyAdminSession(accessToken: string): Promise<boolean> {
  const caller = await getCallerContext(accessToken);
  return caller?.role === 'admin';
}

const dbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// ── Action: create-sub-manager-auth ─────────────────────────────────────────
// Provisions the Auth identity while keeping the existing manager_data JSONB
// agent entry intact. The caller must own manager_username unless admin.
async function handleResetSubManagerAuthPassword(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const managerUsername = String(body.manager_username || '').trim().toLowerCase();
  const subManagerUsername = String(body.sub_manager_username || '').trim().toLowerCase();
  const newPassword = String(body.new_password || '');
  const caller: CallerContext | undefined = req.__caller;
  if (!managerUsername || !subManagerUsername || newPassword.length < 6) {
    return res.status(400).json({ error: 'manager_username, sub_manager_username and a 6-character password are required' });
  }
  if (!caller || (caller.role !== 'admin' && caller.username?.toLowerCase() !== managerUsername)) {
    return res.status(403).json({ error: 'You can only reset agents under your own manager account.' });
  }
  try {
    const rowRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?manager_id=eq.${encodeURIComponent(managerUsername)}&username=eq.${encodeURIComponent(subManagerUsername)}&select=auth_user_id`,
      { headers: dbHeaders }
    );
    if (!rowRes.ok) throw new Error('agent lookup failed');
    const rows: any[] = await rowRes.json();
    const authUserId = rows?.[0]?.auth_user_id;
    if (!authUserId) return res.status(404).json({ error: 'This agent does not have a real login account yet.' });
    const { error } = await adminSupabase.auth.admin.updateUserById(authUserId, { password: newPassword });
    if (error) return res.status(400).json({ error: 'Agent password could not be updated.' });
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('[reset-sub-manager-auth-password]', e?.message);
    return res.status(500).json({ error: 'Agent password could not be updated.' });
  }
}

async function handleResolveSubManagerSession(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const rowRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(caller.userId)}&select=auth_user_id,manager_id,username,name,email,contact,role,assigned_area,commission_rate,salary,duty_status,is_leave,last_check_in,last_check_out,last_location&limit=1`,
      { headers: dbHeaders }
    );
    if (!rowRes.ok) throw new Error('agent session lookup failed');
    const rows: any[] = await rowRes.json();
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Sub-manager profile not found.' });
    return res.status(200).json({ success: true, agent: row });
  } catch (e: any) {
    console.error('[resolve-sub-manager-session]', e?.message);
    return res.status(500).json({ error: 'Sub-manager profile could not be loaded.' });
  }
}

async function handleResolveSubManagerState(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || caller.role !== 'sub-manager') return res.status(403).json({ error: 'Sub-manager session required' });
  try {
    const agentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(caller.userId)}&select=manager_id,username,auth_user_id&limit=1`,
      { headers: dbHeaders }
    );
    if (!agentRes.ok) throw new Error('agent owner lookup failed');
    const agents: any[] = await agentRes.json();
    const agent = agents?.[0];
    if (!agent?.manager_id) return res.status(404).json({ error: 'Parent manager mapping not found.' });

    const stateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(agent.manager_id)}&select=manager_id,data&limit=1`,
      { headers: dbHeaders }
    );
    if (!stateRes.ok) throw new Error('parent manager state lookup failed');
    const states: any[] = await stateRes.json();
    const state = states?.[0]?.data;
    if (!state) return res.status(404).json({ error: 'Parent manager data not found.' });
    return res.status(200).json({ success: true, manager_id: agent.manager_id, agent_username: agent.username, state });
  } catch (e: any) {
    console.error('[resolve-sub-manager-state]', e?.message);
    return res.status(500).json({ error: 'Parent manager data could not be loaded.' });
  }
}

async function handleCreateSubManagerAuth(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const managerUsername = String(body.manager_username || '').trim().toLowerCase();
  const subManagerUsername = String(body.sub_manager_username || '').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  // Email is optional for field agents. When the manager does not provide a
  // recovery email, keep the Auth identity deterministic and manager-controlled.
  // The manager remains responsible for the password and can reset it from the
  // admin/manager controls; no customer-facing recovery email is implied.
  const authEmail = email || `agent.${managerUsername}.${subManagerUsername}@myisp.local`;

  if (!managerUsername || !subManagerUsername || !password || !name) {
    return res.status(400).json({ error: 'manager_username, sub_manager_username, password and name are required' });
  }
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || (caller.role !== 'admin' && caller.username?.toLowerCase() !== managerUsername)) {
    return res.status(403).json({ error: 'You can only create agents under your own manager account.' });
  }

  let provisionedAuthUserId: string | null = null;
  try {
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?manager_id=eq.${encodeURIComponent(managerUsername)}&username=eq.${encodeURIComponent(subManagerUsername)}&select=auth_user_id`,
      { headers: dbHeaders }
    );
    if (!existingRes.ok) return res.status(500).json({ error: 'Could not verify the existing agent record.' });
    const existingRows: any[] = await existingRes.json();
    if (existingRows?.[0]?.auth_user_id) {
      return res.status(409).json({ error: 'This agent already has a real login account.' });
    }

    const { data, error: authError } = await adminSupabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, username: subManagerUsername, manager_username: managerUsername },
    });
    if (authError || !data?.user?.id) {
      console.error('[create-sub-manager-auth] Auth provisioning failed:', authError?.message);
      return res.status(400).json({ error: 'Unable to create the agent login. Check that the email and password are valid and unused.' });
    }

    const authUserId = data.user.id;
    provisionedAuthUserId = authUserId;
    const row = {
      manager_id: managerUsername,
      username: subManagerUsername,
      name,
      email: authEmail,
      auth_user_id: authUserId,
      role: 'agent',
    };

    let dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?manager_id=eq.${encodeURIComponent(managerUsername)}&username=eq.${encodeURIComponent(subManagerUsername)}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ name, email: authEmail, auth_user_id: authUserId, role: 'agent' }),
      }
    );
    if (!dbRes.ok) throw new Error('agent update failed');
    const updatedRows: any[] = await dbRes.json();
    if (!updatedRows.length) {
      dbRes = await fetch(`${SUPABASE_URL}/rest/v1/sub_managers`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      if (!dbRes.ok) throw new Error('agent insert failed');
    }

    return res.status(200).json({ success: true, auth_user_id: authUserId, auth_email: authEmail });
  } catch (e: any) {
    console.error('[create-sub-manager-auth] Database provisioning failed:', e?.message);
    // Avoid leaving an orphaned Auth identity if the sub_managers write fails.
    if (provisionedAuthUserId) await adminSupabase.auth.admin.deleteUser(provisionedAuthUserId).catch(() => {});
    return res.status(500).json({ error: 'Login account could not be linked to the agent record. The existing local agent was not blocked.' });
  }
}

// ── Action: list-sub-manager-accounts ───────────────────────────────────────
// Admin-only service-role read; avoids widening sub_managers RLS for the panel.
async function handleListSubManagerAccounts(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rowsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?select=id,manager_id,auth_user_id,username,name,role,assigned_area,commission_rate,contact,email,salary,duty_status,is_leave,last_check_in,last_check_out,last_location,metadata&order=manager_id.asc,username.asc`,
      { headers: dbHeaders }
    );
    if (!rowsRes.ok) throw new Error('sub-manager query failed');
    const rows: any[] = await rowsRes.json();
    const parentUsernames = Array.from(new Set(rows.map(row => row.manager_id).filter(Boolean)));
    const parentMap = new Map<string, any>();
    if (parentUsernames.length) {
      const parentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?username=in.(${parentUsernames.map(encodeURIComponent).join(',')})&select=username,business_name,full_name,is_active`,
        { headers: dbHeaders }
      );
      if (parentRes.ok) {
        const parents: any[] = await parentRes.json();
        parents.forEach(parent => parentMap.set(parent.username, parent));
      }
    }
    const accounts = rows.map(row => {
      const parent = parentMap.get(row.manager_id) || {};
      return {
        username: row.username,
        business_name: row.name || row.username,
        email: row.email || '',
        phone: row.contact || null,
        role: 'sub-manager',
        joined_at: row.metadata?.created_at || '',
        last_login: row.last_check_in || '',
        last_seen: row.last_check_in || null,
        user_count: 0,
        receipt_count: 0,
        active_count: 0,
        expired_count: 0,
        total_revenue: 0,
        total_balance: 0,
        data_updated_at: null,
        is_active: row.is_leave !== true,
        auth_user_id: row.auth_user_id,
        parent_username: row.manager_id,
        parent_business_name: parent.business_name || parent.full_name || row.manager_id,
        assigned_area: row.assigned_area || null,
        duty_status: row.duty_status || 'offline',
      };
    });
    return res.status(200).json({ success: true, accounts });
  } catch (e: any) {
    console.error('[list-sub-manager-accounts]', e?.message);
    return res.status(500).json({ error: 'Could not load sub-manager accounts.' });
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
  // Enterprise is the product-facing label; whatsapp_configs stores it as unlimited.
  const resolvedPlan  = plan_type === 'enterprise' ? 'unlimited' : (plan_type || 'basic');
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
