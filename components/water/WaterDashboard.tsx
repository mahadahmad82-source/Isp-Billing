import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  todayKarachi, formatDayPK, formatRs, formatDue,
  type WaterCustomer, type WaterNavRequest,
} from './waterTypes';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  businessName?: string;
  onNavigate: (req: WaterNavRequest) => void;
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
  last7: { date: string; bottles: number; cash: number }[];
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export default function WaterDashboard({ managerId, customers, onNavigate }: Props): React.JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_dashboard_summary', { p_date: todayKarachi() });
      if (error) throw new Error(error.message);
      setSummary(data as DashboardSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60000);
    return () => clearInterval(iv);
  }, [load, managerId]);

  const nameOf = (id: string) => customers.find(c => c.id === id)?.name || '(deleted customer)';
  const t = summary?.today;

  const kpis: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: string }[] = t ? [
    {
      label: 'Bottles delivered', value: num(t.bottles_delivered).toLocaleString('en-US'),
      sub: `${num(t.deliveries_count)} deliveries`, icon: <IconDrop />,
      tone: 'bg-[rgba(59,130,246,0.12)] text-[#1d4ed8] dark:text-[#93c5fd]',
    },
    {
      label: 'Cash collected', value: formatRs(num(t.collected_on_delivery) + num(t.payments_received)),
      sub: 'delivery + payments', icon: <IconCash />,
      tone: 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]',
    },
    {
      label: 'Pending orders', value: String(num(t.orders_new) + num(t.orders_planned)),
      sub: `${num(t.orders_bottles).toLocaleString('en-US')} bottles`, icon: <IconBox />,
      tone: 'bg-[rgba(245,158,11,0.12)] text-[#b45309] dark:text-[#fbbf24]',
    },
    {
      label: 'Plans', value: `${num(t.plans_closed)}/${num(t.plans_total)}`,
      sub: 'closed / total', icon: <IconRoute />,
      tone: 'bg-[rgba(139,92,246,0.12)] text-[#7c3aed] dark:text-[#c4b5fd]',
    },
    {
      label: 'Total due', value: formatDue(summary?.total_due),
      sub: `${num(summary?.customers_with_due)} customers`, icon: <IconDue />,
      tone: 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]',
    },
    {
      label: 'Bottles out', value: num(summary?.bottles_out_total).toLocaleString('en-US'),
      sub: 'with customers', icon: <IconBottle />,
      tone: 'bg-[rgba(20,184,166,0.12)] text-[#0f766e] dark:text-[#5eead4]',
    },
  ] : [];

  const alerts: { text: string; sub: WaterNavRequest }[] = [];
  if (summary) {
    if (num(summary.inbox_unhandled) > 0) alerts.push({ text: `${num(summary.inbox_unhandled)} unhandled messages`, sub: { sub: 'inbox' } });
    if (t && num(t.orders_new) > 0) alerts.push({ text: `${num(t.orders_new)} new orders`, sub: { sub: 'orders' } });
    if (t && num(t.plans_total) - num(t.plans_closed) > 0) alerts.push({ text: `${num(t.plans_total) - num(t.plans_closed)} plans still open`, sub: { sub: 'today' } });
  }

  const actions: { label: string; icon: React.ReactNode; req: WaterNavRequest }[] = [
    { label: 'New plan', icon: <IconPlus />, req: { sub: 'today', action: 'new-plan' } },
    { label: 'Enter deliveries', icon: <IconDrop />, req: { sub: 'today' } },
    { label: 'Add order', icon: <IconBox />, req: { sub: 'orders', action: 'add-order' } },
    { label: 'Record payment', icon: <IconCash />, req: { sub: 'ledger', action: 'record-payment' } },
    { label: 'Add customer', icon: <IconUser />, req: { sub: 'customers', action: 'add-customer' } },
  ];

  const last7 = summary?.last7 || [];
  const maxBottles = Math.max(1, ...last7.map(d => num(d.bottles)));

  return (
    <div className="px-4 py-4 md:px-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Dashboard</h1>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]">
              Today • {formatDayPK(todayKarachi())}
            </span>
          </p>
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} disabled={loading} aria-label="Refresh dashboard"
          className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center gap-2 disabled:opacity-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
        </button>
      </div>

      {loading && !summary && (
        <div className="grid grid-cols-2 gap-2 mb-4" aria-label="Loading dashboard">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-24 rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center mb-4">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load dashboard</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
        </div>
      )}

      {summary && !error && (
        <>
          {alerts.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {alerts.map((a, i) => (
                <button key={i} type="button" onClick={() => onNavigate(a.sub)}
                  className="w-full text-left min-h-[48px] px-4 rounded-2xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-sm font-bold text-[#92400e] dark:text-[#fbbf24] flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
                  {a.text}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-4">
            {kpis.map(k => (
              <div key={k.label} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center mb-2 ${k.tone}`}>{k.icon}</div>
                <div className="text-lg font-black text-[#0f172a] dark:text-white truncate">{k.value}</div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">{k.label}</div>
                {k.sub && <div className="text-[11px] text-[#94a3b8] font-semibold">{k.sub}</div>}
              </div>
            ))}
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-3">Last 7 days</p>
            {last7.length === 0 ? (
              <p className="text-sm text-[#94a3b8] text-center py-4">No delivery data yet</p>
            ) : (
              <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label="Bottles delivered, last 7 days">
                {last7.map((d, i) => {
                  const bw = 320 / 7;
                  const x = i * bw + bw * 0.22;
                  const w = bw * 0.56;
                  const h = Math.max(4, (num(d.bottles) / maxBottles) * 100);
                  const y = 108 - h;
                  return (
                    <g key={d.date}>
                      <title>{`${d.date}: ${num(d.bottles)} bottles, ${formatRs(num(d.cash))}`}</title>
                      <rect x={x} y={y} width={w} height={h} rx={4} fill="#3b82f6" opacity={0.85} />
                      <text x={x + w / 2} y={122} textAnchor="middle" fontSize={9} fill="#94a3b8">
                        {d.date.slice(5)}
                      </text>
                      <text x={x + w / 2} y={136} textAnchor="middle" fontSize={8} fill="#64748b">
                        {num(d.bottles) > 0 ? num(d.cash) >= 1000 ? `${Math.round(num(d.cash) / 1000)}k` : String(num(d.cash)) : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {summary.top_dues.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">Top dues</p>
              <div className="flex flex-col gap-1">
                {summary.top_dues.slice(0, 5).map(d => (
                  <button key={d.customer_id} type="button"
                    onClick={() => onNavigate({ sub: 'ledger', customerId: d.customer_id })}
                    className="w-full flex items-center justify-between gap-3 min-h-[48px] px-2 rounded-2xl hover:bg-[#f8fafc] dark:hover:bg-white/5 text-left">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[#0f172a] dark:text-white truncate">{nameOf(d.customer_id)}</span>
                      <span className="block text-[11px] text-[#94a3b8] font-semibold">{num(d.bottles_out)} bottles out</span>
                    </span>
                    <span className="shrink-0 text-sm font-black text-[#b91c1c] dark:text-[#f87171]">{formatDue(d.balance_due)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">Quick actions</p>
          <div className="grid grid-cols-2 gap-2 pb-8">
            {actions.map(a => (
              <button key={a.label} type="button" onClick={() => onNavigate(a.req)}
                className="min-h-[60px] rounded-3xl bg-[#1d4ed8] text-white text-sm font-black flex items-center justify-center gap-2 px-3 active:scale-[0.98] transition-transform">
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Inline SVG icons only ── */
function Ic({ children, className = 'w-5 h-5' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
  );
}
const IconDrop = () => (<Ic><path d="M12 2.7 6.7 8.6a7 7 0 1 0 10.6 0Z" /></Ic>);
const IconCash = () => (<Ic><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></Ic>);
const IconBox = () => (<Ic><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></Ic>);
const IconRoute = () => (<Ic><circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M9 19h6.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H15" /></Ic>);
const IconDue = () => (<Ic><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></Ic>);
const IconBottle = () => (<Ic><path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3Z" /><path d="M8 13h8" /></Ic>);
const IconPlus = () => (<Ic><path d="M12 5v14M5 12h14" /></Ic>);
const IconUser = () => (<Ic><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Ic>);
