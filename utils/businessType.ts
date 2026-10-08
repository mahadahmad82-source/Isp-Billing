import type { AppState, BusinessType } from '../types';

// Foundation for multi-business support. Nothing imports this yet, so it has
// zero runtime effect until a feature explicitly opts in.
// Rule: undefined / unknown value => 'isp', so every existing account keeps
// behaving exactly as it does today.

export const DEFAULT_BUSINESS_TYPE: BusinessType = 'isp';
export const BUSINESS_TYPES: BusinessType[] = ['isp', 'water'];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  isp: 'ISP / Internet',
  water: 'Water / RO Supplier',
};

export const normalizeBusinessType = (value: unknown): BusinessType =>
  BUSINESS_TYPES.includes(value as BusinessType) ? (value as BusinessType) : DEFAULT_BUSINESS_TYPE;

export const getBusinessType = (state?: Pick<AppState, 'businessType'> | null): BusinessType =>
  normalizeBusinessType(state?.businessType);

// Water-first shell (M6a): allowlist. A water account sees ONLY these tabs, in
// this order. ISP keeps everything (unchanged), so a new/unknown tab can never
// disappear for ISP by accident.
export const WATER_TABS: string[] = [
  // Sidebar nav (2026-10-08, approved mockup v2): MAIN —
  // Dashboard, Customer Directory List; OPERATIONS — Deliveries,
  // Routes, Riders, Vehicles; FINANCIALS — Receipt and Billing,
  // Expenses, Month End; INSIGHTS — Reports, Analytics; SYSTEM —
  // System Logs, Settings. Every destination is a direct nav item.
  'dashboard',
  'water-hub',       // Deliveries
  'water-customers', // Customer Directory List (+Ledger merged in)
  'water-billing',   // Receipt and Billing
  'water-monthend',  // Month End (direct link; also inside Billing > Ledger)
  'expenses',
  'water-reports',
  'water-analytics',
  'water-routes',
  'water-vehicles',
  'water-syslogs',   // System Logs (water view of the shared log store)
  'team',            // Riders
  'settings',
];

// Tabs that exist only for a business type (added by later phases).
export const EXTRA_TABS: Record<BusinessType, string[]> = {
  isp: [],
  water: ['water-hub'],
};

export const isTabEnabled = (type: BusinessType, tabId: string): boolean => {
  const t = normalizeBusinessType(type);
  if (t === 'water') return WATER_TABS.includes(tabId);
  return true; // ISP: every tab stays visible, exactly as before.
};

// Terminology per business type (UI labels only). ISP values are the labels
// the app uses today.
export interface Terms {
  customer: string;
  customers: string;
  plan: string;
  expiry: string;
  recharge: string;
}

export const TERMS: Record<BusinessType, Terms> = {
  isp: { customer: 'Customer', customers: 'Customers', plan: 'Package', expiry: 'Expiry', recharge: 'Recharge' },
  water: { customer: 'Customer', customers: 'Customers', plan: 'Rate', expiry: 'Due date', recharge: 'Payment' },
};

export const getTerms = (type?: unknown): Terms => TERMS[normalizeBusinessType(type)];
