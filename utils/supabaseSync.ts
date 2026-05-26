import { supabase } from '../lib/supabase';
import { AppState } from '../types';

export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId) return;

  // ✅ SAFETY: Never save empty/corrupt state to Supabase
  const userCount = state?.users?.length || 0;
  const receiptCount = state?.receipts?.length || 0;

  // If state looks empty, check what's in Supabase first
  if (userCount === 0 && receiptCount === 0) {
    try {
      const { data: existing } = await supabase
        .from('manager_data')
        .select('data')
        .eq('manager_id', managerId)
        .maybeSingle();

      const existingUsers = (existing?.data as any)?.users?.length || 0;
      const existingReceipts = (existing?.data as any)?.receipts?.length || 0;

      // If Supabase has real data, do NOT overwrite with empty state
      if (existingUsers > 0 || existingReceipts > 0) {
        console.warn(`[Supabase] BLOCKED empty save for ${managerId} — Supabase has ${existingUsers} users`);
        return;
      }
    } catch (e) {
      console.error('[Supabase] Safety check failed:', e);
      return;
    }
  }

  try {
    const { error } = await supabase
      .from('manager_data')
      .upsert(
        { manager_id: managerId, data: state, updated_at: new Date().toISOString() },
        { onConflict: 'manager_id' }
      );
    if (error) console.error('[Supabase] Save error:', error.message);
  } catch (err) {
    console.error('[Supabase] Save exception:', err);
  }
};

export const loadStateFromSupabase = async (managerId: string): Promise<AppState | null> => {
  if (!managerId) return null;
  try {
    const { data, error } = await supabase
      .from('manager_data')
      .select('data')
      .eq('manager_id', managerId)
      .maybeSingle();
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

  const localUsers    = localState?.users?.length    || 0;
  const localReceipts = localState?.receipts?.length || 0;
  const remoteUsers   = supabaseState?.users?.length    || 0;
  const remoteReceipts = supabaseState?.receipts?.length || 0;

  const localScore  = localUsers  + localReceipts;
  const remoteScore = remoteUsers + remoteReceipts;

  console.log(`[Sync] Local: ${localUsers}u ${localReceipts}r | Supabase: ${remoteUsers}u ${remoteReceipts}r`);

  // Supabase has more/equal data → always prefer Supabase
  if (remoteScore >= localScore && supabaseState) {
    console.log('[Sync] Using SUPABASE data');
    return {
      ...supabaseState,
      users:    supabaseState.users    || [],
      receipts: supabaseState.receipts || [],
      archives: supabaseState.archives || [],
      companies: supabaseState.companies || [],
      subManagers: supabaseState.subManagers || [],
      attendanceLogs: supabaseState.attendanceLogs || [],
      complaintTickets: supabaseState.complaintTickets || [],
      businessExpenses: supabaseState.businessExpenses || [],
      activeCompanyId: supabaseState.activeCompanyId || '',
      dismissedNotificationIds: supabaseState.dismissedNotificationIds || [],
      currentManager: managerId,
    };
  }

  // Local has more data — save local to Supabase
  if (localScore > remoteScore && localScore > 0) {
    console.log('[Sync] Using LOCAL data, pushing to Supabase');
    await saveStateToSupabase(managerId, localState);
    return localState;
  }

  // Both empty — return local
  return localState;
};
