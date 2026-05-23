import { supabase } from '../lib/supabase';
import { AppState } from '../types';

// ─── Save to Supabase ──────────────────────────────────────────────────────────
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

// ─── Load from Supabase ────────────────────────────────────────────────────────
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

// ─── Smart Load & Sync ─────────────────────────────────────────────────────────
// SAFE MIGRATION LOGIC:
// Step 1: Check localStorage for existing data (old browsers with saved data)
// Step 2: Compare localStorage vs Supabase — whichever has MORE records wins
// Step 3: Save winner to Supabase
// Step 4: Clear localStorage (migration complete, Supabase is now source of truth)
export const smartLoadAndSync = async (
  managerId: string,
  localState: AppState
): Promise<AppState> => {

  // Pull from Supabase
  const supabaseState = await loadStateFromSupabase(managerId);

  const localReceipts  = localState?.receipts?.length  || 0;
  const localUsers     = localState?.users?.length     || 0;
  const remoteReceipts = supabaseState?.receipts?.length || 0;
  const remoteUsers    = supabaseState?.users?.length    || 0;

  console.log(`[Sync] LOCAL: ${localUsers} users, ${localReceipts} receipts`);
  console.log(`[Sync] SUPABASE: ${remoteUsers} users, ${remoteReceipts} receipts`);

  let winner: AppState;

  if (localReceipts > remoteReceipts || localUsers > remoteUsers) {
    // LOCAL has more data — migrate it to Supabase NOW
    console.log('[Sync] LOCAL has more data — migrating to Supabase...');
    winner = { ...localState, currentManager: managerId };
    await saveStateToSupabase(managerId, winner);
    console.log('[Sync] Migration complete!');
  } else if (supabaseState) {
    // SUPABASE has more or equal data — use it
    console.log('[Sync] SUPABASE is source of truth');
    winner = {
      ...supabaseState,
      users:                       supabaseState.users || [],
      receipts:                    supabaseState.receipts || [],
      archives:                    supabaseState.archives || [],
      companies:                   supabaseState.companies || [],
      subManagers:                 (supabaseState as any).subManagers || [],
      attendanceLogs:              (supabaseState as any).attendanceLogs || [],
      activeCompanyId:             supabaseState.activeCompanyId || '',
      dismissedNotificationIds:    supabaseState.dismissedNotificationIds || [],
      currentManager:              managerId,
    };
  } else {
    // Nothing in Supabase yet — push local data
    console.log('[Sync] Nothing in Supabase — uploading local data');
    winner = { ...localState, currentManager: managerId };
    if (localUsers > 0 || localReceipts > 0) {
      await saveStateToSupabase(managerId, winner);
    }
  }

  // Clear localStorage after successful Supabase sync (safe migration)
  try {
    const LOCAL_KEYS = ['mahadnet_data_', `mahadnet_data_${managerId}`];
    LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
    // Also clear any other manager data keys for this manager
    Object.keys(localStorage)
      .filter(k => k.startsWith('mahadnet_data_'))
      .forEach(k => {
        if (k === `mahadnet_data_${managerId}`) localStorage.removeItem(k);
      });
  } catch {}

  return winner;
};

// ─── Find agent's manager from Supabase ───────────────────────────────────────
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
          (sm.email    || '').toLowerCase() === username.toLowerCase() ||
          (sm.phone    || '')               === username               ||
          (sm.id       || '').toLowerCase() === username.toLowerCase();
        const pMatch = (sm.password || '') === password;
        return uMatch && pMatch;
      });

      if (agent) {
        return {
          agentUsername:   agent.username || agent.id,
          managerUsername: manager.manager_id,
          agentInfo:       agent,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('[Supabase] findAgentManager error:', err);
    return null;
  }
};
