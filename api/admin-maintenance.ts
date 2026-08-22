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
import { callGeminiWithFailover, GEMINI_FALLBACK_MODELS } from '../lib/geminiFailover.js';

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

  if (action === 'add-token') {
    // Browser path: only an authenticated admin may use this action.
    const isAdmin = await verifyAdminSession(token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized — admin session required' });
  } else if (action === 'create-sub-manager-auth' || action === 'reset-sub-manager-auth-password' || action === 'resolve-sub-manager-session' || action === 'resolve-sub-manager-state' || action === 'agent-issue-receipt' || action === 'submit-complaint-resolution' || action === 'send-team-message' || action === 'complaint-feedback' || action === 'mirror-agent-attendance' || action === 'revoke-sub-manager-auth' || action === 'list-sub-manager-accounts' || action === 'ai-insights') {
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
    case 'revoke-sub-manager-auth':
      return handleRevokeSubManagerAuth(req, res);
    case 'resolve-sub-manager-session':
      return handleResolveSubManagerSession(req, res);
    case 'resolve-sub-manager-state':
      return handleResolveSubManagerState(req, res);
    case 'agent-issue-receipt':
      return handleAgentIssueReceipt(req, res);
    case 'submit-complaint-resolution':
      return handleSubmitComplaintResolution(req, res);
    case 'send-team-message':
      return handleSendTeamMessage(req, res);
    case 'complaint-feedback':
      return handleComplaintFeedback(req, res);
    case 'mirror-agent-attendance':
      return handleMirrorAgentAttendance(req, res);
    case 'list-sub-manager-accounts':
      return handleListSubManagerAccounts(req, res);
    case 'ai-insights':
      return handleAiInsights(req, res);
    case 'reset-quota':
      return handleResetQuota(req, res);
    case 'token-health':
      return handleTokenHealth(req, res);
    default:
      return res.status(400).json({ error: 'Unknown or missing ?action=. Use add-token | create-sub-manager-auth | resolve-sub-manager-state | agent-issue-receipt | list-sub-manager-accounts | reset-quota | token-health' });
  }
}

interface CallerContext { userId: string; role: string; username: string | null; }

const AI_INSIGHTS_FALLBACK = 'Local analysis: Payment collection is stable. Monitoring active subscribers.';

async function handleAiInsights(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || !['manager', 'admin', 'sub-manager'].includes(caller.role)) {
    return res.status(403).json({ error: 'Authenticated manager session required' });
  }

  try {
    const requestedManager = String(req.body?.managerId || '').trim().toLowerCase();
    let managerId = caller.username?.trim().toLowerCase() || '';
    if (caller.role === 'sub-manager') {
      const parent = await getSubManagerParent(caller);
      managerId = parent?.managerId?.trim().toLowerCase() || '';
    } else if (caller.role === 'admin') {
      managerId = requestedManager || managerId;
    } else if (requestedManager && requestedManager !== managerId) {
      return res.status(403).json({ error: 'Manager scope does not match the authenticated session' });
    }
    if (!managerId) return res.status(403).json({ error: 'Manager scope could not be resolved' });

    const rawReceipts = Array.isArray(req.body?.receipts) ? req.body.receipts.slice(-10) : [];
    if (rawReceipts.length === 0) return res.status(200).json({ insight: AI_INSIGHTS_FALLBACK, fallback: true });

    // Keep the web prompt contract while excluding customer contact/address
    // fields and arbitrary client-supplied keys from the provider payload.
    const receipts = rawReceipts.map((receipt: any) => ({
      period: String(receipt?.period || '').slice(0, 40),
      date: String(receipt?.date || '').slice(0, 40),
      status: String(receipt?.status || '').slice(0, 30),
      paidAmount: Number(receipt?.paidAmount) || 0,
      balanceAmount: Number(receipt?.balanceAmount) || 0,
      monthlyFee: Number(receipt?.monthlyFee) || 0,
      discount: Number(receipt?.discount) || 0,
      advanceAmount: Number(receipt?.advanceAmount) || 0,
      paymentMethod: String(receipt?.paymentMethod || '').slice(0, 40),
      plan: String(receipt?.plan || '').slice(0, 80),
    }));

    const response = await callGeminiWithFailover({
      contents: `Analyze these recent internet subscription payments and provide a 2-sentence summary of revenue trends: ${JSON.stringify(receipts)}`,
      config: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 120 },
    }, ['gemini-3.5-flash', ...GEMINI_FALLBACK_MODELS]);
    const insight = String(response?.text || '').trim() || AI_INSIGHTS_FALLBACK;
    return res.status(200).json({ insight, fallback: insight === AI_INSIGHTS_FALLBACK, managerId });
  } catch (error: any) {
    console.error('[ai-insights] Gemini failover exhausted:', error?.message || error);
    return res.status(200).json({ insight: AI_INSIGHTS_FALLBACK, fallback: true });
  }
}

