import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { BusinessExpense } from '../../types';
import {
  todayKarachi, formatDayPK, formatRs, formatDue,
  type WaterCustomer, type DashboardNavTarget, type WaterNavAction,
} from './waterTypes';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  businessName?: string;
  expenses: BusinessExpense[];
  onNavigate: (target: DashboardNavTarget) => void;
}

interface DashboardSummary {
  date: string;
  inbox_unhandled: number;
  total_due: number;
  customers_with_due: number;
  bottles_out_total: number;
  today: {
    bottles_delivered: number;
    empties_returned: number;
    billed: number;
    collected_on_delivery: number;
    payments_received: number;
    deliveries_count: number;
    customers_served: number;
    plans_total: number;
    plans_closed: number;
    orders_new: number;
    orders_planned: number;
    orders_bottles: number;
  };
  top_dues: { customer_id: string; balance_due: number; bottles_out: number }[];
}

interface DayRow { date: string; bottles: number; billed: number; collected: number }
interface RiderRow { rider: string; bottles: number; empties: number; collected: number; deliveries: number }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const addDays = (ymd: string, n: number) => {
  const t = new Date(ymd + 'T00:00:00Z').getTime() + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};

const waLink = (phone: string, name: string, due: number, business: string): string | null => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? '92' + digits.slice(1) : digits;
  const text = `Assalam-o-Alaikum ${name}! ${business} ki taraf se reminder: aap ka Rs. ${Math.round(due).toLocaleString('en-US')} baqaya hai. Kindly jald ada kar dein. Shukriya!`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
};

