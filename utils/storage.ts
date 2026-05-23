import { AppState, DefaultPlanPricing, ReceiptDesign, AppSettings, ManagerAccount } from '../types';
import { saveStateToSupabase } from './supabaseSync';

const ACCOUNTS_KEY   = 'mahadnet_accounts';
const SESSION_KEY    = 'mahadnet_active_session';

// ─── Account Management ────────────────────────────────────────────────────────
export const getAccounts = (): ManagerAccount[] => {
  const data = localStorage.getItem(ACCOUNTS_KEY);
  const accounts: ManagerAccount[] = data ? JSON.parse(data) : [];

  // Include agent from sessionStorage (agents not saved in localStorage)
  try {
    const agentSession = sessionStorage.getItem('agent_temp_session');
    if (agentSession) {
      const sess = JSON.parse(agentSession);
      if (sess.username && !accounts.find((a: ManagerAccount) => a.username === sess.username)) {
        accounts.push({
          username:        sess.username,
          password:        '',
          businessName:    sess.businessName || sess.username,
          email:           sess.email  || '',
          phone:           sess.phone  || '',
          role:            'sub-manager',
          managerUsername: sess.managerUsername,
          createdAt:       new Date().toISOString(),
          rememberPassword: false,
        });
      }
    }
  } catch {}

  return accounts;
};

export const saveAccount = (account: ManagerAccount) => {
  // Only save non-agent accounts to localStorage
  if (account.role === 'sub-manager') return;
  const accounts = getAccounts().filter(a => a.role !== 'sub-manager');
  const index = accounts.findIndex(a => a.username === account.username);
  if (index >= 0) accounts[index] = account;
  else accounts.push(account);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const removeAccount = (username: string) => {
  const accounts = getAccounts().filter(a => a.username !== username && a.role !== 'sub-manager');
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const clearAllAccounts = () => localStorage.removeItem(ACCOUNTS_KEY);

// ─── Session ───────────────────────────────────────────────────────────────────
export const getActiveSession = (): string | null => localStorage.getItem(SESSION_KEY);

export const setActiveSession = (username: string | null) => {
  if (username) localStorage.setItem(SESSION_KEY, username);
  else          localStorage.removeItem(SESSION_KEY);
};

// ─── ID Generator ──────────────────────────────────────────────────────────────
export const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

// ─── Save State — Supabase ONLY (no localStorage) ─────────────────────────────
export const saveState = (state: AppState) => {
  if (!state.currentManager) return;
  // Save to Supabase (non-blocking background push)
  saveStateToSupabase(state.currentManager, state).catch(e =>
    console.warn('[saveState] Supabase push failed:', e)
  );
};

// ─── Load State — from localStorage ONLY during migration ─────────────────────
// After smartLoadAndSync runs on login, localStorage is cleared.
// This function is only used to get local data for the migration comparison.
export const loadState = (managerId: string | null): AppState => {
  const defaultSettings: AppSettings = {
    businessName:         'Ledgerzo',
    businessPhone:        '',
    businessEmail:        '',
    businessAddress:      'Pakistan',
    globalNote:           'Thank you for choosing us.',
    planPrices:           { ...DefaultPlanPricing },
    receiptDesign:        ReceiptDesign.PROFESSIONAL,
    isInitialized:        false,
  };

  const emptyState: AppState = {
    users:       [],
    receipts:    [],
    archives:    [],
    settings:    defaultSettings,
    currentManager: managerId || undefined,
  };

  if (!managerId) return emptyState;

  // Check localStorage for old data (migration)
  const raw = localStorage.getItem(`mahadnet_data_${managerId}`);
  if (!raw) return emptyState;

  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      users:          parsed.users    || [],
      receipts:       parsed.receipts || [],
      archives:       parsed.archives || [],
      currentManager: managerId,
    };
  } catch {
    return emptyState;
  }
};

export const pullFromSupabase = async (managerId: string): Promise<AppState | null> => {
  // Re-export from supabaseSync for backward compat
  const { loadStateFromSupabase } = await import('./supabaseSync');
  return loadStateFromSupabase(managerId);
};

// ─── Activity Logging ──────────────────────────────────────────────────────────
const LOGS_KEY = 'mahadnet_admin_logs';
const MAX_LOGS = 500;

export interface ActivityLog {
  id: string; timestamp: string; username: string;
  action: 'LOGIN'|'LOGOUT'|'SIGNUP'|'DATA_SAVE'|'CUSTOMER_ADD'|'CUSTOMER_DELETE'|'RECEIPT_CREATE'|'SETTINGS_UPDATE'|'BACKUP_RESTORE';
  detail?: string; userAgent?: string; sessionId?: string;
}

export const writeLog = (entry: Omit<ActivityLog, 'id'|'timestamp'>) => {
  try {
    const logs: ActivityLog[] = getLogs();
    logs.unshift({
      id:         Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp:  new Date().toISOString(),
      userAgent:  navigator.userAgent,
      sessionId:  sessionStorage.getItem('mahadnet_session_id') || undefined,
      ...entry,
    });
    if (logs.length > MAX_LOGS) logs.splice(MAX_LOGS);
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  } catch {}
};

export const getLogs   = (): ActivityLog[] => {
  try { return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]'); } catch { return []; }
};
export const clearLogs = () => localStorage.removeItem(LOGS_KEY);
