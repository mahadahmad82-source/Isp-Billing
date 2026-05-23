import { supabase } from '../lib/supabase';
import { AppState } from '../types';

// ─── Save state to Supabase ────────────────────────────────────────────────────
export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId) return;
  try {
    const { error } = await supabase
      .from('manager_data')
      .upsert(
        { manager_id: managerId, data: state, updated_at: new Date().toISOString() },
        { onConflict: 'manager_id' }
      );
    if (error) console.warn('[Supabase] Save error:', error.message);
  } catch (err) {
    console.warn('[Supabase] Save exception:', err);
  }
};

// ─── Load state from Supabase ──────────────────────────────────────────────────
export const loadStateFromSupabase = async (managerId: string): Promise<AppState | null> => {
  if (!managerId) return null;
  try {
    const { data, error } = await supabase
      .from('manager_data')
      .select('data')
      .eq('manager_id', managerId)
      .single();

    if (error || !data) return null;
    return data.data as AppState;
  } catch (err) {
    console.warn('[Supabase] Load exception:', err);
    return null;
  }
};

// ─── Smart Load & Sync ────────────────────────────────────────────────────────
// LOGIC:
// 1. Always fetch from Supabase
// 2. Compare by receipts count — whichever is MORE wins
// 3. Save winner back to Supabase so all devices stay in sync
export const smartLoadAndSync = async (
  managerId: string,
  localState: AppState
): Promise<AppState> => {

  const supabaseState = await loadStateFromSupabase(managerId);

  const localReceipts = localState?.receipts?.length || 0;
  const localUsers = localState?.users?.length || 0;
  const remoteReceipts = supabaseState?.receipts?.length || 0;
  const remoteUsers = supabaseState?.users?.length || 0;

  console.log(`[Sync] LOCAL: ${localUsers} users, ${localReceipts} receipts`);
  console.log(`[Sync] SUPABASE: ${remoteUsers} users, ${remoteReceipts} receipts`);

  // Case 1: Local has MORE data (e.g. phone has new invoices not yet synced)
  if (localReceipts > remoteReceipts || localUsers > remoteUsers) {
    console.log('[Sync] LOCAL wins — saving to Supabase');
    await saveStateToSupabase(managerId, localState);
    return {
      ...localState,
      users: localState.users || [],
      receipts: localState.receipts || [],
      archives: localState.archives || [],
      companies: localState.companies || [],
      subManagers: (localState as any).subManagers || [],
      attendanceLogs: (localState as any).attendanceLogs || [],
      activeCompanyId: localState.activeCompanyId || '',
      dismissedNotificationIds: localState.dismissedNotificationIds || [],
      currentManager: managerId,
    };
  }

  // Case 2: Supabase has MORE or equal data (new browser / another device)
  if (supabaseState) {
    console.log('[Sync] SUPABASE wins — loading cloud data');
    // Also update localStorage so offline works next time
    try {
      localStorage.setItem(`mahadnet_data_${managerId}`, JSON.stringify(supabaseState));
    } catch {}
    return {
      ...supabaseState,
      users: supabaseState.users || [],
      receipts: supabaseState.receipts || [],
      archives: supabaseState.archives || [],
      companies: supabaseState.companies || [],
      subManagers: (supabaseState as any).subManagers || [],
      attendanceLogs: (supabaseState as any).attendanceLogs || [],
      activeCompanyId: supabaseState.activeCompanyId || '',
      dismissedNotificationIds: supabaseState.dismissedNotificationIds || [],
      currentManager: managerId,
    };
  }

  // Case 3: Supabase empty — save local to cloud
  console.log('[Sync] Supabase empty — uploading local data');
  if (localReceipts > 0 || localUsers > 0) {
    await saveStateToSupabase(managerId, localState);
  }
  return {
    ...localState,
    currentManager: managerId,
  };
};

// ─── Find agent's manager from Supabase ───────────────────────────────────────
// Used by agent login — searches all managers' subManagers list
export const findAgentManager = async (
  username: string,
  password: string
): Promise<{ agentUsername: string; managerUsername: string; agentInfo: any } | null> => {
  try {
    const { data: managers, error } = await supabase
      .from('manager_data')
      .select('manager_id, data');

    if (error || !managers) return null;

    for (const manager of managers) {
      const subManagers = (manager.data as any)?.subManagers || [];
      const agent = subManagers.find((sm: any) => {
        const uMatch =
          (sm.username || '').toLowerCase() === username.toLowerCase() ||
          (sm.email || '').toLowerCase() === username.toLowerCase() ||
          (sm.phone || '') === username ||
          (sm.id || '').toLowerCase() === username.toLowerCase();
        const pMatch = (sm.password || '') === password;
        return uMatch && pMatch;
      });

      if (agent) {
        return {
          agentUsername: agent.username || agent.id,
          managerUsername: manager.manager_id,
          agentInfo: agent,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('[Supabase] findAgentManager error:', err);
    return null;
  }
};
