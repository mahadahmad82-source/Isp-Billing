import { Receipt, PaymentStatus } from '../types';

/**
 * Calculate actual paid amount from a receipt
 * Uses paidAmount first, falls back to totalAmount
 */
export const getReceiptAmount = (r: Receipt): number => {
  return r.paidAmount || (r as any).totalAmount || 0;
};

/**
 * Total Revenue = sum of all SUCCESS receipts
 */
export const calcTotalRevenue = (receipts: Receipt[]): number => {
  return (receipts || [])
    .filter(r => r.status === PaymentStatus.SUCCESS)
    .reduce((sum, r) => sum + getReceiptAmount(r), 0);
};

/**
 * Monthly revenue = receipts for a specific month string (e.g. "May 2026")
 */
export const calcMonthlyRevenue = (receipts: Receipt[], monthString: string): number => {
  return (receipts || [])
    .filter(r =>
      r.status === PaymentStatus.SUCCESS &&
      (r.period === monthString || (r as any).activatedMonth === monthString)
    )
    .reduce((sum, r) => sum + getReceiptAmount(r), 0);
};

/**
 * Annual revenue = sum of all months in a year
 */
export const calcAnnualRevenue = (receipts: Receipt[], year: number): number => {
  return (receipts || [])
    .filter(r => {
      if (r.status !== PaymentStatus.SUCCESS) return false;
      const d = new Date(r.date);
      return d.getFullYear() === year;
    })
    .reduce((sum, r) => sum + getReceiptAmount(r), 0);
};