async function getCallerContext(accessToken: string): Promise<CallerContext | null> {
  if (!accessToken) return null;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (!user?.id) return null;

    // Check the auth mapping first. Supabase may create a default profiles row
    // for a provisioned agent; if that row is checked first, the agent can be
    // misclassified as a manager and the scoped parent-state resolver returns
    // the wrong authorization result.
    const agentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(user.id)}&select=username&limit=1`,
      { headers: dbHeaders }
    );
    if (!agentRes.ok) return null;
    const agents: any[] = await agentRes.json();
    const agent = agents?.[0];
    if (agent?.username) return { userId: user.id, role: 'sub-manager', username: agent.username };

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,username`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!profileRes.ok) return null;
    const rows: any[] = await profileRes.json();
    const profile = rows?.[0];
    return profile ? { userId: user.id, role: profile.role || 'manager', username: profile.username || null } : null;
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

async function handleRevokeSubManagerAuth(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const managerUsername = String(body.manager_username || '').trim().toLowerCase();
  const subManagerUsername = String(body.sub_manager_username || '').trim().toLowerCase();
  const caller: CallerContext | undefined = req.__caller;
  if (!managerUsername || !subManagerUsername) {
    return res.status(400).json({ error: 'manager_username and sub_manager_username are required' });
  }
  if (!caller || (caller.role !== 'admin' && caller.username?.toLowerCase() !== managerUsername)) {
    return res.status(403).json({ error: 'You can only remove agents under your own manager account.' });
  }
  try {
    const rowRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?manager_id=eq.${encodeURIComponent(managerUsername)}&username=eq.${encodeURIComponent(subManagerUsername)}&select=id,auth_user_id`,
      { headers: dbHeaders }
    );
    if (!rowRes.ok) throw new Error('agent lookup failed');
    const rows: any[] = await rowRes.json();
    const authUserId = rows?.[0]?.auth_user_id;

    // Delete the sub_managers row first (so it's gone even if the auth
    // deletion below fails for any reason — fail toward "can't be found",
    // never toward "still has a working login").
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?manager_id=eq.${encodeURIComponent(managerUsername)}&username=eq.${encodeURIComponent(subManagerUsername)}`,
      { method: 'DELETE', headers: dbHeaders }
    );
    if (!delRes.ok) throw new Error('agent row deletion failed');

    // Fully revoke the Supabase Auth account itself — not just the mapping
    // row — so re-authentication is impossible, not merely unmapped.
    if (authUserId) {
      const { error } = await adminSupabase.auth.admin.deleteUser(authUserId);
      if (error) console.error('[revoke-sub-manager-auth] auth.deleteUser failed:', error.message);
    }

    return res.status(200).json({ success: true, had_auth_account: !!authUserId });
  } catch (e: any) {
    console.error('[revoke-sub-manager-auth]', e?.message);
    return res.status(500).json({ error: 'Agent could not be fully removed.' });
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

    // SECURITY: Supabase auto-creates a bare profiles row (role defaults to
    // 'manager') for every auth.users insert. Left in place, that row later
    // lets this identity be mistaken for a real manager login if the
    // sub_managers row is ever deleted or a lookup glitches. Remove it now —
    // this person's identity lives in sub_managers only, never in profiles.
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUserId}`, {
      method: 'DELETE',
      headers: dbHeaders,
    }).catch((e) => console.error('[create-sub-manager-auth] shadow profile cleanup failed:', e?.message));

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
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'manager')) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  try {
    const scopeFilter = caller.role === 'manager' ? `&manager_id=eq.${encodeURIComponent(caller.username || '')}` : '';
    const rowsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?select=id,manager_id,auth_user_id,username,name,role,assigned_area,commission_rate,contact,email,salary,duty_status,is_leave,last_check_in,last_check_out,last_location,metadata${scopeFilter}&order=manager_id.asc,username.asc`,
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

