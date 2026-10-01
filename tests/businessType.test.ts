import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBusinessType, normalizeBusinessType, isTabEnabled, getTerms,
  HIDDEN_TABS, DEFAULT_BUSINESS_TYPE,
} from '../utils/businessType';

test('missing or unknown businessType falls back to isp', () => {
  assert.equal(getBusinessType(undefined), 'isp');
  assert.equal(getBusinessType({}), 'isp');
  assert.equal(getBusinessType({ businessType: undefined }), 'isp');
  assert.equal(normalizeBusinessType('banana'), 'isp');
  assert.equal(normalizeBusinessType(null), DEFAULT_BUSINESS_TYPE);
});

test('isp hides no tabs (ISP app unchanged)', () => {
  assert.deepEqual(HIDDEN_TABS.isp, []);
  for (const t of ['dashboard', 'users', 'outage', 'equipment', 'expiries', 'dealer-sales', 'anything-new']) {
    assert.equal(isTabEnabled('isp', t), true);
  }
});

test('water hides ISP-only tabs but keeps generic ones and unknown ones', () => {
  for (const t of ['outage', 'equipment', 'expiries', 'dealer-sales']) assert.equal(isTabEnabled('water', t), false);
  for (const t of ['dashboard', 'users', 'receipts', 'settings', 'complaints', 'anything-new']) assert.equal(isTabEnabled('water', t), true);
});

test('isp terminology equals the labels used today', () => {
  const t = getTerms(undefined);
  assert.equal(t.plan, 'Package');
  assert.equal(t.expiry, 'Expiry');
  assert.equal(t.recharge, 'Recharge');
  assert.equal(getTerms('water').plan, 'Rate');
});
