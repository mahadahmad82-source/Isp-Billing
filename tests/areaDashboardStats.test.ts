import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentMethod, PaymentStatus, Receipt, UserRecord } from '../types';
import {
  buildAreaStats,
  isReceiptInMonth,
  recoveryPercent,
} from '../utils/areaDashboardStats';

const settings = {
  availablePlans: [{ name: 'Blue (20MB)', price: 1500 }],
  monthlyFee: 1000,
};

function makeUser(partial: Partial<UserRecord> & { id: string }): UserRecord {
  return {
    username: 'user1',
    name: 'Ali',
    phone: '0300',
    address: 'Street 1',
    plan: 'Blue (20MB)',
    monthlyFee: 1500,
    balance: 0,
    lastPaymentDate: '',
    expiryDate: '2099-12-31',
    createdAt: '2026-01-01',
    status: 'active',
    ...partial,
  };
}

function makeReceipt(partial: Partial<Receipt> & { id: string; userId: string; date: string }): Receipt {
  return {
    username: 'user1',
    userName: 'Ali',
    userPhone: '0300',
    totalAmount: 1500,
    paidAmount: 1500,
    balanceAmount: 0,
    period: 'September 2026',
    paymentMethod: PaymentMethod.CASH,
    status: PaymentStatus.SUCCESS,
    transactionRef: 't1',
    ...partial,
  };
}

test('recoveryPercent(0, 0) is 0', () => {
  assert.equal(recoveryPercent(0, 0), 0);
});

test('recoveryPercent(100, 0) is 100', () => {
  assert.equal(recoveryPercent(100, 0), 100);
});

test('recoveryPercent(40000, 10000) is 80', () => {
  assert.equal(recoveryPercent(40000, 10000), 80);
});

test('month filter includes first and last day of selected month and excludes other months', () => {
  const first = makeReceipt({ id: 'r1', userId: 'u1', date: '2026-09-01T00:00:00' });
  const last = makeReceipt({ id: 'r2', userId: 'u1', date: '2026-09-30T23:59:59' });
  const prev = makeReceipt({ id: 'r3', userId: 'u1', date: '2026-08-31T23:59:59' });
  const next = makeReceipt({ id: 'r4', userId: 'u1', date: '2026-10-01T00:00:00' });
  assert.equal(isReceiptInMonth(first, 2026, 8), true);
  assert.equal(isReceiptInMonth(last, 2026, 8), true);
  assert.equal(isReceiptInMonth(prev, 2026, 8), false);
  assert.equal(isReceiptInMonth(next, 2026, 8), false);
});

test('month collected excludes other months while year total includes all months in year', () => {
  const today = new Date('2026-09-25T12:00:00');
  const users: UserRecord[] = [
    makeUser({ id: 'u1', area: 'Gulshan', status: 'active', expiryDate: '2026-10-01' }),
  ];
  const receipts: Receipt[] = [
    makeReceipt({ id: 'sep', userId: 'u1', date: '2026-09-10T10:00:00', paidAmount: 1500 }),
    makeReceipt({ id: 'aug', userId: 'u1', date: '2026-08-10T10:00:00', paidAmount: 1500 }),
    makeReceipt({ id: 'prevYear', userId: 'u1', date: '2025-09-10T10:00:00', paidAmount: 1500 }),
  ];
  const stats = buildAreaStats(users, receipts, settings, 2026, 8, today);
  assert.equal(stats[0].revenue, 1500);
  assert.equal(stats[0].yearRevenue, 3000);
  assert.equal(stats[0].recovery, 100);
});

test('expected sums only active customers plan fees', () => {
  const today = new Date('2026-09-25T12:00:00');
  const users: UserRecord[] = [
    makeUser({ id: 'active', area: 'Gulshan', status: 'active', expiryDate: '2026-10-01' }),
    makeUser({ id: 'expired', area: 'Gulshan', status: 'expired', expiryDate: '2026-08-01' }),
    { ...makeUser({ id: 'suspended', area: 'Gulshan', status: 'active', expiryDate: '2026-10-01' }), isSuspended: true } as UserRecord,
    makeUser({ id: 'deleted', area: 'Gulshan', status: 'deleted', expiryDate: '2026-10-01' }),
    makeUser({ id: 'pending', area: 'Gulshan', status: 'pending', expiryDate: '2026-10-01' }),
  ];
  const stats = buildAreaStats(users, [], settings, 2026, 8, today);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].expected, 1500);
  assert.equal(stats[0].active, 1);
  assert.equal(stats[0].expired, 2);
  assert.equal(stats[0].suspended, 1);
  assert.equal(stats[0].total, 4);
});
