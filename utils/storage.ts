import { AppState, DefaultPlanPricing, ReceiptDesign, AppSettings, ManagerAccount } from '../types';
import { supabase } from '../lib/supabase';

const ACCOUNTS_KEY = 'mahadnet_accounts';
const SESSION_KEY = 'mahadnet_active_session';
const DATA_PREFIX = 'mahadnet_data_';

// ─── Account Management ───────────────────────────────────────────────────────
export const getAccounts = (): ManagerAccount[] => {
  const data = localStorage.getItem(ACCOUNTS_KEY);
  const accounts: ManagerAccount[] = data ? JSON.parse(data) : [];

  // Also include agent session from sessionStorage (agents are NOT saved in localStorage)
  try {
    const agentSession = sessionStorage.getItem('agent_temp_session');
    if (agentSession) {
      const sess = JSON.parse(agentSession);
      if (sess.username && !accounts.find((a: ManagerAccount) => a.username === sess.username)) {
        accounts.push({
          username: sess.username,
          password: '',
          businessName: sess.businessName || sess.username,
          email: sess.email || '',
          phone: sess.phone || '',
          role: 'sub-manager',
          managerUsername: sess.managerUsername,
          createdAt: new Date().toISOString(),
          rememberPassword: false
        });
      }
    }
  } catch {}

  return accounts;
};

export const saveAccount = (account: ManagerAccount) => {
  const accounts = getAccounts();
  const index = accounts.findIndex(a => a.username === account.username);
  if (index >= 0) {
    accounts[index] = account;
  } else {
    accounts.push(account);
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const removeAccount = (username: string) => {
  const accounts = getAccounts();
  const updated = accounts.filter(a => a.username !== username);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
};

export const clearAllAccounts = () => {
  localStorage.removeItem(ACCOUNTS_KEY);
};

// ─── Session ──────────────────────────────────────────────────────────────────
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

// ─── ID Generator ─────────────────────────────────────────────────────────────
export const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

// ─── State: Save (localStorage + Supabase sync) ───────────────────────────────
export const saveState = (state: AppState) => {
  if (!state.currentManager) return;
  try {
    localStorage.setItem(`${DATA_PREFIX}${state.currentManager}`, JSON.stringify(state));
  } catch (err: any) {
    console.error('Local storage save error:', err);
    alert('Failed to save data locally. The image or data might be too large. Please use a smaller image.');
  }

  // Push to Supabase in background (non-blocking)
  supabase
    .from('manager_data')
    .upsert(
      { manager_id: state.currentManager, data: state, updated_at: new Date().toISOString() },
      { onConflict: 'manager_id' }
    )
    .then(({ error }) => {
      if (error) console.warn('[Supabase] Background save failed:', error.message);
    });
};

// ─── State: Load ──────────────────────────────────────────────────────────────
export const loadState = (username: string | null): AppState => {
  const activeUser = username || getActiveSession();

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

  const account = getAccounts().find(a => a.username === activeUser);
  const dataOwner = (account?.role === 'sub-manager' && account.managerUsername)
    ? account.managerUsername
    : activeUser;

  const emptyState: AppState = {
    users: [],
    receipts: [],
    archives: [],
    settings: defaultSettings,
    currentManager: dataOwner || undefined,
  };

  if (!activeUser) return emptyState;

  const data = localStorage.getItem(`${DATA_PREFIX}${dataOwner}`);
  if (!data) {
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
  }

  try {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      users: parsed.users || [],
      receipts: parsed.receipts || [],
      archives: parsed.archives || [],
      currentManager: dataOwner,
    };
  } catch {
    return emptyState;
  }
};

// ─── Supabase: Pull cloud data ─────────────────────────────────────────────────
export const pullFromSupabase = async (managerId: string): Promise<AppState | null> => {
  try {
    const { data, error } = await supabase
      .from('manager_data')
      .select('data')
      .eq('manager_id', managerId)
      .single();

    if (error || !data) return null;
    return data.data as AppState;
  } catch (e) {
    console.warn('[Supabase] Pull error:', e);
    return null;
  }
};

// ─── Activity Logging ──────────────────────────────────────────────────────────
const LOGS_KEY = 'mahadnet_admin_logs';
const MAX_LOGS = 500;

export interface ActivityLog {
  id: string;
  timestamp: string;
  username: string;
  action: 'LOGIN' | 'LOGOUT' | 'SIGNUP' | 'DATA_SAVE' | 'CUSTOMER_ADD' | 'CUSTOMER_DELETE' | 'RECEIPT_CREATE' | 'SETTINGS_UPDATE' | 'BACKUP_RESTORE';
  detail?: string;
  userAgent?: string;
  sessionId?: string;
}

export const writeLog = (entry: Omit<ActivityLog, 'id' | 'timestamp'>) => {
  try {
    const logs: ActivityLog[] = getLogs();
    const newEntry: ActivityLog = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      sessionId: sessionStorage.getItem('mahadnet_session_id') || undefined,
      ...entry,
    };
    logs.unshift(newEntry);
    if (logs.length > MAX_LOGS) logs.splice(MAX_LOGS);
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  } catch {}
};

export const getLogs = (): ActivityLog[] => {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const clearLogs = () => {
  localStorage.removeItem(LOGS_KEY);
};
