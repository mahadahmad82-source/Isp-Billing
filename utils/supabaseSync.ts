import { supabase } from '../lib/supabase';
import { AppState } from '../types';

// ✅ FIX: Direct Supabase calls — no Express proxy needed (works on Vercel)

export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId) return;
  try {
    const { error } = await supabase
      .from('manager_data')
      .upsert(
        { manager_id: managerId, data: state, updated_at: new Date().toISOString() },
        { onConflict: 'manager_id' }
      );
    if (error) {
      console.error('[Supabase] Save error:', error.message);
    }
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

    if (error) {
      console.error('[Supabase] Load error:', error.message);
      return null;
    }
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

  const localUsers = localState?.users?.length || 0;
  const localReceipts = localState?.receipts?.length || 0;
  const remoteUsers = supabaseState?.users?.length || 0;
  const remoteReceipts = supabaseState?.receipts?.length || 0;

  const localScore = localUsers + localReceipts;
  const remoteScore = remoteUsers + remoteReceipts;

  console.log(`[Sync] Local: ${localUsers} users, ${localReceipts} receipts | Supabase: ${remoteUsers} users, ${remoteReceipts} receipts`);

  if (localScore > remoteScore) {
    console.log('[Sync] LOCAL data richer — saving to Supabase');
    await saveStateToSupabase(managerId, localState);
    return localState;
  }

  if (supabaseState) {
    console.log('[Sync] SUPABASE data loaded');
    return {
      ...supabaseState,
      users: supabaseState.users || [],
      receipts: supabaseState.receipts || [],
      archives: supabaseState.archives || [],
      companies: supabaseState.companies || [],
      subManagers: supabaseState.subManagers || [],
      attendanceLogs: supabaseState.attendanceLogs || [],
      activeCompanyId: supabaseState.activeCompanyId || '',
      dismissedNotificationIds: supabaseState.dismissedNotificationIds || [],
      currentManager: managerId,
    };
  }

  console.log('[Sync] Supabase empty — saving local data');
  if (localScore > 0) {
    await saveStateToSupabase(managerId, localState);
  }
  return localState;
};
