import { AccessRights, ModuleKey } from '../types';

// Keep this in sync with types.ts ModuleKey and Layout.tsx nav tab ids.
export const ALL_MODULE_KEYS: ModuleKey[] = [
  'dashboard', 'users', 'receipts', 'recoveries', 'expiries',
  'reports', 'systemlogs', 'settings', 'team', 'expenses',
  'analytics', 'outage', 'area', 'equipment', 'leads',
  'reminders', 'templates', 'wabot', 'transactions',
];

// grantAll=true → everything checked (used as starting point when a manager first
// opens the rights editor for an agent, so nothing looks broken by default).
export const getDefaultAccessRights = (grantAll: boolean = true): Record<ModuleKey, AccessRights> => {
  const rights = {} as Record<ModuleKey, AccessRights>;
  ALL_MODULE_KEYS.forEach(key => {
    rights[key] = { view: grantAll, create: grantAll, edit: grantAll, delete: grantAll, receipt: grantAll };
  });
  return rights;
};

// Used by nav filtering (Layout.tsx) and can be reused by any component that needs
// to gate a button. Undefined accessRights on the agent = unrestricted (legacy agents
// created before this feature keep working exactly as before).
export const canAccess = (
  accessRights: Record<ModuleKey, AccessRights> | undefined,
  module: ModuleKey,
  action: keyof AccessRights = 'view'
): boolean => {
  if (!accessRights) return true;
  const rights = accessRights[module];
  if (!rights) return true;
  return rights[action] !== false;
};
