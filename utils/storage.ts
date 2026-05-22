import { AppState, ReceiptDesign, DefaultPlanPricing } from '../types';
import { supabase } from './supabaseClient';

// Session Helpers
const SESSION_KEY = 'ledgerzo_active_manager';

export const getActiveSession = (): string | null => {
  return sessionStorage.getItem(SESSION_KEY);
};

export const setActiveSession = (manager: string | null): void => {
  if (manager) {
    sessionStorage.setItem(SESSION_KEY, manager);
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
};

const getDefaultState = (): AppState => ({
  users: [],
  receipts: [],
  archives: [],
  companies: [],
  activeCompanyId: '',
  theme: 'light',
  settings: {
    businessName: 'Default ISP',
    businessPhone: '',
    businessEmail: '',
    businessAddress: 'Pakistan',
    globalNote: 'Thank you for choosing us.',
    planPrices: { ...DefaultPlanPricing },
    receiptDesign: ReceiptDesign.PROFESSIONAL,
    isInitialized: false,
    autoReminderChannel: 'whatsapp',
  },
  dismissedNotificationIds: [],
});

// Synchronous load from localStorage (keeps app fast)
export const loadState = (managerId: string | null): AppState => {
  if (!managerId) return getDefaultState();
  try {
    const raw = localStorage.getItem(`mahadnet_data_${managerId}`);
    if (!raw) return getDefaultState();
    return { ...getDefaultState(), ...JSON.parse(raw) };
  } catch {
    return getDefaultState();
  }
};

// Save to localStorage instantly + push to Supabase in background
export const saveState = (state: AppState): void => {
  const managerId = getActiveSession();
  if (!managerId) return;

  try {
    localStorage.setItem(`mahadnet_data_${managerId}`, JSON.stringify(state));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }

  // Push to Supabase in background (non-blocking)
  supabase
    .from('manager_data')
    .upsert(
      { manager_id: managerId, data: state, updated_at: new Date().toISOString() },
      { onConflict: 'manager_id' }
    )
    .then(({ error }) => {
      if (error) console.warn('Supabase sync failed:', error.message);
    });
};

// Pull latest data from Supabase cloud
export const pullFromSupabase = async (managerId: string): Promise<AppState | null> => {
  try {
    const { data, error } = await supabase
      .from('manager_data')
      .select('data')
      .eq('manager_id', managerId)
      .single();

    if (error || !data) return null;
    return { ...getDefaultState(), ...(data.data as AppState) };
  } catch (e) {
    console.warn('Supabase pull error:', e);
    return null;
  }
};
