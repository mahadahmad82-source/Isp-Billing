import { Transaction, BusinessExpense } from '../types';

/**
 * Feature B — 3-Way Transaction Ledger profit calculations.
 * Formula (per spec):
 *   Net Profit = Revenue − (Vendor Outflow + ISP Outflow + Operating Expenses)
 *   Profit Ratio (%) = (Net Profit / Revenue) × 100
 */

export const sumTransactionsByType = (
  transactions: Transaction[],
  type: Transaction['type'],
  period?: string
): number => {
  return (transactions || [])
    .filter(t => t.type === type && (!period || t.period === period))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
};

export const calcMonthlyExpenses = (expenses: BusinessExpense[], monthYYYYMM: string): number => {
  return (expenses || [])
    .filter(e => (e.date || '').startsWith(monthYYYYMM))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
};

export interface ProfitSummary {
  period: string;
  cashRecovered: number;
  vendorOutflow: number;
  ispOutflow: number;
  operatingExpenses: number;
  netProfit: number;
  profitRatioPct: number; // 0 when revenue is 0, to avoid divide-by-zero / NaN in UI
}

/**
 * @param period      "Month Year" string (e.g. "August 2026") — matches Transaction.period / Receipt.period
 * @param monthYYYYMM "YYYY-MM" string — matches BusinessExpense.date prefix (same convention as BusinessExpenses.tsx)
 */
export const calcProfitSummary = (
  transactions: Transaction[],
  expenses: BusinessExpense[],
  period: string,
  monthYYYYMM: string
): ProfitSummary => {
  const cashRecovered = sumTransactionsByType(transactions, 'recovery', period);
  const vendorOutflow = sumTransactionsByType(transactions, 'vendorPayment', period);
  const ispOutflow = sumTransactionsByType(transactions, 'ispPayment', period);
  const operatingExpenses = calcMonthlyExpenses(expenses, monthYYYYMM);

  const netProfit = cashRecovered - (vendorOutflow + ispOutflow + operatingExpenses);
  const profitRatioPct = cashRecovered > 0 ? (netProfit / cashRecovered) * 100 : 0;

  return { period, cashRecovered, vendorOutflow, ispOutflow, operatingExpenses, netProfit, profitRatioPct };
};
