import React, { useMemo, useState } from 'react';
import { UserRecord, Receipt, BusinessExpense, AppSettings, PaymentStatus } from '../types';
import { calcMonthlyRevenue } from '../utils/revenueCalc';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface BusinessAnalyticsProps {
  users: UserRecord[];
  receipts: Receipt[];
  expenses: BusinessExpense[];
  settings: AppSettings;
}

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];

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
  const [activeSection, setActiveSection] = useState<'overview' | 'revenue' | 'plans' | 'deductions'>('overview');

  const currentMonthKey = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

  // ── Last 6 months revenue vs expenses — same logic as Insights ──
  const last6Months = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7); // YYYY-MM for expenses
      const monthName = d.toLocaleDateString('en-US', { month: 'long' }); // "May"
      const year = d.getFullYear(); // 2026
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      // Use same logic as Insights: match r.period contains month name + year
      const rev = (receipts || [])
        .filter(r => r.status === PaymentStatus.SUCCESS &&
          (r.period || '').includes(monthName) &&
          (r.period || '').includes(String(year)))
        .reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);
      const exp = expenses.filter(e => e.date?.startsWith(key)).reduce((s, e) => s + (e.amount || 0), 0);
      months.push({ label, 'Rs. Revenue': rev, 'Rs. Expenses': exp, 'Rs. Profit': rev - exp });
    }
    return months;
  }, [receipts, expenses]);

  // ── Plan distribution — current month active/expired ──────
  const currentPeriodStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); // "May 2026"
  const planStats = useMemo(() => {
    const map: Record<string, {
      activeCount: number; expiredCount: number;
      revenue: number; discounted: number; expectedFull: number;
    }> = {};
    users.forEach(u => {
      if (!map[u.plan]) map[u.plan] = { activeCount: 0, expiredCount: 0, revenue: 0, discounted: 0, expectedFull: 0 };
      // Active = sirf current month ke activatedMonths (Recoveries se match)
      const isActive = (u.activatedMonths || []).includes(currentPeriodStr);
      if (isActive) {
        map[u.plan].activeCount++;
        const actual = Number(u.monthlyFee) || 0;
        const samePlanUsers = users.filter(x => x.plan === u.plan);
        const maxFee = Math.max(...samePlanUsers.map(x => Number(x.monthlyFee) || 0), 0);
        const standard = Number(settings?.planPrices?.[u.plan]) || maxFee;
        map[u.plan].revenue += actual;
        map[u.plan].expectedFull += standard;
        if (actual < standard && standard > 0) map[u.plan].discounted++;
      } else {
        map[u.plan].expiredCount++;
      }
    });
    return Object.entries(map)
      .filter(([, d]) => d.activeCount + d.expiredCount > 0)
      .sort((a, b) => b[1].activeCount - a[1].activeCount)
      .map(([plan, d]) => ({
        plan,
        'Active': d.activeCount,
        'Expired': d.expiredCount,
        'Monthly Revenue': d.revenue,
        'Expected Full': d.expectedFull,
        Discounted: d.discounted,
      }));
  }, [users, settings, currentPeriodStr]);

  // ── Pie: active vs expired — based on current month activation ──
  const statusPie = useMemo(() => {
    const active = users.filter(u =>
      (u.activatedMonths || []).includes(currentPeriodStr)
    ).length;
    const expired = users.length - active;
    return [
      { name: 'Active', value: active },
      ...(expired > 0 ? [{ name: 'Expired', value: expired }] : []),
    ];
  }, [users, currentPeriodStr]);

  // ── Discount analysis — based on active users vs standard plan price ──
  const discountStats = useMemo(() => {
    let fullPrice = 0, discounted = 0, totalLost = 0, totalExpectedFull = 0;
    const activeUsers = users.filter(u => (u.activatedMonths || []).includes(currentPeriodStr));
    activeUsers.forEach(u => {
      const actual = Number(u.monthlyFee) || 0;
      // Standard price: from planPrices setting OR use highest fee seen for same plan
      const samePlanFees = activeUsers.filter(x => x.plan === u.plan).map(x => Number(x.monthlyFee) || 0);
      const standard = Number(settings?.planPrices?.[u.plan]) || Math.max(...samePlanFees, actual);
      totalExpectedFull += standard;
      if (actual < standard && standard > 0) {
        discounted++;
        totalLost += standard - actual;
      } else {
        fullPrice++;
      }
    });
    return { fullPrice, discounted, totalLost, totalExpectedFull };
  }, [users, settings]);

  // ── KPI cards ──────────────────────────────────────────────
  const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const currentYear = new Date().getFullYear();
  const currentRevenue = (receipts || [])
    .filter(r => r.status === PaymentStatus.SUCCESS &&
      (r.period || '').includes(currentMonthName) &&
      (r.period || '').includes(String(currentYear)))
    .reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);

  const currentExpenses = expenses.filter(e => e.date?.startsWith(new Date().toISOString().slice(0,7)))
    .reduce((s, e) => s + e.amount, 0);

  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue Trend' },
    { id: 'plans', label: 'Plan Analytics' },
    { id: 'deductions', label: 'Discounts' },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Business Analytics</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Revenue · Plans · Profit · Discounts</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSection === s.id ? 'bg-white dark:bg-indigo-600 dark:text-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'This Month Revenue', value: `Rs. ${(Number(currentRevenue)||0).toLocaleString()}`, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/5 border-indigo-500/10' },
              { label: 'This Month Expenses', value: `Rs. ${(Number(currentExpenses)||0).toLocaleString()}`, color: 'text-rose-500', bg: 'bg-rose-500/5 border-rose-500/10' },
              { label: 'Gross Profit', value: `Rs. ${(currentRevenue -(Number(currentExpenses))||0).toLocaleString()}`, color: (currentRevenue - currentExpenses) >= 0 ? 'text-emerald-500' : 'text-rose-500', bg: (currentRevenue - currentExpenses) >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10' },
              { label: 'Total Customers', value: users.length, color: 'text-amber-500', bg: 'bg-amber-500/5 border-amber-500/10' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} border rounded-[1.5rem] p-5`}>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
                <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Status Pie + Plan bar side by side */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Customer Status</p>
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

            <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Users per Plan</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={planStats} barSize={28} barCategoryGap="30%">
                  <XAxis dataKey="plan" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Users" radius={[8,8,0,0]} fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── REVENUE TREND ── */}
      {activeSection === 'revenue' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Revenue vs Expenses — Last 6 Months</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={last6Months} barCategoryGap="25%">
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                <Bar dataKey="Rs. Revenue" radius={[6,6,0,0]} fill="#6366f1" />
                <Bar dataKey="Rs. Expenses" radius={[6,6,0,0]} fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Profit Trend</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={last6Months}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="Rs. Profit" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── PLAN ANALYTICS ── */}
      {activeSection === 'plans' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#12162a] border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Users Per Plan — Current Month</p>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-6">{currentPeriodStr}</p>
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

          {/* Plan detail table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plan-wise Breakdown</p>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{currentPeriodStr}</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-slate-50 dark:bg-white/[0.02] text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                <tr>
                  <th className="px-3 py-3 text-left">Plan</th>
                  <th className="px-2 py-3 text-right text-indigo-400">Active</th>
                  <th className="px-2 py-3 text-right text-rose-400">Expired</th>
                  <th className="px-2 py-3 text-right text-amber-400">Disc.</th>
                  <th className="px-2 py-3 text-right text-emerald-400">Revenue</th>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-emerald-500">{discountStats.fullPrice}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Full Price</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-amber-500">{discountStats.discounted}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">On Discount</p>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 text-center">
              <p className="text-lg font-black text-rose-500 leading-tight">Rs. {(Number(discountStats.totalLost)||0).toLocaleString()}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Lost / Month</p>
            </div>
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 text-center">
              <p className="text-lg font-black text-indigo-400 leading-tight">Rs. {(Number(discountStats.totalExpectedFull)||0).toLocaleString()}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Expected Full</p>
            </div>
          </div>

          {/* Discounted users list */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Discounted Users Detail</p>
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
                  {users.filter(u => {
                    const std = settings.planPrices?.[u.plan] || 0;
                    return (u.monthlyFee || 0) < std;
                  }).map(u => {
                    const std = settings.planPrices?.[u.plan] || 0;
                    const diff = std - (u.monthlyFee || 0);
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                          <p className="text-[10px] text-slate-400">@{u.username}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-lg text-[10px] font-bold uppercase">{u.plan}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-500 font-medium">Rs. {(Number(std)||0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-bold text-amber-500">Rs. {(Number((u.monthlyFee||0))||0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded-lg text-xs font-bold">-Rs. {(Number(diff)||0).toLocaleString()}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessAnalytics;
