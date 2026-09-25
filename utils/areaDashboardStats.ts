import { Receipt, UserRecord } from '../types';

export const NO_AREA = 'No Area';

export type AreaPlanSettings = {
  availablePlans?: { name: string; price: number }[];
  monthlyFee?: number;
};

export interface AreaStats {
  area: string;
  total: number;
  active: number;
  expired: number;
  suspended: number;
  revenue: number;
  yearRevenue: number;
  expected: number;
  pending: number;
  recovery: number;
  plans: Record<string, number>;
}

export function getReceiptPaidDate(receipt: Receipt): Date | null {
  const raw = (receipt as Receipt & { paidAt?: string; createdAt?: string }).paidAt
    || (receipt as Receipt & { createdAt?: string }).createdAt
    || receipt.actualPaymentDate
    || receipt.date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function isSuccessfulReceipt(receipt: Receipt): boolean {
  const status = String(receipt.status || '');
  return status === 'Success' || status === 'success';
}

export function isReceiptInMonth(receipt: Receipt, year: number, monthIndex: number): boolean {
  const d = getReceiptPaidDate(receipt);
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

export function isReceiptInYear(receipt: Receipt, year: number): boolean {
  const d = getReceiptPaidDate(receipt);
  if (!d) return false;
  return d.getFullYear() === year;
}

export function recoveryPercent(collected: number, pending: number): number {
  if (collected <= 0 && pending <= 0) return 0;
  if (pending <= 0 && collected > 0) return 100;
  return Math.round((collected / (collected + pending)) * 100);
}

export function getPlanPrice(user: UserRecord, settings: AreaPlanSettings): number {
  if (settings.availablePlans) {
    const plan = settings.availablePlans.find(p => p.name.toLowerCase() === (user.plan || '').toLowerCase());
    if (plan) return plan.price;
  }
  return settings.monthlyFee || 0;
}

export function userAreaLabel(user: UserRecord): string {
  return (user.area || NO_AREA).trim() || NO_AREA;
}

export function currentMonthLabel(today: Date): string {
  return `${today.toLocaleString('en', { month: 'long' })} ${today.getFullYear()}`;
}

export function isUserSuspended(user: UserRecord): boolean {
  return !!(user as UserRecord & { isSuspended?: boolean }).isSuspended;
}

export function isUserActive(user: UserRecord, today: Date, monthLabel: string): boolean {
  if (user.status === 'deleted' || user.status === 'pending') return false;
  if (user.activatedMonths?.includes(monthLabel)) return true;
  if (!user.expiryDate) return false;
  const exp = new Date(user.expiryDate);
  if (Number.isNaN(exp.getTime())) return false;
  exp.setHours(0, 0, 0, 0);
  const day = new Date(today);
  day.setHours(0, 0, 0, 0);
  return exp >= day;
}

export function yearOptions(receipts: Receipt[], now = new Date()): number[] {
  const current = now.getFullYear();
  const years = new Set<number>();
  for (let y = current - 2; y <= current; y++) years.add(y);
  receipts.forEach(r => {
    const d = getReceiptPaidDate(r);
    if (d) years.add(d.getFullYear());
  });
  return Array.from(years).sort((a, b) => a - b);
}

export function buildAreaStats(
  users: UserRecord[],
  receipts: Receipt[],
  settings: AreaPlanSettings,
  year: number,
  monthIndex: number,
  today: Date,
): AreaStats[] {
  const map: Record<string, AreaStats> = {};
  const monthLabel = currentMonthLabel(today);
  const ensure = (area: string): AreaStats => {
    if (!map[area]) {
      map[area] = {
        area,
        total: 0,
        active: 0,
        expired: 0,
        suspended: 0,
        revenue: 0,
        yearRevenue: 0,
        expected: 0,
        pending: 0,
        recovery: 0,
        plans: {},
      };
    }
    return map[area];
  };

  users.filter(u => u.status !== 'deleted').forEach(u => {
    const s = ensure(userAreaLabel(u));
    s.total++;
    const active = isUserActive(u, today, monthLabel);
    const suspended = isUserSuspended(u);
    if (suspended) s.suspended++;
    else if (active) {
      s.active++;
      s.expected += getPlanPrice(u, settings);
    } else {
      s.expired++;
      s.pending += getPlanPrice(u, settings);
    }
    if (u.plan) s.plans[u.plan] = (s.plans[u.plan] || 0) + 1;
  });

  receipts.forEach(r => {
    if (!isSuccessfulReceipt(r)) return;
    const user = users.find(u => u.id === r.userId);
    if (!user) return;
    const s = map[userAreaLabel(user)];
    if (!s) return;
    const amount = r.paidAmount || 0;
    if (isReceiptInMonth(r, year, monthIndex)) s.revenue += amount;
    if (isReceiptInYear(r, year)) s.yearRevenue += amount;
  });

  Object.values(map).forEach(s => {
    s.recovery = recoveryPercent(s.revenue, s.pending);
  });

  return Object.values(map);
}