// ── Action: agent-issue-receipt ───────────────────────────────────────────────
async function getSubManagerParent(caller: CallerContext): Promise<{ managerId: string; username: string; id?: string } | null> {
  const agentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(caller.userId)}&select=id,manager_id,username&limit=1`,
    { headers: dbHeaders }
  );
  if (!agentRes.ok) throw new Error('sub-manager ownership lookup failed');
  const rows: any[] = await agentRes.json();
  const agent = rows?.[0];
  if (!agent?.manager_id || !agent.username) return null;
  return { managerId: agent.manager_id, username: agent.username, id: agent.id };
}

async function handleMirrorAgentAttendance(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || caller.role !== 'sub-manager' || !caller.username) return res.status(403).json({ error: 'Sub-manager session required' });
  const type = String(req.body?.type || '').trim();
  if (!['check-in', 'check-out', 'leave'].includes(type)) return res.status(400).json({ error: 'Invalid attendance type' });
  const timestamp = new Date().toISOString();
  const suppliedId = String(req.body?.id || '').trim();
  try {
    const parent = await getSubManagerParent(caller);
    if (!parent) return res.status(404).json({ error: 'Parent manager mapping not found.' });
    let read = await fetchParentManagerState(parent.managerId);
    if (!read) return res.status(404).json({ error: 'Parent manager data not found.' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = read.data || {};
      const logId = suppliedId || `attendance-${caller.username}-${timestamp}`;
      if ((state.attendanceLogs || []).some((entry: any) => entry?.id === logId)) return res.status(200).json({ success: true, id: logId, already_saved: true });
      const logEntry: any = {
        id: logId, subManagerId: parent.id || caller.username, type, timestamp,
        ...(req.body?.reason ? { reason: String(req.body.reason).slice(0, 500) } : {}),
        ...(req.body?.location ? { location: req.body.location } : {}),
      };
      const updatedAgents = (state.subManagers || []).map((agent: any) => {
        if (agent?.id !== parent.id && agent?.username !== caller.username) return agent;
        if (type === 'check-in') return { ...agent, dutyStatus: 'online', lastCheckIn: timestamp, isLeave: false };
        return { ...agent, dutyStatus: 'offline', lastCheckOut: timestamp, ...(type === 'leave' ? { isLeave: true } : {}) };
      });
      const updatedState = { ...state, _syncedAt: timestamp, attendanceLogs: [...(state.attendanceLogs || []), logEntry], subManagers: updatedAgents };
      const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(parent.managerId)}&updated_at=eq.${encodeURIComponent(read.updated_at)}`, {
        method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ data: updatedState, updated_at: timestamp }),
      });
      if (!writeRes.ok) return res.status(500).json({ error: 'Attendance history could not be saved.' });
      const writtenRows: any[] = await writeRes.json().catch(() => []);
      if (writtenRows.length > 0) return res.status(200).json({ success: true, id: logId, timestamp });
      if (attempt === 0) { read = await fetchParentManagerState(parent.managerId); if (!read) return res.status(500).json({ error: 'Parent manager data could not be reloaded.' }); continue; }
      return res.status(409).json({ error: 'Attendance changed while saving. Please retry.' });
    }
    return res.status(409).json({ error: 'Attendance changed while saving. Please retry.' });
  } catch (error: any) {
    console.error('[mirror-agent-attendance]', error?.message);
    return res.status(500).json({ error: 'Attendance history could not be saved.' });
  }
}

