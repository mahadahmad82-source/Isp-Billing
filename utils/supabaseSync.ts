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

// Load app state from Supabase, ignore local state completely
export const smartLoadAndSync = async (
  managerId: string,
  localState: AppState // Kept for compatibility but ignored
): Promise<AppState> => {
  const supabaseState = await loadStateFromSupabase(managerId);

  if (supabaseState) {
    console.log('[Sync] Using SUPABASE data exclusively');
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

  // Nothing in Supabase — initialize empty
  console.log('[Sync] Supabase empty, returning default empty state');
  return {
      users: [],
      receipts: [],
      archives: [],
      companies: [],
      subManagers: [],
      attendanceLogs: [],
      settings: localState?.settings, // keep default settings
      activeCompanyId: '',
      dismissedNotificationIds: [],
      currentManager: managerId,
  } as AppState;
};
