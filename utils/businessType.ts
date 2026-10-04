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

// Tabs hidden for a business type (exclusion list: any tab not listed stays
// visible, so a new/unknown tab can never disappear by accident).
// ISP hides nothing => the ISP app is unchanged.
export const HIDDEN_TABS: Record<BusinessType, string[]> = {
  isp: [],
  water: ['outage', 'equipment', 'expiries', 'dealer-sales'],
};

// Tabs that exist only for a business type (added by later phases).
export const EXTRA_TABS: Record<BusinessType, string[]> = {
  isp: [],
  water: ['water-hub'],
};

export const isTabEnabled = (type: BusinessType, tabId: string): boolean =>
  !HIDDEN_TABS[normalizeBusinessType(type)].includes(tabId);

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
