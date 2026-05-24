import { supabase } from '../lib/supabase';
import { AppState } from '../types';

// Save app state to Supabase via server-side proxy (bypasses RLS issues)
export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId) return;
  try {
    const response = await fetch('/api/sync/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId, state })
    });
    
    if (!response.ok) {
      const err = await response.json();
      console.error('Supabase sync-proxy error:', err.error);
    }
  } catch (err) {
    console.error('Supabase sync-proxy exception:', err);
  }
};

// Load app state from Supabase via server-side proxy
export const loadStateFromSupabase = async (managerId: string): Promise<AppState | null> => {
  if (!managerId) return null;
  try {
    const response = await fetch(`/api/sync/load/${encodeURIComponent(managerId)}`);
    if (!response.ok) return null;
    const { data } = await response.json();
    return data as AppState;
  } catch (err) {
    console.error('Supabase sync-proxy load exception:', err);
    return null;
  }
};

// Smart merge: pick state with more data, save winner to Supabase
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

  // Local has MORE data — use local and save to Supabase
  if (localScore > remoteScore) {
    console.log('[Sync] Using LOCAL data (richer) — saving to Supabase');
    await saveStateToSupabase(managerId, localState);
    return localState;
  }

  // Supabase has MORE or EQUAL data — use Supabase
  if (supabaseState) {
    console.log('[Sync] Using SUPABASE data');
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

  // Nothing in Supabase — use local and save
  console.log('[Sync] Supabase empty — using LOCAL and saving');
  if (localScore > 0) {
    await saveStateToSupabase(managerId, localState);
  }
  return localState;
};
