// Period recovery ledger rows — the SAME rules the Recovery Ledger screen
// (components/RecoverySummary.tsx detailedList) uses, extracted so Copilot
// lists/prints always agree with it:
//   - a customer is in a period if activatedMonths includes it OR a receipt exists for it
//   - payers: remaining dues = latest receipt's balanceAmount
//   - non-payers: computeCustomerBalance (previous receipt balance + missed-month arrears)
//   - advance-covered: no receipt this period but credit absorbs this month's fee too
import { UserRecord, Receipt } from '../types';
import { computeCustomerBalance, feeForUser } from './computeBalance';

export interface LedgerRow {
  id: string;
  username: string;
  name: string;
  phone: string;
  address: string;
  plan: string;
  monthlyFee: number;
  hasPaid: boolean;
  paidAmount: number;
  advanceAmount: number;
  /** Dues carried into this period (non-payers: excludes THIS month's fee, as in the Recovery Ledger). */
  balance: number;
  /** This month's fee after the customer's persistent discount. */
  netFee: number;
  /** What is actually left to collect now: pending = dues + this month's fee, paid = remaining balance, advance = 0. */
  toCollect: number;
  isAdvanceCovered: boolean;
  expiryDate: string;
  /** paid = has a receipt this period; advance = covered by prior credit; pending = nothing paid, dues open. */
  status: 'paid' | 'advance' | 'pending';
}

export function ledgerRowForUser(
  u: UserRecord, receipts: Receipt[], period: string, planPrices?: Record<string, number>,
): LedgerRow {
  const periodReceipts = (receipts || []).filter(r => r.period === period);
  const userReceipts = periodReceipts.filter(r => r.userId === u.id || r.username === u.username);
  const hasPaid = userReceipts.length > 0;
  const paidSum = userReceipts.reduce((s, r) => s + (r.paidAmount - (r.advanceAmount || 0)), 0);
  const advanceSum = userReceipts.reduce((s, r) => s + (r.advanceAmount || 0), 0);
  const lastReceipt = [...userReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const balance = hasPaid
    ? (lastReceipt?.balanceAmount ?? 0)
    : computeCustomerBalance(u, receipts || [], period, planPrices, true);
  const netFee = Math.max(0, feeForUser(u, planPrices) - (u.persistentDiscount || 0));
  const isAdvanceCovered = !hasPaid && balance < 0 && balance + netFee <= 0;
  return {
    id: u.id, username: u.username, name: u.name, phone: u.phone || '', address: u.address || '',
    plan: u.plan || '', monthlyFee: feeForUser(u, planPrices), hasPaid, paidAmount: paidSum, advanceAmount: advanceSum,
    balance, netFee, isAdvanceCovered,
    toCollect: hasPaid ? Math.max(0, balance) : isAdvanceCovered ? 0 : Math.max(0, balance + netFee),
    expiryDate: lastReceipt?.expiryDate || u.expiryDate,
    status: hasPaid ? 'paid' : isAdvanceCovered ? 'advance' : 'pending',
  };
}

export function getMonthLedger(
  users: UserRecord[], receipts: Receipt[], period: string, planPrices?: Record<string, number>,
): LedgerRow[] {
  const periodReceipts = (receipts || []).filter(r => r.period === period);
  return (users || [])
    .filter(u => u.status !== 'deleted')
    .filter(u => (u.activatedMonths || []).includes(period) || periodReceipts.some(r => r.userId === u.id || r.username === u.username))
    .map(u => ledgerRowForUser(u, receipts, period, planPrices));
}
