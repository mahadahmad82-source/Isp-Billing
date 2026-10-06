import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { BusinessExpense } from '../../types';
import { todayKarachi, formatRs, formatDayPK } from './waterTypes';

interface Props {
  managerId: string;
  expenses: BusinessExpense[];
}

type Preset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';

interface ReportSummary {
  from: string;
  to: string;
  payments_received: number;
  totals: {
    bottles_delivered: number;
    empties_returned: number;
    billed: number;
    collected_on_delivery: number;
    deliveries: number;
    customers_served: number;
  };
  by_day: { date: string; bottles: number; billed: number; collected: number }[];
  by_rider: { rider: string; bottles: number; empties: number; collected: number; deliveries: number }[];
  by_vehicle: { vehicle: string; bottles: number; collected: number; deliveries: number }[];
  by_route: { route: string; bottles: number; collected: number; deliveries: number }[];
}

const addDays = (ymd: string, n: number) => {
  const t = new Date(ymd + 'T00:00:00Z').getTime() + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};

const monthStartOf = (ymd: string) => ymd.slice(0, 7) + '-01';
const monthEndOf = (ymd: string) => {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

/**
 * M6b: water business reports. All numbers come from the water_report_summary
 * RPC; frontend only sums/formats. Cash profit = Collected − Expenses.
 */
export default function WaterReports({ managerId, expenses }: Props): React.JSX.Element {
  const today = todayKarachi();
  const [preset, setPreset] = useState<Preset>('last7');
  const [customFrom, setCustomFrom] = useState(addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    switch (preset) {
      case 'today': return { from: today, to: today };
      case 'last7': return { from: addDays(today, -6), to: today };
      case 'thisMonth': return { from: monthStartOf(today), to: today };
      case 'lastMonth': {
        const prev = addDays(monthStartOf(today), -1);
        return { from: monthStartOf(prev), to: monthEndOf(prev) };
      }
      case 'custom': return { from: customFrom, to: customTo };
    }
  }, [preset, today, customFrom, customTo]);

  const rangeError = useMemo(() => {
    if (from > to) return 'Start date end date se pehle honi chahiye.';
    const days = Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86400000) + 1;
    if (days > 366) return 'Period 366 din se zyada nahi ho sakta.';
    return null;
  }, [from, to]);

  const load = useCallback(async () => {
    if (rangeError) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_report_summary', { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      setSummary(data as ReportSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load report.');
    } finally {
      setLoading(false);
    }
  }, [managerId, from, to, rangeError]);

  useEffect(() => { load(); }, [load]);

  const t = summary?.totals;
  const collected = (t?.collected_on_delivery || 0) + (summary?.payments_received || 0);
  const periodExpenses = useMemo(
    () => expenses.filter(e => e.date >= from && e.date <= to).reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses, from, to]
  );
  const profit = collected - periodExpenses;

  const byDay = summary?.by_day || [];
  const maxBottles = Math.max(1, ...byDay.map(d => d.bottles));

  const downloadCsv = () => {
    if (!summary) return;
    const lines = ['\uFEFFDay,Bottles,Billed,Collected'];
    for (const d of byDay) lines.push(`${d.date},${d.bottles},${d.billed},${d.collected}`);
    lines.push('', 'Rider,Bottles,Empties,Collected,Deliveries');
    for (const r of summary.by_rider || []) lines.push(`"${r.rider}",${r.bottles},${r.empties},${r.collected},${r.deliveries}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `water-report_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  const kpis = [
    { label: 'Bottles delivered', v: (t?.bottles_delivered || 0).toLocaleString('en-US'), tone: 'text-[#0f172a] dark:text-white' },
    { label: 'Billed', v: formatRs(t?.billed || 0), tone: 'text-[#0f172a] dark:text-white' },
    { label: 'Collected', v: formatRs(collected), tone: 'text-[#15803d] dark:text-[#4ade80]' },
    { label: 'Expenses', v: formatRs(periodExpenses), tone: 'text-[#b91c1c] dark:text-[#f87171]' },
    { label: 'Cash profit', v: `${profit < 0 ? '−' : ''}${formatRs(Math.abs(profit))}`, tone: profit >= 0 ? 'text-[#15803d] dark:text-[#4ade80]' : 'text-[#b91c1c] dark:text-[#f87171]' },
  ];

  const thCls = "text-left px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]";
  const tdCls = "px-2.5 py-2 text-[13px] font-semibold text-[#0f172a] dark:text-white border-t border-[#f1f5f9] dark:border-white/5";

  const table = (title: string, heads: string[], rows: React.ReactNode) => (
    <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4 overflow-x-auto">
      <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">{title}</p>
      <table className="w-full min-w-[420px]">
        <thead><tr>{heads.map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );

  return (
    <div className="px-4 py-4 md:px-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Reports</h1>
        <button type="button" onClick={downloadCsv} disabled={!summary}
          className="min-h-[44px] px-4 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
          Download CSV
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="tablist" aria-label="Period">
        {PRESETS.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={preset === p.id} onClick={() => setPreset(p.id)}
            className={`shrink-0 min-h-[44px] px-4 rounded-2xl text-sm font-bold ${preset === p.id
              ? 'bg-[#1d4ed8] text-white' : 'bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex gap-2 mb-3">
          <input type="date" value={customFrom} max={today} onChange={e => e.target.value && setCustomFrom(e.target.value)} aria-label="From date"
            className="flex-1 min-h-[48px] px-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white outline-none" />
          <input type="date" value={customTo} max={today} onChange={e => e.target.value && setCustomTo(e.target.value)} aria-label="To date"
            className="flex-1 min-h-[48px] px-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white outline-none" />
        </div>
      )}

      <p className="text-xs font-bold text-[#64748b] dark:text-[#94a3b8] mb-3">{formatDayPK(from)} – {formatDayPK(to)}</p>
      {rangeError && <p className="text-sm font-bold text-[#b91c1c] dark:text-[#f87171] mb-3">{rangeError}</p>}
      {error && (
        <div className="rounded-2xl bg-[rgba(239,68,68,0.1)] p-4 mb-3">
          <p className="text-sm font-bold text-[#b91c1c] dark:text-[#f87171] mb-2">{error}</p>
          <button type="button" onClick={load} className="min-h-[44px] px-4 rounded-2xl bg-[#dc2626] text-white text-sm font-bold">Retry</button>
        </div>
      )}
      {loading && <p className="text-sm text-[#94a3b8] text-center py-8">Loading…</p>}

      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
            {kpis.map(k => (
              <div key={k.label} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
                <div className={`text-lg font-black truncate ${k.tone}`}>{k.v}</div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">{k.label}</div>
              </div>
            ))}
            <div className="rounded-3xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 flex items-center">
              <p className="text-[11px] text-[#94a3b8] font-semibold">Billed aur Collected alag hain; udhaar Ledger mein.</p>
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-3">Bottles per day</p>
            {byDay.length === 0 ? (
              <p className="text-sm text-[#94a3b8] text-center py-4">No data for this period.</p>
            ) : (
              <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label="Bottles per day">
                {byDay.map((d, i) => {
                  const n = byDay.length;
                  const bw = 320 / n;
                  const x = i * bw + bw * 0.22;
                  const w = Math.max(4, bw * 0.56);
                  const h = Math.max(4, (d.bottles / maxBottles) * 100);
                  return (
                    <g key={d.date}>
                      <title>{`${d.date}: ${d.bottles} bottles, ${formatRs(d.collected)}`}</title>
                      <rect x={x} y={108 - h} width={w} height={h} rx={4} fill="#3b82f6" opacity={0.85} />
                      {n <= 14 && (
                        <text x={x + w / 2} y={122} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.date.slice(5)}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {table('By rider', ['Rider', 'Bottles', 'Empties', 'Short', 'Collected', 'Deliveries'],
            (summary.by_rider || []).map(r => {
              const short = r.bottles - r.empties;
              return (
                <tr key={r.rider}>
                  <td className={tdCls}>{r.rider || '—'}</td>
                  <td className={tdCls}>{r.bottles}</td>
                  <td className={tdCls}>{r.empties}</td>
                  <td className={tdCls} style={{ fontWeight: 800, color: short > 0 ? '#b91c1c' : '#15803d' }}>{short}</td>
                  <td className={tdCls}>{formatRs(r.collected)}</td>
                  <td className={tdCls}>{r.deliveries}</td>
                </tr>
              );
            }))}

          {table('By vehicle', ['Vehicle', 'Bottles', 'Collected', 'Deliveries'],
            (summary.by_vehicle || []).map(v => (
              <tr key={v.vehicle}>
                <td className={tdCls}>{v.vehicle || '—'}</td>
                <td className={tdCls}>{v.bottles}</td>
                <td className={tdCls}>{formatRs(v.collected)}</td>
                <td className={tdCls}>{v.deliveries}</td>
              </tr>
            )))}

          {table('By route', ['Route', 'Bottles', 'Collected', 'Deliveries'],
            (summary.by_route || []).map(r => (
              <tr key={r.route}>
                <td className={tdCls}>{r.route || '—'}</td>
                <td className={tdCls}>{r.bottles}</td>
                <td className={tdCls}>{formatRs(r.collected)}</td>
                <td className={tdCls}>{r.deliveries}</td>
              </tr>
            )))}
        </>
      )}
    </div>
  );
}
