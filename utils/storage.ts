
import { AppState, DefaultPlanPricing, ReceiptDesign, AppSettings, ManagerAccount } from '../types';

const ACCOUNTS_KEY = 'mahadnet_accounts';
const SESSION_KEY = 'mahadnet_active_session';
const DATA_PREFIX = 'mahadnet_data_';

export const getAccounts = (): ManagerAccount[] => {
  const data = localStorage.getItem(ACCOUNTS_KEY);
  return data ? JSON.parse(data) : [];
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

export const saveState = (state: AppState) => {
  if (!state.currentManager) return;
  localStorage.setItem(`${DATA_PREFIX}${state.currentManager}`, JSON.stringify(state));
};

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
    isInitialized: false
  };

  const emptyState: AppState = { 
    users: [], 
    receipts: [], 
    archives: [],
    settings: defaultSettings,
    currentManager: activeUser || undefined
  };

  if (!activeUser) return emptyState;

  const data = localStorage.getItem(`${DATA_PREFIX}${activeUser}`);
  if (!data) {
    const account = getAccounts().find(a => a.username === activeUser);
    if (account) {
      return {
        ...emptyState,
        settings: {
          ...defaultSettings,
          businessName: account.businessName,
          phone: account.phone,
          email: account.email,
          adminUsername: account.username,
          adminPassword: account.password,
          isInitialized: true
        } as any
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
      currentManager: activeUser
    };
  } catch {
    return emptyState;
  }
};

export const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();
