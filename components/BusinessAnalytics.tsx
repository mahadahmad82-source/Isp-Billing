import React, { useMemo, useState } from 'react';
import { UserRecord, Receipt, BusinessExpense, AppSettings, PaymentStatus, PaymentMethod } from '../types';
import { calcMonthlyRevenue } from '../utils/revenueCalc';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface BusinessAnalyticsProps {
  users: UserRecord[];
  receipts: Receipt[];
  expenses: BusinessExpense[];
  settings: AppSettings;
}

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];

// Local calendar date as YYYY-MM-DD (not UTC). Using toISOString().slice(0,10)
// for this shifts any date whose time-of-day is near local midnight back by
// one day for Pakistan (UTC+5) — was silently misfiling backdated receipts
// under the wrong day in Daily Collection / Collection Chart.
const toLocalYMD = (value: Date | string): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#0f172a",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"10px 16px"}}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-sm font-bold" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.name.toLowerCase().includes('rs') ? `Rs. ${(Number(p.value)||0).toLocaleString()}` : p.value}
        </p>
      ))}
    </div>
  );
};

const BusinessAnalytics: React.FC<BusinessAnalyticsProps> = ({ users, receipts, expenses, settings }) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'revenue' | 'plans' | 'deductions' | 'daily'>('overview');
  const [dailyViewMode, setDailyViewMode] = useState<'day' | 'month' | 'range'>('day');
  const [dailyStartDate, setDailyStartDate] = useState<string>(() => toLocalYMD(new Date()));
  const [dailyEndDate, setDailyEndDate] = useState<string>(() => toLocalYMD(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toLocalYMD(new Date()).slice(0, 7));
  const [revenueWindowOffset, setRevenueWindowOffset] = useState(0);

  // ── Active/Expired based on expiryDate (source of truth) ──
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const isActiveUser = (u: UserRecord) => {
    if (!u.expiryDate) return false;
    if (u.status === 'pending' || u.status === 'deleted') return false;
    const exp = new Date(u.expiryDate);
    if (isNaN(exp.getTime())) return false;
    exp.setHours(0,0,0,0);
    return exp >= today;
  };

  // Company price (wholesale cost) for the users active in a period.
  // Matches the monthly recovery ledger: a user counts if they were activated
  // for that month OR they have a receipt (any status) for that month.
  const companyPriceForPeriod = (period: string, userList: UserRecord[], receiptList: Receipt[]) => {
    const periodReceipts = (receiptList || []).filter(r => r.period === period);
    return (userList || []).reduce((sum, u) => {
      if (u.status === 'deleted') return sum;
      const activeInPeriod = (u.activatedMonths || []).includes(period) ||
        periodReceipts.some(r => r.userId === u.id || r.username === u.username);
      if (!activeInPeriod) return sum;
      return sum + (Number(settings?.planCompanyPrices?.[u.plan]) || 0);
    }, 0);
  };

  // ── Last 6 months revenue vs expenses ──
  const last6Months = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() + revenueWindowOffset - i);
      const key = d.toISOString().slice(0, 7);
      const monthName = d.toLocaleDateString('en-US', { month: 'long' });
      const year = d.getFullYear();
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const rev = (receipts || [])
        .filter(r => r.status === PaymentStatus.SUCCESS &&
          (r.period || '').includes(monthName) &&
          (r.period || '').includes(String(year)))
        .reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);
      const exp = expenses.filter(e => e.date?.startsWith(key)).reduce((s, e) => s + (e.amount || 0), 0);
      const companyPrice = companyPriceForPeriod(`${monthName} ${year}`, users, receipts);
      months.push({ label, 'Rs. Revenue': rev, 'Rs. Expenses': exp, 'Rs. Company Price': companyPrice, 'Rs. Profit': rev - exp - companyPrice });
    }
    return months;
  }, [receipts, expenses, users, settings, revenueWindowOffset]);

  // ── Plan stats — Revenue = actually collected this month (from receipts).
  // Expected = standard plan price summed across ALL non-deleted users on that plan. ──
  const currentMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const currentMonthNameForPlans = new Date().toLocaleDateString('en-US', { month: 'long' });
  const currentYearForPlans = new Date().getFullYear();
  // ── Month selector options (Android-safe) ──
  const MONTH_OPTIONS = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
      options.push({ value, label });
    }
    return options;
  }, []);

  const handleViewModeChange = (mode: 'day' | 'month' | 'range') => {
    setDailyViewMode(mode);
    const todayStr = toLocalYMD(new Date());
    if (mode === 'day') {
      setDailyStartDate(todayStr);
      setDailyEndDate(todayStr);
    } else if (mode === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      setDailyStartDate(toLocalYMD(new Date(y, m - 1, 1)));
      setDailyEndDate(toLocalYMD(new Date(y, m, 0)));
    }
  };

  const handleMonthChange = (monthStr: string) => {
    setSelectedMonth(monthStr);
    const [y, m] = monthStr.split('-').map(Number);
    setDailyStartDate(toLocalYMD(new Date(y, m - 1, 1)));
    setDailyEndDate(toLocalYMD(new Date(y, m, 0)));
  };

  const planStats = useMemo(() => {
    const map: Record<string, {
      activeCount: number; expiredCount: number;
      revenue: number; discounted: number; expectedFull: number; companyPrice: number;
    }> = {};
    const periodReceipts = (receipts || []).filter(r => r.period === currentMonthLabel);
    users.forEach(u => {
      if (u.status === 'deleted') return;
      if (!map[u.plan]) map[u.plan] = { activeCount: 0, expiredCount: 0, revenue: 0, discounted: 0, expectedFull: 0, companyPrice: 0 };
      const activatedThisMonth = (u.activatedMonths || []).includes(currentMonthLabel);
      const actual = Number(u.monthlyFee) || 0;
      const standard = Number(settings?.planPrices?.[u.plan]) || actual;
      // Expected: total billing potential for this plan — every non-deleted user counts, active or expired
      map[u.plan].expectedFull += standard;
      if (activatedThisMonth) {
        map[u.plan].activeCount++;
        if (actual < standard && standard > 0) map[u.plan].discounted++;
      } else if (!isActiveUser(u)) {
        map[u.plan].expiredCount++;
      }
      // Company price: only for users active this month (same logic as monthly recovery ledger)
      const activeInPeriod = activatedThisMonth ||
        periodReceipts.some(r => r.userId === u.id || r.username === u.username);
      if (activeInPeriod) {
        map[u.plan].companyPrice += Number(settings?.planCompanyPrices?.[u.plan]) || 0;
      }
    });
    // Revenue: only what has actually been collected this month, straight from receipts
    (receipts || []).forEach(r => {
      if (r.status !== PaymentStatus.SUCCESS) return;
      const periodMatch = (r.period || '').includes(currentMonthNameForPlans) && (r.period || '').includes(String(currentYearForPlans));
      if (!periodMatch) return;
      const plan = r.plan || users.find(u => u.id === r.userId || u.username === r.username)?.plan;
      if (!plan || !map[plan]) return;
      map[plan].revenue += (typeof r.paidAmount === 'number' ? r.paidAmount : 0);
    });
    return Object.entries(map)
      .filter(([, d]) => d.activeCount + d.expiredCount > 0)
      .sort((a, b) => b[1].activeCount - a[1].activeCount)
      .map(([plan, d]) => ({
        plan,
        'Active': d.activeCount,
        'Expired': d.expiredCount,
        'Monthly Revenue': d.revenue,
        'Company Price': d.companyPrice,
        'Expected Full': d.expectedFull,
        Discounted: d.discounted,
      }));
  }, [users, receipts, settings, today]);

  // ── Pie: active vs expired by expiryDate ──
  const statusPie = useMemo(() => {
    const active = users.filter(u => isActiveUser(u)).length;
    const expired = users.length - active;
    return [
      { name: 'Active', value: active },
      ...(expired > 0 ? [{ name: 'Expired', value: expired }] : []),
    ];
  }, [users, today]);

  // ── Discount analysis — active users only ──
  // NOTE: monthlyFee is the GROSS/standard plan price; persistentDiscount is subtracted
  // at billing time to get the net amount actually charged (see UserManagement.tsx).
  // So "discounted" must be based on persistentDiscount, not monthlyFee vs planPrices.
  const discountStats = useMemo(() => {
    let fullPrice = 0, discounted = 0, totalLost = 0, totalExpectedFull = 0;
    const activeUsers = users.filter(u => isActiveUser(u));
    activeUsers.forEach(u => {
      const disc = Number(u.persistentDiscount) || 0;
      const standard = Number(u.monthlyFee) || 0;
      totalExpectedFull += standard;
      if (disc > 0) {
        discounted++;
        totalLost += disc;
      } else {
        fullPrice++;
      }
    });
    return { fullPrice, discounted, totalLost, totalExpectedFull };
  }, [users, settings, today]);

  // ── Collection Chart — payment method breakdown for a chosen period ──
  const dailyStats = useMemo(() => {
    const periodReceipts = (receipts || []).filter(r => {
      if (r.status !== PaymentStatus.SUCCESS) return false;
      try {
        const rDate = toLocalYMD(new Date(r.date));
        return rDate >= dailyStartDate && rDate <= dailyEndDate;
      } catch { return false; }
    });
    const methods: PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.MOBILE_MONEY, PaymentMethod.CARD];
    const byMethod = methods.map(m => {
      const list = periodReceipts.filter(r => r.paymentMethod === m);
      const total = list.reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);
      return { method: m, total, count: list.length };
    });
    const totalCollected = periodReceipts.reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);
    return {
      receipts: periodReceipts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      byMethod,
      totalCollected,
      count: periodReceipts.length,
    };
  }, [receipts, dailyStartDate, dailyEndDate]);

  // ── KPI cards ──
  const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const currentYear = new Date().getFullYear();
  const currentPeriodStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentRevenue = (receipts || [])
    .filter(r => r.status === PaymentStatus.SUCCESS &&
      (r.period || '').includes(currentMonthName) &&
      (r.period || '').includes(String(currentYear)))
    .reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);

  const currentExpenses = expenses.filter(e => e.date?.startsWith(new Date().toISOString().slice(0,7)))
    .reduce((s, e) => s + e.amount, 0);

  const activeCount = users.filter(u => isActiveUser(u)).length;
  const expiredCount = users.length - activeCount;

  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue Trend' },
    { id: 'plans', label: 'Plan Analytics' },
    { id: 'deductions', label: 'Discounts' },
    { id: 'daily', label: 'Collection Chart' },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-3xl shadow-sm overflow-hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Business Analytics</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Revenue · Plans · Profit · Discounts</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 overflow-x-auto flex-shrink-0 max-w-full">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all whitespace-nowrap flex-shrink-0 ${activeSection === s.id ? 'bg-white dark:bg-indigo-600 dark:text-white shadow text-slate-900' : 'text-slate-500'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Revenue', value: `Rs.${(Number(currentRevenue)||0).toLocaleString()}`, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/5 border-indigo-500/10' },
              { label: 'Expenses', value: `Rs.${(Number(currentExpenses)||0).toLocaleString()}`, color: 'text-rose-500', bg: 'bg-rose-500/5 border-rose-500/10' },
              { label: 'Gross Profit', value: `Rs.${((currentRevenue-(Number(currentExpenses)))||0).toLocaleString()}`, color: (currentRevenue - currentExpenses) >= 0 ? 'text-emerald-500' : 'text-rose-500', bg: (currentRevenue - currentExpenses) >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10' },
              { label: 'Active / Expired', value: `${activeCount} / ${expiredCount}`, color: 'text-amber-500', bg: 'bg-amber-500/5 border-amber-500/10' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} border rounded-2xl p-3 overflow-hidden`}>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate">{k.label}</p>
                <p className={`text-base font-black ${k.color} truncate`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-[#12162a] dark:to-[#12162a] border border-indigo-100 dark:border-white/5 rounded-3xl p-6 shadow-lg shadow-indigo-900/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Customer Status</p>
              <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-4">By Expiry Date</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={4} dataKey="value" nameKey="name">
                    {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-[#12162a] dark:to-[#12162a] border border-indigo-100 dark:border-white/5 rounded-3xl p-6 shadow-lg shadow-indigo-900/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Users per Plan</p>
              <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-4">Active vs Expired</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={planStats} barSize={22} barCategoryGap="30%">
                  <XAxis dataKey="plan" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Active" radius={[6,6,0,0]} fill="#6366f1" />
                  <Bar dataKey="Expired" radius={[6,6,0,0]} fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── REVENUE TREND ── */}
      {activeSection === 'revenue' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-white via-indigo-50/50 to-white dark:from-[#12162a] dark:via-[#151b35] dark:to-[#12162a] border border-indigo-100 dark:border-white/5 rounded-3xl p-4 md:p-6 shadow-lg shadow-indigo-900/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Revenue vs Expenses vs Company Price</p>
                <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-1">{last6Months[0]?.label} – {last6Months[last6Months.length - 1]?.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setRevenueWindowOffset(value => value - 6)} className="px-3 py-2 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 text-[9px] font-black uppercase tracking-widest hover:bg-indigo-200 dark:hover:bg-indigo-500/20 transition-colors">Older</button>
                <button type="button" onClick={() => setRevenueWindowOffset(value => Math.min(0, value + 6))} disabled={revenueWindowOffset >= 0} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Newer</button>
              </div>
            </div>
            <div className="rounded-2xl bg-white/80 dark:bg-black/10 border border-white dark:border-white/5 p-2 md:p-3 overflow-x-auto custom-scrollbar">
              <div className="min-w-[620px]">
              <ResponsiveContainer width="100%" height={300}>
              <BarChart data={last6Months} barCategoryGap="25%">
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                <Bar dataKey="Rs. Revenue" radius={[6,6,0,0]} fill="#6366f1" />
                <Bar dataKey="Rs. Expenses" radius={[6,6,0,0]} fill="#ef4444" />
                <Bar dataKey="Rs. Company Price" radius={[6,6,0,0]} fill="#f59e0b" />
              </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white via-emerald-50/40 to-white dark:from-[#12162a] dark:via-[#102a2a] dark:to-[#12162a] border border-emerald-100 dark:border-white/5 rounded-3xl p-4 md:p-6 shadow-lg shadow-emerald-900/5">
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-5">Profit Trend (after Expenses & Company Price)</p>
            <div className="rounded-2xl bg-white/80 dark:bg-black/10 border border-white dark:border-white/5 p-2 md:p-3 overflow-x-auto custom-scrollbar">
              <div className="min-w-[620px]">
              <ResponsiveContainer width="100%" height={240}>
              <LineChart data={last6Months}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="Rs. Profit" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} />
              </LineChart>
              </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAN ANALYTICS ── */}
      {activeSection === 'plans' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Users Per Plan</p>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-6">Active = Activated in {currentMonthLabel}</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={planStats} barCategoryGap="30%">
                <XAxis dataKey="plan" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                <Bar dataKey="Active" radius={[6,6,0,0]} fill="#6366f1" />
                <Bar dataKey="Expired" radius={[6,6,0,0]} fill="#ef4444" />
                <Bar dataKey="Discounted" radius={[6,6,0,0]} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl shadow-sm" style={{overflow:'hidden'}}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plan-wise Breakdown</p>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{currentPeriodStr}</span>
            </div>
            <div className="overflow-x-auto" style={{WebkitOverflowScrolling:'touch'}}>
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-slate-50 dark:bg-white/[0.02] text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                  <tr>
                    <th className="px-3 py-3 text-left">Plan</th>
                    <th className="px-2 py-3 text-right text-indigo-400">Active</th>
                    <th className="px-2 py-3 text-right text-rose-400">Expired</th>
                    <th className="px-2 py-3 text-right text-amber-400">Disc.</th>
                    <th className="px-2 py-3 text-right text-emerald-400">Revenue</th>
                    <th className="px-2 py-3 text-right text-amber-500">Company Price</th>
                    <th className="px-2 py-3 text-right text-slate-400">Expected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                  {planStats.map(row => (
                    <tr key={row.plan} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                      <td className="px-3 py-3">
                        <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap">{row.plan}</span>
                      </td>
                      <td className="px-2 py-3 text-right font-black text-indigo-400">{row['Active']}</td>
                      <td className="px-2 py-3 text-right font-bold text-rose-400">{row['Expired']}</td>
                      <td className="px-2 py-3 text-right">
                        {row.Discounted > 0
                          ? <span className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-bold">{row.Discounted}</span>
                          : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-3 text-right font-bold text-emerald-500 text-xs whitespace-nowrap">Rs. {(Number(row['Monthly Revenue'])||0).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right font-bold text-amber-500 text-xs whitespace-nowrap">Rs. {(Number(row['Company Price'])||0).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right text-slate-400 text-xs whitespace-nowrap">Rs. {(Number(row['Expected Full'])||0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-white/[0.02] border-t-2 border-indigo-500/20">
                  <tr>
                    <td className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase">Total</td>
                    <td className="px-2 py-3 text-right font-black text-indigo-400">{planStats.reduce((s,r) => s + r['Active'], 0)}</td>
                    <td className="px-2 py-3 text-right font-black text-rose-400">{planStats.reduce((s,r) => s + r['Expired'], 0)}</td>
                    <td className="px-2 py-3 text-right font-black text-amber-400">{planStats.reduce((s,r) => s + r.Discounted, 0)}</td>
                    <td className="px-2 py-3 text-right font-black text-emerald-500 text-xs whitespace-nowrap">Rs. {planStats.reduce((s,r) => s + r['Monthly Revenue'], 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right font-black text-amber-500 text-xs whitespace-nowrap">Rs. {planStats.reduce((s,r) => s + r['Company Price'], 0).toLocaleString()}</td>
                    <td className="px-2 py-3 text-right font-black text-slate-400 text-xs whitespace-nowrap">Rs. {planStats.reduce((s,r) => s + r['Expected Full'], 0).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── DISCOUNT ANALYSIS ── */}
      {activeSection === 'deductions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 text-center overflow-hidden">
              <p className="text-xl font-black text-emerald-500 truncate">{discountStats.fullPrice}</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Full Price</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-3 text-center overflow-hidden">
              <p className="text-xl font-black text-amber-500 truncate">{discountStats.discounted}</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">On Discount</p>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-3 text-center overflow-hidden">
              <p className="text-[11px] font-black text-rose-500 leading-tight truncate">Rs.{(Number(discountStats.totalLost)||0).toLocaleString()}</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Lost/Month</p>
            </div>
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-3 text-center overflow-hidden">
              <p className="text-[11px] font-black text-indigo-400 leading-tight truncate">Rs.{(Number(discountStats.totalExpectedFull)||0).toLocaleString()}</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Expected Full</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Discounted Users Detail</p>
              <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Active users with a monthly discount applied</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-white/[0.02] text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                  <tr>
                    <th className="px-6 py-4 text-left">Customer</th>
                    <th className="px-6 py-4 text-left">Plan</th>
                    <th className="px-6 py-4 text-right">Standard</th>
                    <th className="px-6 py-4 text-right">Paying</th>
                    <th className="px-6 py-4 text-right">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                  {users.filter(u => (Number(u.persistentDiscount) || 0) > 0 && isActiveUser(u)).map(u => {
                    const std = Number(u.monthlyFee) || 0;
                    const disc = Number(u.persistentDiscount) || 0;
                    const paying = std - disc;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                          <p className="text-[10px] text-slate-400">@{u.username}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg text-[10px] font-bold uppercase">{u.plan}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-500 font-medium">Rs. {std.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-bold text-amber-500">Rs. {paying.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded-lg text-xs font-bold">-Rs. {disc.toLocaleString()}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {users.filter(u => (Number(u.persistentDiscount) || 0) > 0 && isActiveUser(u)).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-xs font-bold">
                        Koi active customer par discount set nahi hai. Customer edit karke "Monthly Discount" field mein amount daalein.
                      </td>
                    </tr>
                  )}
                </tbody>
                {(() => {
                  const discountedList = users.filter(u => (Number(u.persistentDiscount) || 0) > 0 && isActiveUser(u));
                  const totalStd = discountedList.reduce((s, u) => s + (Number(u.monthlyFee) || 0), 0);
                  const totalDiscount = discountedList.reduce((s, u) => s + (Number(u.persistentDiscount) || 0), 0);
                  const totalPaying = totalStd - totalDiscount;
                  if (discountedList.length === 0) return null;
                  return (
                    <tfoot className="bg-slate-50 dark:bg-white/[0.02] border-t-2 border-amber-500/20">
                      <tr>
                        <td className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase" colSpan={2}>Total ({discountedList.length} users)</td>
                        <td className="px-6 py-4 text-right font-black text-slate-500">Rs. {totalStd.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-black text-amber-500">Rs. {totalPaying.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-black text-rose-500">-Rs. {totalDiscount.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── COLLECTION CHART ── */}
      {activeSection === 'daily' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Collection Date</p>
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Payment-method wise breakdown</p>
              </div>
              <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5 w-fit">
                {[
                  { id: 'day', label: 'Single Day' },
                  { id: 'month', label: 'Month' },
                  { id: 'range', label: 'Range' }
                ].map(m => (
                  <button key={m.id} onClick={() => handleViewModeChange(m.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${dailyViewMode === m.id ? 'bg-white dark:bg-indigo-600 dark:text-white shadow text-slate-900' : 'text-slate-500'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
              {dailyViewMode === 'day' && (
                <input type="date" value={dailyStartDate} max={toLocalYMD(new Date())}
                  onChange={e => { setDailyStartDate(e.target.value); setDailyEndDate(e.target.value); }}
                  className="bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500" />
              )}
              {dailyViewMode === 'month' && (
                <select value={selectedMonth} onChange={e => handleMonthChange(e.target.value)}
                  className="bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                  {MONTH_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              )}
              {dailyViewMode === 'range' && (
                <>
                  <input type="date" value={dailyStartDate} max={dailyEndDate}
                    onChange={e => setDailyStartDate(e.target.value)}
                    className="bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500" />
                  <span className="text-slate-400 text-xs font-bold">to</span>
                  <input type="date" value={dailyEndDate} min={dailyStartDate} max={toLocalYMD(new Date())}
                    onChange={e => setDailyEndDate(e.target.value)}
                    className="bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500" />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 overflow-hidden">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Collected</p>
              <p className="text-xl font-black text-emerald-500 truncate">Rs. {dailyStats.totalCollected.toLocaleString()}</p>
            </div>
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 overflow-hidden">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Payments Received</p>
              <p className="text-xl font-black text-indigo-500 truncate">{dailyStats.count}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">By Payment Method</p>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-6">
              {dailyStartDate === dailyEndDate 
                ? new Date(dailyStartDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
                : `${new Date(dailyStartDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })} - ${new Date(dailyEndDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}`
              }
            </p>
            {dailyStats.totalCollected === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 font-bold text-center py-6">No collections were made on this day.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyStats.byMethod} barCategoryGap="35%">
                  <XAxis dataKey="method" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${(Number(v)/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" name="Rs. Collected" radius={[8,8,0,0]} fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Method Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-white/[0.02] text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left">Method</th>
                    <th className="px-6 py-3 text-right">Payments</th>
                    <th className="px-6 py-3 text-right">Collected</th>
                    <th className="px-6 py-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                  {dailyStats.byMethod.map(m => (
                    <tr key={m.method} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                      <td className="px-6 py-3">
                        <span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg text-[10px] font-bold uppercase">{m.method}</span>
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-slate-600 dark:text-slate-300">{m.count}</td>
                      <td className="px-6 py-3 text-right font-black text-emerald-500">Rs. {m.total.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right text-slate-400 text-xs">
                        {dailyStats.totalCollected > 0 ? Math.round((m.total / dailyStats.totalCollected) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-white/[0.02] border-t-2 border-indigo-500/20">
                  <tr>
                    <td className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase">Total</td>
                    <td className="px-6 py-3 text-right font-black text-slate-600 dark:text-slate-300">{dailyStats.count}</td>
                    <td className="px-6 py-3 text-right font-black text-emerald-500">Rs. {dailyStats.totalCollected.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-black text-slate-400 text-xs">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {dailyStats.receipts.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Period Receipts</p>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/[0.02] text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left">Customer</th>
                      <th className="px-6 py-3 text-left">Method</th>
                      <th className="px-6 py-3 text-right">Amount</th>
                      <th className="px-6 py-3 text-right">Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                    {dailyStats.receipts.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                        <td className="px-6 py-3">
                          <p className="font-bold text-slate-900 dark:text-white">{r.userName}</p>
                          <p className="text-[10px] text-slate-400">@{r.username}</p>
                        </td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-1 bg-slate-500/10 text-slate-500 rounded-lg text-[10px] font-bold uppercase">{r.paymentMethod}</span>
                        </td>
                        <td className="px-6 py-3 text-right font-black text-emerald-500">Rs. {(r.paidAmount || 0).toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-slate-400 text-xs">{r.transactionRef || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BusinessAnalytics;