export default function WaterDashboard({ managerId, customers, businessName, expenses, onNavigate }: Props): React.JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [days30, setDays30] = useState<DayRow[]>([]);
  const [ridersToday, setRidersToday] = useState<RiderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'cash' | 'bottles'>('cash');

  const load = useCallback(async () => {
    setError(null);
    try {
      const today = todayKarachi();
      const [sRes, r30Res, rTodayRes] = await Promise.all([
        supabase.rpc('water_dashboard_summary', { p_date: today }),
        supabase.rpc('water_report_summary', { p_from: addDays(today, -29), p_to: today }),
        supabase.rpc('water_report_summary', { p_from: today, p_to: today }),
      ]);
      if (sRes.error) throw new Error(sRes.error.message);
      if (r30Res.error) throw new Error(r30Res.error.message);
      if (rTodayRes.error) throw new Error(rTodayRes.error.message);
      setSummary(sRes.data as DashboardSummary);
      setDays30(((r30Res.data as { by_day?: DayRow[] } | null)?.by_day) || []);
      setRidersToday(((rTodayRes.data as { by_rider?: RiderRow[] } | null)?.by_rider) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    setLoading(true);
    load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const custById = useMemo(() => {
    const m = new Map<string, WaterCustomer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);
  const nameOf = (id: string) => custById.get(id)?.name || '(deleted customer)';

  const t = summary?.today;
  const monthKey = todayKarachi().slice(0, 7);
  const monthCollected = useMemo(
    () => days30.filter(d => d.date.startsWith(monthKey)).reduce((a, d) => a + num(d.collected), 0),
    [days30, monthKey]);
  const monthExpenses = useMemo(
    () => expenses.filter(e => (e.date || '').startsWith(monthKey)).reduce((a, e) => a + num(e.amount), 0),
    [expenses, monthKey]);

  const chartData = chartMode === 'cash' ? days30.map(d => num(d.collected)) : days30.map(d => num(d.bottles));
  const chartMax = Math.max(1, ...chartData);
  const chartTotal = chartData.reduce((a, v) => a + v, 0);

  const goHub = (hubSub: 'today' | 'orders' | 'inbox', hubAction?: WaterNavAction) =>
    onNavigate({ tab: 'water-hub', hubSub, hubAction });

  const alerts: { text: string; go: () => void }[] = [];
  if (summary) {
    if (num(summary.inbox_unhandled) > 0)
      alerts.push({ text: `${num(summary.inbox_unhandled)} unhandled messages`, go: () => goHub('inbox') });
    if (t && num(t.orders_new) > 0)
      alerts.push({ text: `${num(t.orders_new)} new orders`, go: () => goHub('orders') });
    if (t && num(t.plans_total) - num(t.plans_closed) > 0)
      alerts.push({ text: `${num(t.plans_total) - num(t.plans_closed)} plans still open`, go: () => goHub('today') });
  }

  const kpis = t ? [
    {
      label: 'Collected today', value: formatRs(num(t.collected_on_delivery) + num(t.payments_received)),
      sub: `${num(t.deliveries_count)} deliveries`,
      grad: 'from-emerald-500 to-emerald-700', shadow: 'shadow-emerald-500/25',
      icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    },
    {
      label: 'Bottles delivered', value: num(t.bottles_delivered).toLocaleString('en-US'),
      sub: `${num(t.customers_served)} customers served`,
      grad: 'from-sky-500 to-blue-700', shadow: 'shadow-blue-500/25',
      icon: <path d="M12 2.7s6.5 7 6.5 11.3a6.5 6.5 0 1 1-13 0C5.5 9.7 12 2.7 12 2.7z" />,
    },
    {
      label: 'Outstanding dues', value: formatDue(summary?.total_due),
      sub: `${num(summary?.customers_with_due)} customers owe`,
      grad: 'from-rose-500 to-rose-700', shadow: 'shadow-rose-500/25',
      icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
    },
    {
      label: 'Bottles out', value: num(summary?.bottles_out_total).toLocaleString('en-US'),
      sub: 'with customers',
      grad: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25',
      icon: <path d="M8 2h8M9 2v4.5L4.5 18a2.4 2.4 0 0 0 2.1 3.5h10.8a2.4 2.4 0 0 0 2.1-3.5L15 6.5V2M7.5 14h9" />,
    },
  ] : [];

  const actions: { label: string; icon: React.ReactNode; grad: string; go: () => void }[] = [
    { label: 'New plan', grad: 'from-blue-500 to-blue-700', icon: <path d="M12 5v14M5 12h14" />, go: () => goHub('today', 'new-plan') },
    { label: 'Enter deliveries', grad: 'from-sky-500 to-cyan-600', icon: <path d="M12 2.7s6.5 7 6.5 11.3a6.5 6.5 0 1 1-13 0C5.5 9.7 12 2.7 12 2.7z" />, go: () => goHub('today') },
    { label: 'Record payment', grad: 'from-emerald-500 to-emerald-700', icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />, go: () => onNavigate({ tab: 'water-customers', customersView: 'dues' }) },
    { label: 'Add customer', grad: 'from-violet-500 to-purple-700', icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />, go: () => onNavigate({ tab: 'water-customers', customersView: 'directory', customersAction: 'add-customer' }) },
    { label: 'Add order', grad: 'from-amber-500 to-orange-600', icon: <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7 12 12l8.7-5M12 22V12" />, go: () => goHub('orders', 'add-order') },
    { label: 'Generate bills', grad: 'from-rose-500 to-rose-700', icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6" />, go: () => onNavigate({ tab: 'water-billing' }) },
  ];

  const card = 'rounded-[1.6rem] bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 shadow-sm';
  const sectionTitle = 'text-[11px] font-black uppercase tracking-[0.15em] text-[#64748b] dark:text-[#94a3b8]';

  return (
    <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#0f172a] dark:text-white tracking-tight">Assalam-o-Alaikum</h1>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]">
              Today • {formatDayPK(todayKarachi())}
            </span>
            {businessName && <span className="ml-2 font-semibold">{businessName}</span>}
          </p>
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} disabled={loading} aria-label="Refresh dashboard"
          className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center gap-2 disabled:opacity-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
        </button>
      </div>

      {loading && !summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" aria-label="Loading dashboard">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-[1.6rem] bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className={`${card} p-8 text-center mb-4`}>
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load dashboard</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
        </div>
      )}

      {summary && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {kpis.map(k => (
              <div key={k.label} className={`relative overflow-hidden rounded-[1.6rem] p-4 md:p-5 text-white bg-gradient-to-br ${k.grad} shadow-lg ${k.shadow}`}>
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full pointer-events-none" aria-hidden="true" />
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-3 relative">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">{k.icon}</svg>
                </div>
                <div className="text-xl md:text-2xl font-black relative truncate">{k.value}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-white/75 relative mt-1">{k.label}</div>
                <div className="text-[11px] font-semibold text-white/70 relative">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Collection chart */}
          <div className={`${card} p-5 mb-4`}>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-black text-[#0f172a] dark:text-white">Collection Analytics</h2>
                <p className={`${sectionTitle} mt-0.5`}>Last 30 days</p>
              </div>
              <div className="flex gap-1.5 p-1 rounded-2xl bg-[#f1f5f9] dark:bg-white/5">
                {(['cash', 'bottles'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setChartMode(m)} aria-pressed={chartMode === m}
                    className={`min-h-[36px] px-4 rounded-xl text-xs font-bold border border-transparent transition-colors ${chartMode === m
                      ? 'bg-[#1d4ed8] text-white'
                      : 'text-[#64748b] dark:text-[#94a3b8]'}`}>
                    {m === 'cash' ? 'Cash' : 'Bottles'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-2xl font-black text-[#0f172a] dark:text-white mb-4">
              {chartMode === 'cash' ? formatRs(chartTotal) : `${Math.round(chartTotal).toLocaleString('en-US')} bottles`}
            </p>
            {chartData.length > 0 ? (
              <svg viewBox={`0 0 ${chartData.length * 14} 160`} className="w-full h-40" role="img" aria-label="Collection last 30 days" preserveAspectRatio="none">
                {chartData.map((v, i) => {
                  const h = Math.max(4, (v / chartMax) * 150);
                  const isToday = i === chartData.length - 1;
                  const fill = chartMode === 'cash' ? (isToday ? '#10b981' : '#6ee7b7') : (isToday ? '#2563eb' : '#93c5fd');
                  const tip = chartMode === 'cash' ? formatRs(v) : `${Math.round(v)} bottles`;
                  return <rect key={i} x={i * 14 + 3} y={160 - h} width={8} height={h} rx={3} fill={fill}><title>{tip}</title></rect>;
                })}
              </svg>
            ) : (
              <p className="text-sm text-[#94a3b8] text-center py-8">No collection data yet</p>
            )}
          </div>

          {/* Month strip */}
          <div className={`${card} p-5 mb-4`}>
            <p className={`${sectionTitle} mb-3`}>{todayKarachi().slice(0, 7)} — so far</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] font-black text-[#64748b] uppercase tracking-widest mb-1">Collected</p>
                <p className="text-base md:text-xl font-black text-[#15803d] dark:text-[#4ade80]">{formatRs(monthCollected)}</p>
              </div>
              <div className="border-x border-[#e2e8f0] dark:border-white/10">
                <p className="text-[10px] font-black text-[#64748b] uppercase tracking-widest mb-1">Expenses</p>
                <p className="text-base md:text-xl font-black text-[#b91c1c] dark:text-[#f87171]">{formatRs(monthExpenses)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-[#64748b] uppercase tracking-widest mb-1">Profit</p>
                <p className="text-base md:text-xl font-black text-[#0f172a] dark:text-white">{formatRs(monthCollected - monthExpenses)}</p>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {alerts.map((a, i) => (
                <button key={i} type="button" onClick={a.go}
                  className="w-full text-left min-h-[52px] px-4 rounded-2xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-sm font-bold text-[#92400e] dark:text-[#fbbf24] flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                  {a.text}
                </button>
              ))}
            </div>
          )}

          {/* Top dues + Riders */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-black text-[#0f172a] dark:text-white">Top dues</h2>
                <button type="button" onClick={() => onNavigate({ tab: 'water-customers', customersView: 'dues' })}
                  className="text-[11px] font-black uppercase tracking-widest text-[#1d4ed8] dark:text-[#93c5fd]">View all</button>
              </div>
              {(summary.top_dues || []).length === 0 && (
                <p className="text-sm text-[#94a3b8] text-center py-4">No outstanding dues</p>
              )}
              {(summary.top_dues || []).slice(0, 5).map(d => {
                const c = custById.get(d.customer_id);
                const link = c ? waLink(c.phone || '', c.name, d.balance_due, businessName || 'our water supply') : null;
                return (
                  <div key={d.customer_id} className="flex items-center gap-3 py-2.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                    <button type="button" className="flex-1 min-w-0 text-left flex items-center gap-3"
                      onClick={() => onNavigate({ tab: 'water-customers', customersView: 'dues', customerId: d.customer_id })}
                      aria-label={`Open ledger for ${nameOf(d.customer_id)}`}>
                      <div className="w-9 h-9 rounded-full bg-[rgba(239,68,68,0.1)] text-[#b91c1c] dark:text-[#f87171] flex items-center justify-center font-black text-sm shrink-0">
                        {nameOf(d.customer_id).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{nameOf(d.customer_id)}</p>
                        <p className="text-[11px] text-[#94a3b8]">{num(d.bottles_out)} bottles out</p>
                      </div>
                    </button>
                    <p className="text-sm font-black text-[#b91c1c] dark:text-[#f87171] shrink-0">{formatDue(d.balance_due)}</p>
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" aria-label={`Remind ${nameOf(d.customer_id)} on WhatsApp`}
                        className="w-10 h-10 rounded-xl bg-[rgba(34,197,94,0.1)] text-[#15803d] dark:text-[#4ade80] flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 1 1 8.38 4.63M12.05 0A11.8 11.8 0 0 0 .27 11.79c0 2.08.55 4.11 1.58 5.9L.05 24l6.4-1.68a11.8 11.8 0 0 0 5.6 1.42h.01A11.8 11.8 0 0 0 12.05 0" /></svg>
                      </a>
                    ) : <span className="w-10 shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-black text-[#0f172a] dark:text-white">Riders today</h2>
                <button type="button" onClick={() => onNavigate({ tab: 'water-more' })}
                  className="text-[11px] font-black uppercase tracking-widest text-[#1d4ed8] dark:text-[#93c5fd]">Manage</button>
              </div>
              {ridersToday.length === 0 && (
                <p className="text-sm text-[#94a3b8] text-center py-4">No rider activity today</p>
              )}
              {ridersToday.slice(0, 5).map(r => (
                <div key={r.rider} className="flex items-center gap-3 py-2.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                  <div className="w-10 h-10 rounded-2xl bg-[rgba(59,130,246,0.1)] text-[#1d4ed8] dark:text-[#93c5fd] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{r.rider}</p>
                    <p className="text-[11px] text-[#94a3b8]">{num(r.bottles)} bottles • {formatRs(num(r.collected))}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] shrink-0">active</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="mb-4">
            <p className={`${sectionTitle} mb-3`}>Quick actions</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
              {actions.map(a => (
                <button key={a.label} type="button" onClick={a.go}
                  className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-3 md:p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform min-h-[96px] justify-center">
                  <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${a.grad} text-white flex items-center justify-center`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">{a.icon}</svg>
                  </span>
                  <span className="text-[11px] font-bold text-[#0f172a] dark:text-white text-center leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