async function handleComplaintFeedback(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || !['manager', 'admin', 'sub-manager'].includes(caller.role)) return res.status(403).json({ error: 'Authenticated team session required' });
  const ticketId = String(req.body?.ticketId || '').trim();
  if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });
  try {
    const parent = caller.role === 'sub-manager' ? await getSubManagerParent(caller) : null;
    const managerId = parent?.managerId || caller.username;
    if (!managerId) return res.status(403).json({ error: 'Manager scope could not be resolved.' });
    let read = await fetchParentManagerState(managerId);
    if (!read) return res.status(404).json({ error: 'Manager data not found.' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = read.data || {};
      const ticket = (state.complaintTickets || []).find((candidate: any) => candidate?.id === ticketId);
      if (!ticket) return res.status(404).json({ error: 'Complaint ticket not found.' });
      if (ticket.status !== 'pending_manager_review') return res.status(409).json({ error: 'Feedback is available only after a resolution is submitted.' });
      if (ticket.feedbackStatus && ticket.feedbackStatus !== 'pending') return res.status(200).json({ success: true, status: ticket.feedbackStatus, skipped: ticket.feedbackStatus !== 'sent' });
      const now = new Date().toISOString();
      const notifyManual = (reason: string) => ({
        id: `complaint-feedback-${ticketId}-${Date.now()}`,
        type: 'COMPLAINT_FEEDBACK_SKIPPED', priority: 'MEDIUM',
        title: 'Customer Feedback Needs Manual Follow-up',
        message: `NetBot did not send feedback for "${ticket.title}": ${reason}`,
        timestamp: now, actionLabel: 'Review', actionTab: 'complaints',
      });
      let ticketUpdate: any = {};
      let feedbackResult: any = { success: true, status: 'skipped_window', skipped: true };
      let notification: any = null;
      const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.${encodeURIComponent(managerId)}&select=service_status&limit=1`, { headers: dbHeaders });
      const cfgRows: any[] = cfgRes.ok ? await cfgRes.json() : [];
      const botEnabled = ['active', 'trial'].includes(cfgRows?.[0]?.service_status);
      const inboundAt = ticket.customerLastInboundAt ? new Date(ticket.customerLastInboundAt).getTime() : NaN;
      const ageMs = Date.now() - inboundAt;
      if (!botEnabled) {
        ticketUpdate = { feedbackStatus: 'not_configured', feedbackError: 'NetBot is not active for this manager.' };
        notification = notifyManual('NetBot is not active for this manager.');
      } else if (!ticket.customerPhone || !Number.isFinite(inboundAt) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
        ticketUpdate = { feedbackStatus: 'skipped_window', feedbackError: 'Customer WhatsApp 24-hour window is not open.' };
        notification = notifyManual('the customer WhatsApp 24-hour window is closed.');
      } else {
        const token = process.env.WHATSAPP_TOKEN;
        const phoneId = process.env.PHONE_NUMBER_ID;
        const phone = String(ticket.customerPhone).replace(/\D/g, '').slice(-10);
        const body = `Assalam o Alaikum ${ticket.customerName || ''}, aap ki complaint par team ne kaam complete kar diya hai. Kya masla theek ho gaya?\n\n1 - Ji haan\n2 - Abhi masla hai\n\nAap ka feedback hamare liye aham hai.`.trim();
        if (!token || !phoneId || phone.length !== 10) {
          ticketUpdate = { feedbackStatus: 'failed', feedbackError: 'WhatsApp configuration or customer phone is unavailable.' };
          notification = notifyManual('WhatsApp configuration or customer phone is unavailable.');
        } else {
          const sendRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body } }) });
          const responseBody = await sendRes.json().catch(() => ({}));
          if (!sendRes.ok) {
            const errorText = JSON.stringify(responseBody).slice(0, 300);
            ticketUpdate = { feedbackStatus: 'failed', feedbackError: errorText };
            notification = notifyManual('Meta rejected the feedback message.');
            console.error('[complaint-feedback] Meta rejected:', errorText);
          } else {
            const wamid = responseBody?.messages?.[0]?.id || null;
            await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, { method: 'POST', headers: { ...dbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ manager_id: managerId, customer_phone: phone, direction: 'out', type: 'text', content: body, media_url: null, wa_message_id: wamid }) });
            ticketUpdate = { feedbackStatus: 'sent', feedbackSentAt: now, feedbackError: undefined };
            feedbackResult = { success: true, status: 'sent', skipped: false };
          }
        }
      }
      const updatedTicket = { ...ticket, ...ticketUpdate };
      const updatedState = { ...state, _syncedAt: now, complaintTickets: (state.complaintTickets || []).map((candidate: any) => candidate.id === ticketId ? updatedTicket : candidate), ...(notification ? { pendingManagerNotifications: [...(state.pendingManagerNotifications || []), notification] } : {}) };
      const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(managerId)}&updated_at=eq.${encodeURIComponent(read.updated_at)}`, { method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ data: updatedState, updated_at: now }) });
      if (!writeRes.ok) return res.status(500).json({ error: 'Feedback status could not be saved.' });
      const writtenRows: any[] = await writeRes.json().catch(() => []);
      if (writtenRows.length > 0) return res.status(200).json({ ...feedbackResult, ticket: updatedTicket });
      if (attempt === 0) { read = await fetchParentManagerState(managerId); if (!read) return res.status(500).json({ error: 'Manager data could not be reloaded.' }); continue; }
      return res.status(409).json({ error: 'The complaint changed while saving. Please retry.' });
    }
    return res.status(409).json({ error: 'The complaint changed while saving. Please retry.' });
  } catch (error: any) {
    console.error('[complaint-feedback]', error?.message);
    return res.status(500).json({ error: 'Feedback automation could not be completed.' });
  }
}

