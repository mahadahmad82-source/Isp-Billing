import { supabase } from '../lib/supabase';
import { AppState } from '../types';

export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId) return;

  const userCount    = state?.users?.length    || 0;
  const receiptCount = state?.receipts?.length || 0;

  // Safety: never overwrite real data with empty state
  if (userCount === 0 && receiptCount === 0) {
    try {
      const { data: existing } = await supabase
        .from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
      const existingUsers    = (existing?.data as any)?.users?.length    || 0;
      const existingReceipts = (existing?.data as any)?.receipts?.length || 0;
      if (existingUsers > 0 || existingReceipts > 0) {
        console.warn(`[Supabase] BLOCKED empty save for ${managerId}`);
        return;
      }
    } catch (e) {
      console.error('[Supabase] Safety check failed:', e);
      return;
    }
  }

  // Stamp the state with current save time before pushing
  const stateWithTimestamp = { ...state, _syncedAt: new Date().toISOString() };

  try {
    const { error } = await supabase
      .from('manager_data')
      .upsert(
        { manager_id: managerId, data: stateWithTimestamp, updated_at: new Date().toISOString() },
        { onConflict: 'manager_id' }
      );
    if (error) {
      console.error('[Supabase] Save error:', error.message);
    } else {
      // Also store local sync timestamp so smartLoadAndSync can compare
      localStorage.setItem(`${managerId}_syncedAt`, stateWithTimestamp._syncedAt);
      console.log(`[Supabase] Saved OK at ${stateWithTimestamp._syncedAt}`);
    }
  } catch (err) {
    console.error('[Supabase] Save exception:', err);
  }
};

export const loadStateFromSupabase = async (managerId: string): Promise<AppState | null> => {
  if (!managerId) return null;
  try {
    const { data, error } = await supabase
      .from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
    if (error) { console.error('[Supabase] Load error:', error.message); return null; }
    return (data?.data as AppState) || null;
  } catch (err) {
    console.error('[Supabase] Load exception:', err);
    return null;
  }
};

export const smartLoadAndSync = async (
  managerId: string,
  localState: AppState
): Promise<AppState> => {
  const supabaseState = await loadStateFromSupabase(managerId);

  const localUsers     = localState?.users?.length     || 0;
  const localReceipts  = localState?.receipts?.length  || 0;
  const remoteUsers    = supabaseState?.users?.length    || 0;
  const remoteReceipts = supabaseState?.receipts?.length || 0;
  const localScore     = localUsers  + localReceipts;
  const remoteScore    = remoteUsers + remoteReceipts;

  // ── Timestamp-based comparison (most recently saved wins) ──
  const localTs  = new Date((localState as any)?._syncedAt  || localStorage.getItem(`${managerId}_syncedAt`) || 0).getTime();
  const remoteTs = new Date((supabaseState as any)?._syncedAt || 0).getTime();

  console.log(`[Sync] Local: ${localUsers}u ${localReceipts}r @${new Date(localTs).toISOString()}`);
  console.log(`[Sync] Supabase: ${remoteUsers}u ${remoteReceipts}r @${new Date(remoteTs).toISOString()}`);

  // No Supabase data at all → use local and push up
  if (!supabaseState || remoteScore === 0) {
    if (localScore > 0) {
      console.log('[Sync] Supabase empty — pushing local up');
      await saveStateToSupabase(managerId, localState);
    }
    return localState;
  }

  // Supabase is newer or same time → always use Supabase
  if (remoteTs >= localTs) {
    console.log('[Sync] Supabase is newer — using Supabase');
    return {
      ...supabaseState,
      users:                    supabaseState.users                    || [],
      receipts:                 supabaseState.receipts                 || [],
      archives:                 supabaseState.archives                 || [],
      companies:                supabaseState.companies                || [],
      subManagers:              supabaseState.subManagers              || [],
      attendanceLogs:           supabaseState.attendanceLogs           || [],
      complaintTickets:         supabaseState.complaintTickets         || [],
      businessExpenses:         supabaseState.businessExpenses         || [],
      activeCompanyId:          supabaseState.activeCompanyId          || '',
      dismissedNotificationIds: supabaseState.dismissedNotificationIds || [],
      currentManager:           managerId,
    };
  }

  // Local is newer → push local to Supabase
  console.log('[Sync] Local is newer — pushing local to Supabase');
  await saveStateToSupabase(managerId, localState);
  return localState;
};
