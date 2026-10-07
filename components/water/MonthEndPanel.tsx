import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterPeriodRow, WaterCustomer } from './waterTypes';
import { toISODate, waNumber92 } from './waterTypes';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
}

function lastMonth(): { year: number; month: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = toISODate(new Date(year, month, 1));
  const to = toISODate(new Date(year, month + 1, 0));
  return { from, to };
}

function monthName(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
}

export default function MonthEndPanel({ managerId, customers }: Props): React.JSX.Element {
  const [{ year, month }, setYM] = useState(lastMonth);
  const [rows, setRows] = useState<WaterPeriodRow[]>([]);
  const [dueByCustomer, setDueByCustomer] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthRange(year, month);
      const [sRes, lRes] = await Promise.all([
        supabase.rpc('water_period_summary', { p_from: from, p_to: to }),
        supabase.from('water_customer_ledger').select('customer_id,balance_due').eq('manager_id', managerId),
      ]);
      if (sRes.error) throw new Error(sRes.error.message);
      if (lRes.error) throw new Error(lRes.error.message);
      setRows((sRes.data as WaterPeriodRow[]) || []);
      const due = new Map<string, number>();
      for (const r of (lRes.data as { customer_id: string; balance_due: number }[]) || []) {
        due.set(r.customer_id, r.balance_due || 0);
      }
      setDueByCustomer(due);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load month summary.');
    } finally {
      setLoading(false);
    }
  }, [managerId, year, month]);

  useEffect(() => { load(); }, [load]);

  const shiftMonth = (dir: -1 | 1) => {
    const d = new Date(year, month + dir, 1);
    setYM({ year: d.getFullYear(), month: d.getMonth() });
  };

  const nameOf = (id: string) => customers.find(c => c.id === id)?.name || '(deleted customer)';
  const phoneOf = (id: string) => customers.find(c => c.id === id)?.phone || '';

  const enriched = useMemo(() => rows.map(r => {
    const collected = (r.collected || 0) + (r.payments || 0);
    return { ...r, collected, diff: (r.billed || 0) - collected };
  }), [rows]);

  const totals = useMemo(() => enriched.reduce(
    (s, r) => ({
      bottles: s.bottles + (r.bottles_delivered || 0),
      billed: s.billed + (r.billed || 0),
      collected: s.collected + r.collected,
      diff: s.diff + r.diff,
    }),
    { bottles: 0, billed: 0, collected: 0, diff: 0 }
  ), [enriched]);

  const copySummary = async () => {
    const m = monthName(year, month);
    const lines = enriched.map(r =>
      `${nameOf(r.customer_id)}: ${r.bottles_delivered} bottles, Bill Rs. ${(r.billed || 0).toLocaleString('en-US')}, ` +
      `Paid Rs. ${r.collected.toLocaleString('en-US')}, Month diff Rs. ${r.diff.toLocaleString('en-US')}`
    );
    const text = `${m} — Water bills\n` + lines.join('\n') +
      `\nTotal: ${totals.bottles} bottles, Bill Rs. ${totals.billed.toLocaleString('en-US')}, ` +
      `Paid Rs. ${totals.collected.toLocaleString('en-US')}, Diff Rs. ${totals.diff.toLocaleString('en-US')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const billLink = (r: (typeof enriched)[number]) => {
    const num = waNumber92(phoneOf(r.customer_id));
    if (!num) return null;
    const due = dueByCustomer.get(r.customer_id) ?? 0;
    const text =
      `Assalam o Alaikum ${nameOf(r.customer_id)}, ${monthName(year, month)} ka bill: ` +
      `${r.bottles_delivered} bottles, kul Rs. ${(r.billed || 0).toLocaleString('en-US')}. ` +
      `Ada shuda Rs. ${r.collected.toLocaleString('en-US')}. Baqaya Rs. ${due.toLocaleString('en-US')}. Shukriya.`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">‹</button>
        <div className="flex-1 min-h-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-base font-black text-[#0f172a] dark:text-white flex items-center justify-center">
          {monthName(year, month)}
        </div>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">›</button>
      </div>

      {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-8">Loading…</p>}
      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load summary</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
        </div>
      )}
      {!loading && !error && enriched.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white">No activity this month</p>
        </div>
      )}
      {!loading && !error && enriched.length > 0 && (
        <>
          <div className="flex flex-col gap-2 pb-4">
            {enriched.map(r => {
              const link = billLink(r);
              return (
                <div key={r.customer_id} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="text-base font-black text-[#0f172a] dark:text-white truncate">{nameOf(r.customer_id)}</div>
                    <div className={`shrink-0 text-sm font-black ${r.diff > 0 ? 'text-[#b91c1c] dark:text-[#f87171]' : 'text-[#15803d] dark:text-[#4ade80]'}`}>
                      Rs. {r.diff.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold mb-2">
                    {r.bottles_delivered} bottles • {r.delivery_days} days • Bill Rs. {(r.billed || 0).toLocaleString('en-US')} • Paid Rs. {r.collected.toLocaleString('en-US')}
                  </div>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="min-h-[48px] rounded-2xl bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] text-sm font-bold flex items-center justify-center">
                      Send bill
                    </a>
                  ) : (
                    <button type="button" disabled title="No phone number"
                      className="w-full min-h-[48px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#94a3b8] text-sm font-bold opacity-50">
                      Send bill
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl bg-[#0f172a] dark:bg-[#e2e8f0] px-4 py-3 mb-3">
            <div className="text-sm font-black text-white dark:text-[#0f172a]">
              Total: {totals.bottles} bottles • Bill Rs. {totals.billed.toLocaleString('en-US')} • Paid Rs. {totals.collected.toLocaleString('en-US')} • Diff Rs. {totals.diff.toLocaleString('en-US')}
            </div>
          </div>
          <button type="button" onClick={copySummary}
            className="w-full min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white mb-8">
            {copied ? 'Copied!' : 'Copy summary'}
          </button>
        </>
      )}
    </div>
  );
}