async function handleSubmitComplaintResolution(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || caller.role !== 'sub-manager' || !caller.username) return res.status(403).json({ error: 'Sub-manager session required' });
  const ticketId = String(req.body?.ticketId || '').trim();
  const resolutionDetails = String(req.body?.resolutionDetails || '').trim();
  if (!ticketId || !resolutionDetails) return res.status(400).json({ error: 'ticketId and resolutionDetails are required' });
  try {
    const parent = await getSubManagerParent(caller);
    if (!parent) return res.status(404).json({ error: 'Parent manager mapping not found.' });
    let read = await fetchParentManagerState(parent.managerId);
    if (!read) return res.status(404).json({ error: 'Parent manager data not found.' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = read.data || {};
      const ticket = (state.complaintTickets || []).find((candidate: any) => candidate?.id === ticketId);
      if (!ticket) return res.status(404).json({ error: 'Complaint ticket not found.' });
      const assigned = ticket.assignedTo === caller.username || ticket.assignedTo === parent.id;
      if (!assigned) return res.status(403).json({ error: 'This complaint is not assigned to your account.' });
      if (!['assigned', 'revision_required'].includes(ticket.status)) return res.status(409).json({ error: 'This complaint is not ready for a new resolution submission.' });
      const now = new Date().toISOString();
      const updatedTicket = { ...ticket, status: 'pending_manager_review', resolutionDetails, resolvedAt: now, resolvedBy: caller.username, feedbackStatus: ticket.feedbackStatus || 'pending' };
      const reviewNotification = {
        id: `complaint-review-${ticketId}-${Date.now()}`,
        type: 'COMPLAINT_REVIEW_REQUIRED', priority: 'HIGH',
        title: 'Complaint Resolution Needs Review',
        message: `${caller.username} submitted a resolution for "${ticket.title}" (${ticket.customerName}).`,
        timestamp: now, actionLabel: 'Review', actionTab: 'complaints',
      };
      const updatedState = {
        ...state,
        _syncedAt: now,
        complaintTickets: (state.complaintTickets || []).map((candidate: any) => candidate.id === ticketId ? updatedTicket : candidate),
        pendingManagerNotifications: [...(state.pendingManagerNotifications || []), reviewNotification],
      };
      const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(parent.managerId)}&updated_at=eq.${encodeURIComponent(read.updated_at)}`, {
        method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ data: updatedState, updated_at: now }),
      });
      if (!writeRes.ok) return res.status(500).json({ error: 'Complaint resolution could not be saved.' });
      const writtenRows: any[] = await writeRes.json().catch(() => []);
      if (writtenRows.length > 0) return res.status(200).json({ success: true, manager_id: parent.managerId, agent_username: caller.username, ticket: updatedTicket });
      if (attempt === 0) { read = await fetchParentManagerState(parent.managerId); if (!read) return res.status(500).json({ error: 'Parent manager data could not be reloaded.' }); continue; }
      return res.status(409).json({ error: 'The complaint changed while saving. Please retry.' });
    }
    return res.status(409).json({ error: 'The complaint changed while saving. Please retry.' });
  } catch (error: any) {
    console.error('[submit-complaint-resolution]', error?.message);
    return res.status(500).json({ error: 'Complaint resolution could not be saved.' });
  }
}

async function handleSendTeamMessage(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller: CallerContext | undefined = req.__caller;
  if (!caller || caller.role !== 'sub-manager' || !caller.username) return res.status(403).json({ error: 'Sub-manager session required' });
  const text = String(req.body?.text || '').trim();
  const voiceUrl = String(req.body?.voiceUrl || '').trim();
  const voiceMimeType = String(req.body?.voiceMimeType || '').trim();
  if (!text && !voiceUrl) return res.status(400).json({ error: 'text or voiceUrl is required' });
  try {
    const parent = await getSubManagerParent(caller);
    if (!parent) return res.status(404).json({ error: 'Parent manager mapping not found.' });
    let read = await fetchParentManagerState(parent.managerId);
    if (!read) return res.status(404).json({ error: 'Parent manager data not found.' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = read.data || {};
      const now = new Date().toISOString();
      const message = { id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, managerUsername: parent.managerId, senderUsername: caller.username, senderRole: 'sub-manager', recipientUsername: parent.managerId, ...(text ? { text } : {}), ...(voiceUrl ? { voiceUrl, voiceMimeType: voiceMimeType || 'audio/webm' } : {}), createdAt: now };
      const managerNotification = { id: `team-message-${message.id}`, type: 'TEAM_MESSAGE', priority: 'LOW', title: `New message from @${caller.username}`, message: text ? text.slice(0, 120) : 'You received a voice note.', timestamp: now, actionLabel: 'Open Team Hub', actionTab: 'team' };
      const updatedState = { ...state, _syncedAt: now, teamMessages: [...(state.teamMessages || []), message], pendingManagerNotifications: [...(state.pendingManagerNotifications || []), managerNotification] };
      const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(parent.managerId)}&updated_at=eq.${encodeURIComponent(read.updated_at)}`, {
        method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ data: updatedState, updated_at: now }),
      });
      if (!writeRes.ok) return res.status(500).json({ error: 'Team message could not be saved.' });
      const writtenRows: any[] = await writeRes.json().catch(() => []);
      if (writtenRows.length > 0) return res.status(200).json({ success: true, manager_id: parent.managerId, message });
      if (attempt === 0) { read = await fetchParentManagerState(parent.managerId); if (!read) return res.status(500).json({ error: 'Parent manager data could not be reloaded.' }); continue; }
      return res.status(409).json({ error: 'The team channel changed while saving. Please retry.' });
    }
    return res.status(409).json({ error: 'The team channel changed while saving. Please retry.' });
  } catch (error: any) {
    console.error('[send-team-message]', error?.message);
    return res.status(500).json({ error: 'Team message could not be saved.' });
  }
}

