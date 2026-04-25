// utils/storage.ts
// Dual-sync: localStorage (instant) + Supabase (cloud backup)

import { AppState, DefaultPlanPricing, ReceiptDesign, AppSettings, ManagerAccount } from '../types';
import { supabase } from './supabase';

const ACCOUNTS_KEY = 'mahadnet_accounts';
const SESSION_KEY = 'mahadnet_active_session';
const DATA_PREFIX = 'mahadnet_data_';

// ─── MANAGER ACCOUNTS ────────────────────────────────────────────────────────

export const getAccounts = (): ManagerAccount[] => {
  const data = localStorage.getItem(ACCOUNTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveAccount = async (account: ManagerAccount) => {
  // 1. Save locally first (instant)
  const accounts = getAccounts();
  const index = accounts.findIndex(a => a.username === account.username);
  if (index >= 0) {
    accounts[index] = account;
  } else {
    accounts.push(account);
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));

  // 2. Sync to Supabase in background
  try {
    await supabase.from('manager_accounts').upsert({
      username: account.username,
      password: account.password,
      business_name: account.businessName,
      email: account.email,
      phone: account.phone,
      created_at: account.createdAt,
    }, { onConflict: 'username' });
  } catch (e) {
    console.warn('Supabase account sync failed (offline?):', e);
  }
};

export const getActiveSession = (): string | null => {
  return localStorage.getItem(SESSION_KEY);
};

export const setActiveSession = (username: string | null) => {
  if (username) {
    localStorage.setItem(SESSION_KEY, username);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
};

export const removeAccount = (username: string) => {
  const accounts = getAccounts();
  const updated = accounts.filter(a => a.username !== username);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
};

export const clearAllAccounts = () => {
  localStorage.removeItem(ACCOUNTS_KEY);
};

// ─── APP STATE ────────────────────────────────────────────────────────────────

const defaultSettings: AppSettings = {
  businessName: 'Ledgerzo',
  businessPhone: '',
  businessEmail: '',
  businessAddress: 'Pakistan',
  globalNote: 'Thank you for choosing us.',
  planPrices: { ...DefaultPlanPricing },
  receiptDesign: ReceiptDesign.PROFESSIONAL,
  isInitialized: false,
};

/**
 * Save state — writes to localStorage immediately, then syncs to Supabase.
 * Never blocks the UI.
 */
export const saveState = (state: AppState) => {
  if (!state.currentManager) return;

  // 1. Always save locally first (instant, works offline)
  localStorage.setItem(`${DATA_PREFIX}${state.currentManager}`, JSON.stringify(state));

  // 2. Sync to Supabase in background (non-blocking)
  supabase.from('app_data').upsert(
    { manager_username: state.currentManager, state: state },
    { onConflict: 'manager_username' }
  ).then(({ error }) => {
    if (error) console.warn('Supabase state sync failed (offline?):', error.message);
  });
};

/**
 * Load state — tries Supabase first for latest cloud data,
 * falls back to localStorage if offline or no cloud data found.
 */
export const loadState = (username: string | null): AppState => {
  const activeUser = username || getActiveSession();

  const emptyState: AppState = {
    users: [],
    receipts: [],
    archives: [],
    settings: defaultSettings,
    currentManager: activeUser || undefined,
  };

  if (!activeUser) return emptyState;

  // Return from localStorage immediately (synchronous)
  const localData = localStorage.getItem(`${DATA_PREFIX}${activeUser}`);

  // Kick off background Supabase fetch to update local cache
  syncFromSupabase(activeUser);

  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      return {
        ...parsed,
        users: parsed.users || [],
        receipts: parsed.receipts || [],
        archives: parsed.archives || [],
        currentManager: activeUser,
      };
    } catch {
      return emptyState;
    }
  }

  // No local data — check accounts
  const account = getAccounts().find(a => a.username === activeUser);
  if (account) {
    return {
      ...emptyState,
      settings: {
        ...defaultSettings,
        businessName: account.businessName,
        adminUsername: account.username,
        adminPassword: account.password,
        isInitialized: true,
      } as any,
    };
  }

  return emptyState;
};

/**
 * Fetch latest state from Supabase and update localStorage cache.
 * Called silently in the background after loadState.
 */
const syncFromSupabase = async (username: string) => {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('state, updated_at')
      .eq('manager_username', username)
      .single();

    if (error || !data) return;

    const cloudState = data.state as AppState;
    const localRaw = localStorage.getItem(`${DATA_PREFIX}${username}`);

    if (!localRaw) {
      // No local data — use cloud data directly
      localStorage.setItem(`${DATA_PREFIX}${username}`, JSON.stringify(cloudState));
      console.log('✅ Supabase: Restored data from cloud');
      return;
    }

    // Compare timestamps — use whichever is newer
    const localState = JSON.parse(localRaw) as AppState;
    const cloudUpdated = new Date(data.updated_at).getTime();
    const localUsers = (localState.users || []).length;
    const cloudUsers = (cloudState.users || []).length;

    // If cloud has more data, prefer cloud
    if (cloudUsers > localUsers) {
      localStorage.setItem(`${DATA_PREFIX}${username}`, JSON.stringify(cloudState));
      console.log('✅ Supabase: Updated local cache from cloud (cloud has newer data)');
    }
  } catch (e) {
    // Offline or network error — silently ignore, local data is fine
    console.warn('Supabase background sync skipped (offline)');
  }
};

/**
 * Force pull latest data from Supabase — call this to manually refresh.
 */
export const forceCloudSync = async (username: string): Promise<AppState | null> => {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('state')
      .eq('manager_username', username)
      .single();

    if (error || !data) return null;

    const cloudState = data.state as AppState;
    localStorage.setItem(`${DATA_PREFIX}${username}`, JSON.stringify(cloudState));
    return cloudState;
  } catch {
    return null;
  }
};

/**
 * Sync accounts from Supabase to localStorage on app start.
 * Useful when logging in from a new device.
 */
export const syncAccountsFromCloud = async (): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('manager_accounts')
      .select('*');

    if (error || !data || data.length === 0) return;

    const cloudAccounts: ManagerAccount[] = data.map((row: any) => ({
      username: row.username,
      password: row.password,
      businessName: row.business_name,
      email: row.email || '',
      phone: row.phone || '',
      createdAt: row.created_at,
    }));

    // Merge with existing local accounts
    const localAccounts = getAccounts();
    const merged = [...localAccounts];
    cloudAccounts.forEach(ca => {
      if (!merged.find(la => la.username === ca.username)) {
        merged.push(ca);
      }
    });

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(merged));
    console.log('✅ Supabase: Accounts synced from cloud');
  } catch (e) {
    console.warn('Supabase accounts sync failed:', e);
  }
};

export const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();
