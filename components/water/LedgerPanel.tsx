import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterLedgerRow, WaterCustomer } from './waterTypes';
import { formatDue } from './waterTypes';
import CustomerLedgerSheet from './CustomerLedgerSheet';
import MonthEndPanel from './MonthEndPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  businessName?: string;
  /** M6a: open this customer's ledger sheet once rows load (dashboard top-dues). */
  focusCustomerId?: string | null;
  onFocusConsumed?: () => void;
  /** M6a: open the Record-payment form inside the focused customer's sheet. */
  requestPay?: boolean;
  onRequestPayConsumed?: () => void;
}

type Sort = 'due' | 'name' | 'last';
type Filter = 'all' | 'due' | 'advance';

export default function LedgerPanel({ managerId, customers, businessName, focusCustomerId, onFocusConsumed, requestPay, onRequestPayConsumed }: Props): React.JSX.Element {
  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const [rows, setRows] = useState<WaterLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('due');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'ledger' | 'month'>('ledger');
  const [openCustomer, setOpenCustomer] = useState<WaterLedgerRow | null>(null);
  const [startWithPay, setStartWithPay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('water_customer_ledger')
        .select('*')
        .eq('manager_id', managerId);
      if (error) throw new Error(error.message);
      setRows((data as WaterLedgerRow[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load ledger.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { load(); }, [load]);

  // M6a: deep-open a customer's ledger sheet (from the dashboard's top dues),
  // optionally with the Record-payment form already open.
  useEffect(() => {
    if (!focusCustomerId || rows.length === 0) return;
    const row = rows.find(r => r.customer_id === focusCustomerId);
    if (row) {
      setOpenCustomer(row);
      setStartWithPay(!!requestPay);
    }
    onFocusConsumed?.();
    onRequestPayConsumed?.();
  }, [focusCustomerId, rows, requestPay, onFocusConsumed, onRequestPayConsumed]);

  const nameOf = (id: string) => live.find(c => c.id === id)?.name || '(deleted customer)';

  const summary = useMemo(() => {
    let due = 0, payments = 0, bottles = 0;
    for (const r of rows) {
      if (r.balance_due > 0) due += r.balance_due;
      payments += r.payments || 0;
      bottles += r.bottles_out || 0;
    }
    return { due, payments, bottles };
  }, [rows]);

  const visible = useMemo(() => {
    let list = rows.filter(r => {
      if (filter === 'due') return r.balance_due > 0;
      if (filter === 'advance') return r.balance_due < 0;
      return true;
    });
    list = [...list];
    if (sort === 'due') list.sort((a, b) => b.balance_due - a.balance_due);
    else if (sort === 'name') list.sort((a, b) => nameOf(a.customer_id).localeCompare(nameOf(b.customer_id)));
    else list.sort((a, b) => (b.last_delivery_date || '').localeCompare(a.last_delivery_date || ''));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, filter, live]);

  const chip = (key: Filter, label: string) => {
    const active = filter === key;
    return (
      <button key={key} type="button" aria-pressed={active} onClick={() => setFilter(key)}
        className={`min-h-[48px] px-4 rounded-full text-sm font-bold border whitespace-nowrap transition-colors ${active
          ? 'bg-[#0f172a] text-white border-[#0f172a] dark:bg-[#e2e8f0] dark:text-[#0f172a] dark:border-[#e2e8f0]'
          : 'bg-white text-[#475569] border-[#e2e8f0] dark:bg-[#0f172a] dark:text-[#94a3b8] dark:border-white/10'}`}>
        {label}
      </button>
    );
  };

  return (
    <div>
      {/* Ledger | Month-end toggle */}
      <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-2xl bg-[#f1f5f9] dark:bg-white/5">
        {(['ledger', 'month'] as const).map(v => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={`min-h-[48px] rounded-xl text-base font-bold transition-colors ${view === v
              ? 'bg-white dark:bg-[#0f172a] text-[#0f172a] dark:text-white shadow'
              : 'text-[#64748b] dark:text-[#94a3b8]'}`}>
            {v === 'ledger' ? 'Ledger' : 'Month-end'}
          </button>
        ))}
      </div>

      {view === 'month' ? (
        <MonthEndPanel managerId={managerId} customers={live} />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 px-3 py-3 text-center">
              <div className="text-base font-black text-[#b91c1c] dark:text-[#f87171]">Rs. {summary.due.toLocaleString('en-US')}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Total due</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 px-3 py-3 text-center">
              <div className="text-base font-black text-[#15803d] dark:text-[#4ade80]">Rs. {summary.payments.toLocaleString('en-US')}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Collected</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 px-3 py-3 text-center">
              <div className="text-base font-black text-[#0f172a] dark:text-white">{summary.bottles.toLocaleString('en-US')}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Bottles out</div>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              {chip('all', 'All')}{chip('due', 'Due only')}{chip('advance', 'Advance')}
            </div>
            <div className="relative shrink-0">
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort ledger"
                className="min-h-[48px] pl-3 pr-9 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm font-semibold text-[#0f172a] dark:text-white outline-none appearance-none">
                <option value="due">Highest due</option>
                <option value="name">Name</option>
                <option value="last">Last delivery</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </div>
          </div>

          {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-8">Loading…</p>}
          {!loading && error && (
            <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
              <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load ledger</p>
              <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
              <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
              <p className="text-base font-bold text-[#0f172a] dark:text-white">No balances</p>
            </div>
          )}
          {!loading && !error && visible.length > 0 && (
            <div className="flex flex-col gap-2 pb-8">
              {visible.map(r => (
                <button key={r.customer_id} type="button" onClick={() => setOpenCustomer(r)}
                  aria-label={`Open ledger for ${nameOf(r.customer_id)}`}
                  className="w-full text-left rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 active:scale-[0.99] transition-transform">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-black text-[#0f172a] dark:text-white truncate">{nameOf(r.customer_id)}</div>
                      <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">
                        {r.bottles_out} bottles out
                        {r.last_delivery_date ? ` • last delivery ${r.last_delivery_date}` : ''}
                      </div>
                    </div>
                    <div className={`shrink-0 text-base font-black ${r.balance_due > 0
                      ? 'text-[#b91c1c] dark:text-[#f87171]'
                      : r.balance_due < 0 ? 'text-[#15803d] dark:text-[#4ade80]' : 'text-[#64748b] dark:text-[#94a3b8]'}`}>
                      {formatDue(r.balance_due)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {openCustomer && (
        <CustomerLedgerSheet
          managerId={managerId}
          customer={live.find(c => c.id === openCustomer.customer_id) || null}
          customerName={nameOf(openCustomer.customer_id)}
          ledger={openCustomer}
          businessName={businessName}
          startWithPay={startWithPay}
          onClose={() => { setOpenCustomer(null); setStartWithPay(false); }}
          onChanged={load}
        />
      )}
    </div>
  );
}