// Real-auth sub-managers may issue a receipt only while checked in. The parent
// manager_data row is read and conditionally patched by updated_at so a stale
// read can never silently erase another manager/agent write.
async function handleAgentIssueReceipt(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller: CallerContext | undefined = req.__caller;
  if (!caller || caller.role !== 'sub-manager' || !caller.username) {
    return res.status(403).json({ error: 'Sub-manager session required' });
  }

  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const paidAmount = Number(body.paidAmount);
  const advanceAmount = body.advanceAmount === undefined ? 0 : Number(body.advanceAmount);
  const discountInput = body.discount === undefined ? undefined : Number(body.discount);
  const paymentMethod = String(body.paymentMethod || 'Cash').trim();
  const description = body.description === undefined || body.description === null ? '' : String(body.description);
  const paymentDateInput = body.paymentDate || body.date;
  const requestedTransactionRef = String(body.transactionRef || '').trim();

  if (!userId || !Number.isFinite(paidAmount) || paidAmount < 0 || !Number.isFinite(advanceAmount) || advanceAmount < 0) {
    return res.status(400).json({ error: 'userId, paidAmount and valid payment amounts are required' });
  }
  if (discountInput !== undefined && !Number.isFinite(discountInput)) {
    return res.status(400).json({ error: 'discount must be a valid number' });
  }

  try {
    const checkedIn = await adminSupabase.rpc('agent_is_checked_in', { p_auth_uid: caller.userId });
    if (checkedIn.error) {
      console.error('[agent-issue-receipt] attendance check failed:', checkedIn.error.message);
      return res.status(500).json({ error: 'Could not verify attendance. Please try again.' });
    }
    if (checkedIn.data !== true) {
      return res.status(403).json({ error: 'You must check in before issuing receipts' });
    }

    const agentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sub_managers?auth_user_id=eq.${encodeURIComponent(caller.userId)}&select=manager_id,username,assigned_area&limit=1`,
      { headers: dbHeaders }
    );
    if (!agentRes.ok) throw new Error('sub-manager ownership lookup failed');
    const agents: any[] = await agentRes.json();
    const agent = agents?.[0];
    if (!agent?.manager_id || agent.username !== caller.username) {
      return res.status(401).json({ error: 'Sub-manager account mapping not found' });
    }

    let read = await fetchParentManagerState(agent.manager_id);
    if (!read) return res.status(404).json({ error: 'Parent manager data not found.' });

    for (let attempt = 0; attempt < 2; attempt++) {
      const state = read.data || {};
      const settings = getReceiptSettings(state);
      const currentMonthLabel = getCurrentMonthLabel();
      const user = (state.users || []).find((candidate: any) => String(candidate?.id) === userId);
      if (!user) return res.status(400).json({ error: 'Customer was not found in the parent manager data.' });

      const agentState = (state.subManagers || []).find((candidate: any) => candidate?.username === caller.username) || {};
      if (!isCurrentMonthPendingUser(state, user, currentMonthLabel, agent, agentState, settings)) {
        return res.status(attempt === 0 ? 400 : 409).json({
          error: attempt === 0
            ? 'This customer is not currently pending for the current month.'
            : 'The customer changed while saving. Please retry.',
        });
      }

      const built = buildAgentReceipt({
        state,
        user,
        settings,
        currentMonthLabel,
        collectedBy: caller.username,
        paidAmount,
        advanceAmount,
        discount: discountInput,
        paymentMethod,
        description,
        paymentDateInput,
        requestedTransactionRef,
      });

      const updatedUsers = (state.users || []).map((candidate: any) => candidate?.id === user.id ? built.updatedUser : candidate);
      const receiptLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        action: 'PAYMENT_COLLECTED',
        description: `Receipt: @${built.receipt.username} — Rs. ${(built.receipt.paidAmount || 0).toLocaleString()} for ${built.receipt.period}`,
        performedBy: caller.username,
        category: 'payment',
      };
      const updatedState = {
        ...state,
        _syncedAt: new Date().toISOString(),
        receipts: [...(state.receipts || []), built.receipt],
        users: updatedUsers,
        systemLogs: [receiptLog, ...(state.systemLogs || [])].slice(0, 500),
      };
      const writeTimestamp = new Date().toISOString();
      const writeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(agent.manager_id)}&updated_at=eq.${encodeURIComponent(read.updated_at)}`,
        {
          method: 'PATCH',
          headers: { ...dbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ data: updatedState, updated_at: writeTimestamp }),
        }
      );
      if (!writeRes.ok) {
        const detail = await writeRes.text();
        console.error('[agent-issue-receipt] conditional write failed:', detail.slice(0, 300));
        return res.status(500).json({ error: 'Receipt could not be saved.' });
      }
      const writtenRows: any[] = await writeRes.json().catch(() => []);
      if (writtenRows.length > 0) {
        return res.status(200).json({ success: true, receipt: built.receipt, user: built.updatedUser });
      }

      // Someone wrote the shared JSONB blob after our read. Re-fetch and apply
      // the receipt operation once against that fresh state; never overwrite it.
      if (attempt === 0) {
        read = await fetchParentManagerState(agent.manager_id);
        if (!read) return res.status(500).json({ error: 'The parent manager data could not be reloaded. Please retry.' });
        continue;
      }
      return res.status(409).json({ error: 'The manager data changed while saving. Please retry.' });
    }

    return res.status(409).json({ error: 'The manager data changed while saving. Please retry.' });
  } catch (e: any) {
    console.error('[agent-issue-receipt]', e?.message);
    return res.status(500).json({ error: 'Receipt could not be issued.' });
  }
}

