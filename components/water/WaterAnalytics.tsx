import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { BusinessExpense } from '../../types';
import type { WaterCustomer, WaterLedgerRow } from './waterTypes';
import { todayKarachi, formatRs, formatDayPK } from './waterTypes';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  expenses: BusinessExpense[];
}

interface MonthInfo { ym: string; label: string; from: string; to: string; }

interface MonthReport {
  totals: {
    bottles_delivered: number;
    billed: number;
    collected_on_delivery: number;
    deliveries: number;
    customers_served: number;
  };
  payments_received: number;
  by_rider: { rider: string; bottles: number; empties: number; collected: number; deliveries: number }[];
  by_route: { route: string; bottles: number; collected: number; deliveries: number }[];
}

const buildMonths = (today: string): MonthInfo[] => {
  const [y, m] = today.split('-').map(Number);
  const list: MonthInfo[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1;
    const ym = `${yy}-${String(mm).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    let to = `${ym}-${String(lastDay).padStart(2, '0')}`;
    if (to > today) to = today;
    const label = new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    list.push({ ym, label, from: `${ym}-01`, to });
  }
  return list;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * M6c: water analytics (manager only). Six-month trend via water_report_summary
 * (one RPC per month, parallel), cash profit = Collected − Expenses, plus
 * outstanding / bottles-out / inactive / rider & route performance.
 * No new backend; frontend only sums and formats.
 */
export default function WaterAnalytics({ managerId, customers, expenses }: Props): React.JSX.Element {
  const today = todayKarachi();
  const months = useMemo(() => buildMonths(today), [today]);
  const [reports, setReports] = useState<(MonthReport | null)[]>([]);
  const [ledger, setLedger] = useState<WaterLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selYm, setSelYm] = useState(months[months.length - 1].ym);

  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const nameOf = (id: string) => live.find(c => c.id === id)?.name || '(deleted customer)';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repRes, ledRes] = await Promise.all([
        Promise.all(months.map(m =>
          supabase.rpc('water_report_summary', { p_from: m.from, p_to: m.to })
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              return data as MonthReport;
            })
        )),
        supabase.from('water_customer_ledger').select('*').eq('manager_id', managerId),
      ]);
      if (ledRes.error) throw new Error(ledRes.error.message);
      setReports(repRes);
      setLedger((ledRes.data as WaterLedgerRow[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [managerId, months]);

  useEffect(() => { load(); }, [load]);

  const expByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const ym = (e.date || '').slice(0, 7);
      if (!ym) continue;
      map.set(ym, (map.get(ym) || 0) + (Number(e.amount) || 0));
    }
    return map;
  }, [expenses]);

  const trend = useMemo(() => months.map((m, i) => {
    const r = reports[i];
    const collected = num(r?.totals.collected_on_delivery) + num(r?.payments_received);
    const exp = expByMonth.get(m.ym) || 0;
    return { ...m, bottles: num(r?.totals.bottles_delivered), collected, expenses: exp, profit: collected - exp };
  }), [months, reports, expByMonth]);

  const maxBottles = Math.max(1, ...trend.map(t => t.bottles));
  const maxMoney = Math.max(1, ...trend.map(t => Math.max(t.collected, t.expenses)));

  const dueRows = useMemo(() =>
    ledger.filter(r => r.balance_due > 0).sort((a, b) => b.balance_due - a.balance_due),
    [ledger]);
  const totalDue = dueRows.reduce((s, r) => s + r.balance_due, 0);

  const bottleRows = useMemo(() =>
    ledger.filter(r => r.bottles_out > 0).sort((a, b) => b.bottles_out - a.bottles_out),
    [ledger]);
  const totalBottlesOut = bottleRows.reduce((s, r) => s + r.bottles_out, 0);

  const inactive = useMemo(() => {
    const cutoff = (() => {
      const t = new Date(today + 'T00:00:00Z').getTime() - 14 * 86400000;
      return new Date(t).toISOString().slice(0, 10);
    })();
    const byId = new Map(ledger.map(r => [r.customer_id, r]));
    return live
      .map(c => ({ c, row: byId.get(c.id) }))
      .filter(({ row }) => !row?.last_delivery_date || row.last_delivery_date < cutoff)
      .sort((a, b) => (a.row?.last_delivery_date || '').localeCompare(b.row?.last_delivery_date || ''));
  }, [live, ledger, today]);

  const selReport = reports[months.findIndex(m => m.ym === selYm)] || null;

  const section = 'rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4';
  const secTitle = 'text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-3';
  const secTitleTight = 'text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]';

  return (
    <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-black text-[#0f172a] dark:text-white mb-4">Analytics</h1>

      {error && (
        <div className="rounded-2xl bg-[rgba(239,68,68,0.1)] p-4 mb-4">
          <p className="text-sm font-bold text-[#b91c1c] dark:text-[#f87171] mb-2">{error}</p>
          <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#dc2626] text-white text-base font-bold">Retry</button>
        </div>
      )}
      {loading && <p className="text-sm text-[#94a3b8] text-center py-8">Loading…</p>}

      {!loading && !error && (
        <>
          {/* Six-month trend */}
          <div className={section}>
            <p className={secTitle}>Last 6 months</p>
            {trend.every(t => t.bottles === 0 && t.collected === 0) ? (
              <p className="text-sm text-[#94a3b8] text-center py-4">No data yet — deliveries will appear here.</p>
            ) : (
              <>
                <div className="flex items-end gap-2 h-28 mb-1" role="img" aria-label="Bottles per month, last 6 months">
                  {trend.map(t => (
                    <div key={t.ym} className="flex-1 flex flex-col items-center justify-end h-full">
                      <span className="text-[10px] font-bold text-[#64748b] dark:text-[#94a3b8] mb-1">{t.bottles > 0 ? t.bottles : ''}</span>
                      <div className="w-full max-w-[36px] rounded-t-lg bg-[#3b82f6]" style={{ height: `${Math.max(4, (t.bottles / maxBottles) * 88)}px`, opacity: 0.85 }} title={`${t.label}: ${t.bottles} bottles`} />
                      <span className="text-[9px] text-[#94a3b8] mt-1">{t.label.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mt-4 mb-2">Collected vs Expenses</p>
                <div className="space-y-2">
                  {trend.map(t => (
                    <div key={t.ym}>
                      <div className="flex justify-between text-[11px] font-bold text-[#64748b] dark:text-[#94a3b8] mb-1">
                        <span>{t.label}</span>
                        <span className={t.profit >= 0 ? 'text-[#15803d] dark:text-[#4ade80]' : 'text-[#b91c1c] dark:text-[#f87171]'}>
                          Profit {t.profit >= 0 ? '' : '−'}{formatRs(Math.abs(t.profit))}
                        </span>
                      </div>
                      <div className="flex gap-1 h-4" title={`${t.label}: collected ${formatRs(t.collected)}, expenses ${formatRs(t.expenses)}`}>
                        <div className="rounded bg-[#22c55e]" style={{ width: `${(t.collected / maxMoney) * 100}%`, minWidth: t.collected > 0 ? '4px' : 0 }} />
                        <div className="rounded bg-[#ef4444]" style={{ width: `${(t.expenses / maxMoney) * 100}%`, minWidth: t.expenses > 0 ? '4px' : 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-[11px] font-semibold text-[#64748b] dark:text-[#94a3b8]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#22c55e] inline-block" />Collected</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#ef4444] inline-block" />Expenses</span>
                </div>
              </>
            )}
          </div>

          {/* Outstanding */}
          <div className={section}>
            <div className="flex items-center justify-between mb-3">
              <p className={secTitleTight}>Outstanding</p>
              <p className="text-base font-black text-[#b91c1c] dark:text-[#f87171]">{formatRs(totalDue)}</p>
            </div>
            {dueRows.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">No outstanding dues.</p>
            ) : (
              <div className="space-y-2">
                {dueRows.slice(0, 10).map(r => (
                  <div key={r.customer_id} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{nameOf(r.customer_id)}</p>
                      <p className="text-[11px] text-[#94a3b8]">Last paid: {r.last_payment_date ? formatDayPK(r.last_payment_date) : '—'}</p>
                    </div>
                    <p className="shrink-0 text-sm font-black text-[#b91c1c] dark:text-[#f87171]">{formatRs(r.balance_due)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottles out */}
          <div className={section}>
            <div className="flex items-center justify-between mb-3">
              <p className={secTitleTight}>Bottles with customers</p>
              <p className="text-base font-black text-[#0f172a] dark:text-white">{totalBottlesOut.toLocaleString('en-US')}</p>
            </div>
            {bottleRows.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">No bottles out.</p>
            ) : (
              <div className="space-y-2">
                {bottleRows.slice(0, 10).map(r => (
                  <div key={r.customer_id} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                    <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{nameOf(r.customer_id)}</p>
                    <p className="shrink-0 text-sm font-black text-[#0f172a] dark:text-white">{r.bottles_out} bottles</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inactive customers */}
          <div className={section}>
            <p className={secTitle}>Inactive — no delivery in 14 days ({inactive.length})</p>
            {inactive.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">Everyone got a delivery recently.</p>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {inactive.slice(0, 30).map(({ c, row }) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                    <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{c.name}</p>
                    <p className="shrink-0 text-[11px] text-[#94a3b8]">{row?.last_delivery_date ? formatDayPK(row.last_delivery_date) : 'Never'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rider & route performance */}
          <div className={section}>
            <div className="flex items-center justify-between mb-3">
              <p className={secTitleTight}>Rider & route performance</p>
              <select value={selYm} onChange={e => setSelYm(e.target.value)} aria-label="Select month"
                className="min-h-[44px] pl-3 pr-8 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white outline-none">
                {months.map(m => <option key={m.ym} value={m.ym}>{m.label}</option>)}
              </select>
            </div>
            {!selReport || ((selReport.by_rider || []).length === 0 && (selReport.by_route || []).length === 0) ? (
              <p className="text-sm text-[#94a3b8]">No rider or route data for this month.</p>
            ) : (
              <>
                {(selReport.by_rider || []).length > 0 && (
                  <>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">By rider</p>
                    <div className="space-y-2 mb-4">
                      {(selReport.by_rider || []).map(r => (
                        <div key={r.rider} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                          <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{r.rider || '—'}</p>
                          <p className="shrink-0 text-xs font-semibold text-[#64748b] dark:text-[#94a3b8]">
                            {r.bottles} bottles • {formatRs(r.collected)} • {r.deliveries} stops
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {(selReport.by_route || []).length > 0 && (
                  <>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">By route</p>
                    <div className="space-y-2">
                      {(selReport.by_route || []).map(r => (
                        <div key={r.route} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                          <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{r.route || '—'}</p>
                          <p className="shrink-0 text-xs font-semibold text-[#64748b] dark:text-[#94a3b8]">
                            {r.bottles} bottles • {formatRs(r.collected)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
