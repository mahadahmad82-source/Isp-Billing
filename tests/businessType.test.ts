import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBusinessType, normalizeBusinessType, isTabEnabled, getTerms,
  WATER_TABS, DEFAULT_BUSINESS_TYPE,
} from '../utils/businessType';

test('missing or unknown businessType falls back to isp', () => {
  assert.equal(getBusinessType(undefined), 'isp');
  assert.equal(getBusinessType({}), 'isp');
  assert.equal(getBusinessType({ businessType: undefined }), 'isp');
  assert.equal(normalizeBusinessType('banana'), 'isp');
  assert.equal(normalizeBusinessType(null), DEFAULT_BUSINESS_TYPE);
});

test('isp keeps every tab visible (ISP app unchanged)', () => {
  for (const t of ['dashboard', 'users', 'outage', 'equipment', 'expiries', 'dealer-sales', 'water-hub', 'anything-new']) {
    assert.equal(isTabEnabled('isp', t), true);
  }
});

test('water allowlist: sidebar nav (Daily/Manage/Setup) tabs are enabled', () => {
  assert.deepEqual(WATER_TABS, ['dashboard', 'water-hub', 'water-customers', 'water-billing', 'expenses', 'water-reports', 'water-analytics', 'water-routes', 'water-vehicles', 'team', 'settings']);
  for (const t of WATER_TABS) assert.equal(isTabEnabled('water', t), true);
  for (const t of ['users', 'receipts', 'recoveries', 'outage', 'equipment', 'expiries', 'dealer-sales', 'reports', 'analytics', 'water-ledger', 'water-more', 'anything-new']) {
    assert.equal(isTabEnabled('water', t), false);
  }
});

test('isp terminology equals the labels used today', () => {
  const t = getTerms(undefined);
  assert.equal(t.plan, 'Package');
  assert.equal(t.expiry, 'Expiry');
  assert.equal(t.recharge, 'Recharge');
  assert.equal(getTerms('water').plan, 'Rate');
});