async function fetchParentManagerState(managerId: string): Promise<{ data: any; updated_at: string } | null> {
  const stateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${encodeURIComponent(managerId)}&select=data,updated_at&limit=1`,
    { headers: dbHeaders }
  );
  if (!stateRes.ok) throw new Error('parent manager state lookup failed');
  const rows: any[] = await stateRes.json();
  const row = rows?.[0];
  if (!row?.data || !row?.updated_at) return null;
  return { data: row.data, updated_at: row.updated_at };
}

function getCurrentMonthLabel(): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
}

function getReceiptSettings(state: any): any {
  const activeCompany = (state.companies || []).find((company: any) => company?.id === state.activeCompanyId) || (state.companies || [])[0];
  return activeCompany?.settings || state.settings || { planPrices: {} };
}

function parseMonthYear(value: string): Date | null {
  if (!value) return null;
  const parts = String(value).trim().split(' ');
  if (parts.length < 2) return null;
  const date = new Date(`${parts[0]} 1, ${parts[1]}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCurrentMonthPendingUser(state: any, user: any, currentMonthLabel: string, agent: any, agentState: any, settings: any): boolean {
  if (user.status !== 'active') return false;

  const assignedAreas = Array.isArray(agentState.assignedAreas) ? agentState.assignedAreas : [];
  if (assignedAreas.length > 0 && !assignedAreas.includes(user.area || '')) return false;
  const agentArea = agent.assigned_area || agentState.area;
  if (agentArea && user.area && user.area !== agentArea) return false;

  const receipts = (state.receipts || []).filter((receipt: any) => receipt?.userId === user.id);
  const isActivatedForThisMonth = (user.activatedMonths || []).includes(currentMonthLabel);
  const hasReceiptForThisMonth = receipts.some((receipt: any) => receipt?.period === currentMonthLabel);
  if (!isActivatedForThisMonth && !hasReceiptForThisMonth) return false;

  const hasPaidForCurrentMonth = receipts.some((receipt: any) => receipt?.period === currentMonthLabel && receipt?.status === 'Success');
  const previousMonthDate = new Date();
  previousMonthDate.setDate(1);
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(previousMonthDate);
  const previousMonthReceipts = receipts.filter((receipt: any) => receipt?.period === previousMonthLabel);
  const previousMonthLatest = previousMonthReceipts.length > 0
    ? [...previousMonthReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : null;
  const anyPreviousReceipt = previousMonthLatest
    ? previousMonthLatest
    : [...receipts]
        .filter((receipt: any) => receipt?.period !== currentMonthLabel)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
  const arrears = anyPreviousReceipt ? (anyPreviousReceipt.balanceAmount || 0) : (user.balance || 0);
  const planPrice = settings?.planPrices?.[user.plan || ''] || 1500;
  const totalOutstanding = (planPrice + Math.max(0, arrears)) - (user.persistentDiscount || 0);
  void totalOutstanding; // retained to mirror the dashboard's displayStatus calculation exactly
  const isClear = hasPaidForCurrentMonth || arrears < 0;
  return !isClear;
}

function buildAgentReceipt(args: any): { receipt: any; updatedUser: any } {
  const { state, user, settings, currentMonthLabel, collectedBy, paidAmount, advanceAmount, discount, paymentMethod, description, paymentDateInput, requestedTransactionRef } = args;
  const fee = settings?.planPrices?.[user.plan] !== undefined ? settings.planPrices[user.plan] : (user.monthlyFee || 0);
  const userReceipts = (state.receipts || []).filter((receipt: any) => receipt?.userId === user.id);
  const currentBillingPeriod = currentMonthLabel;
  const previousReceipts = [...userReceipts]
    .filter((receipt: any) => receipt?.period && receipt.period !== currentBillingPeriod)
    .sort((a, b) => {
      const dateA = parseMonthYear(a.period);
      const dateB = parseMonthYear(b.period);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  const latestPreviousReceipt = previousReceipts.length > 0 ? previousReceipts[0] : null;
  const lastReceiptBalance = latestPreviousReceipt ? (latestPreviousReceipt.balanceAmount || 0) : (user.balance || 0);
  let missedMonthsArrears = 0;
  if (latestPreviousReceipt?.period) {
    const currentDate = parseMonthYear(currentBillingPeriod);
    const lastDate = parseMonthYear(latestPreviousReceipt.period);
    if (currentDate && lastDate && currentDate > lastDate) {
      const cursor = new Date(lastDate);
      cursor.setMonth(cursor.getMonth() + 1);
      while (cursor < currentDate) {
        const monthName = cursor.toLocaleString('en-US', { month: 'long' });
        const monthPeriod = `${monthName} ${cursor.getFullYear()}`;
        const hasPaid = userReceipts.some((receipt: any) => receipt?.period === monthPeriod);
        if (!hasPaid) missedMonthsArrears += fee;
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }
  const balance = lastReceiptBalance + missedMonthsArrears;
  const resolvedDiscount = discount === undefined ? (user.persistentDiscount || 0) : discount;
  const totalPayable = (fee + balance) - resolvedDiscount;
  const calculatedBalance = totalPayable - (paidAmount + advanceAmount);
  const receiptDate = paymentDateInput && !Number.isNaN(new Date(paymentDateInput).getTime()) ? new Date(paymentDateInput) : new Date();
  const configuredExpiryDate = user.expiryDate;
  const parsedExpiryDate = configuredExpiryDate ? new Date(configuredExpiryDate) : null;
  const hasValidConfiguredExpiry = !!parsedExpiryDate && !Number.isNaN(parsedExpiryDate.getTime());
  const resolvedExpiryDate = hasValidConfiguredExpiry ? configuredExpiryDate : new Date().toISOString();
  const resolvedRechargeDate = hasValidConfiguredExpiry ? parsedExpiryDate!.toISOString() : new Date().toISOString();
  const existingRefs = new Set<string>((state.receipts || []).map((receipt: any) => receipt?.transactionRef).filter(Boolean));
  const transactionRef = resolveTransactionRef(settings, state.receipts || [], requestedTransactionRef, existingRefs);
  const receipt = {
    id: generateReceiptId(),
    userId: user.id,
    username: user.username,
    userName: user.name,
    userPhone: user.phone,
    userAddress: user.address,
    totalAmount: totalPayable || 0,
    paidAmount: (paidAmount || 0) + (advanceAmount || 0),
    balanceAmount: calculatedBalance || 0,
    advanceAmount: advanceAmount || 0,
    discount: resolvedDiscount || 0,
    monthlyFee: fee || 0,
    plan: user.plan || '',
    date: receiptDate.toISOString(),
    expiryDate: resolvedExpiryDate,
    rechargeDate: resolvedRechargeDate,
    period: currentMonthLabel,
    paymentMethod,
    status: 'Success',
    transactionRef,
    description,
    collectedBy,
    companyId: state.activeCompanyId,
  };
  const activatedMonths = user.activatedMonths || [];
  const updatedUser = {
    ...user,
    lastPaymentDate: receiptDate.toISOString(),
    expiryDate: resolvedExpiryDate,
    status: 'active',
    balance: calculatedBalance || 0,
    persistentDiscount: resolvedDiscount || 0,
    activatedMonths: activatedMonths.includes(currentMonthLabel) ? activatedMonths : [...activatedMonths, currentMonthLabel],
    creditRecharge: false,
    creditAmount: 0,
    creditDate: null,
    creditLastReminderSent: null,
    creditReminderCount: 0,
  };
  return { receipt, updatedUser };
}

function generateReceiptId(): string {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

function resolveTransactionRef(settings: any, receipts: any[], requested: string, existingRefs: Set<string>): string {
  const prefix = settings?.receiptSerialPrefix || 'MN';
  const startFrom = settings?.receiptSerialStart || 1;
  const padLength = Math.max(4, String(startFrom).length);
  if (requested && !existingRefs.has(requested)) return requested;
  let offset = receipts.length;
  let candidate = '';
  do {
    candidate = `${prefix}-${String(startFrom + offset).padStart(padLength, '0')}`;
    offset += 1;
  } while (existingRefs.has(candidate));
  return candidate;
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
