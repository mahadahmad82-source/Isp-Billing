// utils/computeBalance.ts — Single source of truth for a customer's outstanding dues.
//
// Three places in the app used to compute "balance" three different ways:
//   - ReceiptGenerator.syncUserAmounts (correct),
//   - RecoverySummary ledger rows + month-folder totals (stale user.balance for non-payers),
//   - BulkReminder (fell back to the full monthlyFee when balance was 0).
// This module extracts the ReceiptGenerator formula verbatim so every surface shows
// the same figure. It is pure (no state, no side effects) and safe to call from
// useMemo blocks.

// Type-only import on purpose: this file is also imported by Vercel serverless functions
// (api/webhook.ts, api/cron-overdue-reminders.ts), where Node ESM cannot resolve the
// extensionless '../types' at runtime. A runtime import of types.ts would crash the bot.
import type { Receipt, UserRecord } from '../types';

// Reliable period parser: "May 2026" → new Date("May 1, 2026").
// Returns null for legacy/malformed period strings.
export function parseBillingPeriod(str: string): Date | null {
  if (!str) return null;
  const parts = str.trim().split(' ');
  if (parts.length < 2) return null;
  const d = new Date(`${parts[0]} 1, ${parts[1]}`);
  return isNaN(d.getTime()) ? null : d;
}

// Plan price resolution — identical to ReceiptGenerator's automatic detection.
export function feeForUser(user: UserRecord, planPrices?: Record<string, number>): number {
  return planPrices !== undefined && planPrices[user.plan] !== undefined
    ? planPrices[user.plan]
    : (user.monthlyFee || 0);
}

// Outstanding dues for `user` as of `currentPeriod` ("October 2026").
//
//   balance = balanceAmount of the most recent PREVIOUS receipt
//             (sorted by parsed period, current period excluded;
//              falls back to user.balance when no previous receipt exists)
//           + (fee − persistentDiscount) for every month between that receipt
//             and the current period that has no SUCCESS receipt.
//
// Pass matchUsername=true when receipts may belong to a re-created user record
// (same username, new id) — the Recovery Ledger matches on username as well.
export function computeCustomerBalance(
  user: UserRecord,
  receipts: Receipt[],
  currentPeriod: string,
  planPrices?: Record<string, number>,
  matchUsername: boolean = false,
): number {
  const fee = feeForUser(user, planPrices);
  const persistentDisc = user.persistentDiscount || 0;
  const userReceipts = (receipts || []).filter(r =>
    r.userId === user.id || (matchUsername && r.username === user.username));

  // Sort by parsed PERIOD (not receipt creation date) to get the true latest
  // billing period. If a period fails to parse (legacy-imported data), fall back
  // to comparing raw receipt `date` so a malformed period string can't silently
  // misorder which receipt is "latest".
  const previousReceipts = [...userReceipts]
    .filter(r => r.period && r.period !== currentPeriod)
    .sort((a, b) => {
      const da = parseBillingPeriod(a.period);
      const db = parseBillingPeriod(b.period);
      if (!da || !db) return new Date(b.date).getTime() - new Date(a.date).getTime();
      return db.getTime() - da.getTime();
    });
  const latestPreviousReceipt = previousReceipts.length > 0 ? previousReceipts[0] : null;

  // Use balanceAmount from most recent PREVIOUS receipt.
  // If no previous receipt exists at all → fallback to Master Directory balance (user.balance).
  const lastReceiptBalance = latestPreviousReceipt
    ? (latestPreviousReceipt.balanceAmount || 0)
    : (user.balance || 0);

  // Detect missed months: iterate each month between last receipt and current period.
  // Only add fee for months that have NO receipt at all (not just gap math).
  // Each missed month adds (fee − discount) — same net amount the customer would have
  // owed if they had been billed that month — so arrears never inflate by the discount.
  let missedMonthsArrears = 0;
  if (latestPreviousReceipt && latestPreviousReceipt.period) {
    const currentDate = parseBillingPeriod(currentPeriod);
    const lastDate = parseBillingPeriod(latestPreviousReceipt.period);
    if (currentDate && lastDate && currentDate > lastDate) {
      const cursor = new Date(lastDate);
      cursor.setMonth(cursor.getMonth() + 1);
      while (cursor < currentDate) {
        const mName = cursor.toLocaleString('en-US', { month: 'long' });
        const mYear = cursor.getFullYear().toString();
        const mPeriod = `${mName} ${mYear}`;
        const hasPaid = userReceipts.some(r => r.period === mPeriod && (r.status as string) === 'Success' /* PaymentStatus.SUCCESS */);
        if (!hasPaid) missedMonthsArrears += Math.max(0, fee - persistentDisc);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  return lastReceiptBalance + missedMonthsArrears;
}
