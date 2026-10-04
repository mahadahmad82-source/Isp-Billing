import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterOrder, WaterCustomer } from './waterTypes';
import { todayKarachi, formatDayPK } from './waterTypes';
import { SheetShell, Stepper } from './VehiclesPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
}

type Filter = 'all' | 'new' | 'planned' | 'delivered' | 'cancelled';

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

const STATUS_LABEL: Record<WaterOrder['status'], string> = {
  new: 'New',
  planned: 'Planned',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default function OrdersPanel({ managerId, customers }: Props): React.JSX.Element {
  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const [dateIso, setDateIso] = useState(() => todayKarachi());
  const [filter, setFilter] = useState<Filter>('all');
  const [orders, setOrders] = useState<WaterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from('water_orders')
        .select('*')
        .eq('manager_id', managerId)
        .eq('delivery_date', dateIso)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setOrders((data as WaterOrder[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [managerId, dateIso]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { load(); }, 60000); // auto-refresh while tab is open
    return () => clearInterval(t);
  }, [load]);

  const shiftDay = (dir: -1 | 1) => {
    const d = new Date(dateIso + 'T00:00');
    d.setDate(d.getDate() + dir);
    setDateIso(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }));
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const todayQty = orders
    .filter(o => o.status === 'new' || o.status === 'planned')
    .reduce((s, o) => s + o.qty, 0);

  const setStatus = async (order: WaterOrder, status: WaterOrder['status']) => {
    if (busyId) return;
    setBusyId(order.id);
    try {
      const { error } = await supabase
        .from('water_orders')
        .update({ status })
        .eq('id', order.id)
        .eq('manager_id', managerId);
      if (error) throw new Error(error.message);
      await load(); // no optimistic update — reload after DB confirms
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = (id: string) => live.find(c => c.id === id)?.name || '(deleted customer)';
  const areaOf = (id: string) => live.find(c => c.id === id)?.area || '';

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
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => shiftDay(-1)} aria-label="Previous day"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">‹</button>
        <button type="button" onClick={() => setDateIso(todayKarachi())} aria-label="Go to today"
          className="flex-1 min-h-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-base font-black text-[#0f172a] dark:text-white">
          {formatDayPK(dateIso)}
        </button>
        <button type="button" onClick={() => shiftDay(1)} aria-label="Next day"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">›</button>
        <button type="button" onClick={() => { setLoading(true); load(); }} aria-label="Refresh orders"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>

      <div className="rounded-2xl bg-[#ccfbf1] dark:bg-[rgba(45,212,191,0.12)] px-4 py-3 mb-3">
        <span className="text-sm font-black text-[#0f766e] dark:text-[#5eead4]">
          Today&apos;s demand: {todayQty} bottle{todayQty === 1 ? '' : 's'}
        </span>
        <span className="text-xs font-semibold text-[#0f766e] dark:text-[#5eead4] opacity-80"> (new + planned)</span>
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {chip('all', 'All')}{chip('new', 'New')}{chip('planned', 'Planned')}{chip('delivered', 'Delivered')}{chip('cancelled', 'Cancelled')}
      </div>

      <button type="button" onClick={() => setShowAdd(true)}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold mb-3">
        Add order
      </button>

      {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-8">Loading…</p>}
      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load orders</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white">No orders</p>
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-3 pb-8">
          {filtered.map(o => (
            <div key={o.id} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <div className="text-base font-black text-[#0f172a] dark:text-white truncate">{nameOf(o.customer_id)}</div>
                  <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">
                    {areaOf(o.customer_id) || 'No area'} • {o.qty} bottle{o.qty === 1 ? '' : 's'}
                  </div>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <div className="flex items-center gap-2 mb-2">
                {o.source === 'whatsapp' && (
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]">
                    WhatsApp
                  </span>
                )}
                <span className="text-xs text-[#94a3b8]">
                  {new Date(o.created_at).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              {o.note && <p className="text-sm text-[#475569] dark:text-[#cbd5e1] mb-2 break-words">{o.note}</p>}
              {(o.status === 'new' || o.status === 'planned') && (
                <div className="grid grid-cols-3 gap-2">
                  {o.status === 'new' && (
                    <button type="button" onClick={() => setStatus(o, 'planned')} disabled={busyId === o.id}
                      className="min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
                      {busyId === o.id ? '…' : 'Mark planned'}
                    </button>
                  )}
                  <button type="button" onClick={() => setStatus(o, 'delivered')} disabled={busyId === o.id}
                    className="min-h-[48px] rounded-2xl bg-[#0f766e] text-white text-sm font-bold disabled:opacity-40">
                    {busyId === o.id ? '…' : 'Delivered'}
                  </button>
                  <button type="button" onClick={() => setStatus(o, 'cancelled')} disabled={busyId === o.id}
                    className="min-h-[48px] rounded-2xl border border-[rgba(239,68,68,0.25)] text-[#b91c1c] dark:text-[#f87171] text-sm font-bold disabled:opacity-40">
                    {busyId === o.id ? '…' : 'Cancel'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddOrderSheet
          managerId={managerId}
          customers={live}
          defaultDate={dateIso}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); setLoading(true); load(); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: WaterOrder['status'] }) {
  const cls = status === 'delivered'
    ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
    : status === 'planned'
      ? 'bg-[#fef3c7] text-[#92400e] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24]'
      : status === 'cancelled'
        ? 'bg-[rgba(148,163,184,0.15)] text-[#64748b] dark:text-[#94a3b8]'
        : 'bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]';
  return (
    <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ── Add order sheet ── */
function AddOrderSheet({ managerId, customers, defaultDate, onClose, onSaved }: {
  managerId: string;
  customers: WaterCustomer[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return customers.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.phone.toLowerCase().includes(query) ||
      (c.area || '').toLowerCase().includes(query)
    ).slice(0, 20);
  }, [q, customers]);

  const chosen = customers.find(c => c.id === customerId);

  const save = async () => {
    if (busy || !customerId || qty <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('water_orders').insert({
        manager_id: managerId,
        customer_id: customerId,
        qty,
        delivery_date: date,
        status: 'new',
        source: 'manager',
        note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not add order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title="Add order" onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Customer *</span>
      {chosen ? (
        <div className="flex items-center justify-between rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 px-4 min-h-[48px] mb-2">
          <span className="text-base font-bold text-[#0f172a] dark:text-white truncate">{chosen.name}</span>
          <button type="button" onClick={() => setCustomerId('')} aria-label="Change customer"
            className="min-h-[48px] px-3 text-sm font-bold text-[#1d4ed8]">Change</button>
        </div>
      ) : (
        <div className="relative mb-2">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer"
            aria-label="Search customer" className={inputCls} />
          {q.trim() && (
            <div className="mt-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {results.length === 0 && <p className="text-sm text-[#94a3b8] text-center py-2">No match.</p>}
              {results.map(c => (
                <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setQ(''); }}
                  className="w-full min-h-[48px] text-left rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 px-4 py-2">
                  <span className="block text-sm font-bold text-[#0f172a] dark:text-white truncate">{c.name}</span>
                  <span className="block text-xs text-[#64748b] dark:text-[#94a3b8] truncate">{c.phone}{c.area ? ` • ${c.area}` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Bottles</span>
      <div className="mb-4"><Stepper value={qty} onChange={setQty} min={1} max={1000} label="Order bottles" /></div>
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="order-date">
        Delivery date
      </label>
      <input id="order-date" type="date" value={date} onChange={e => setDate(e.target.value)}
        className={`${inputCls} mb-4`} />
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="order-note">
        Note
      </label>
      <input id="order-note" type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Note (optional)" className={`${inputCls} mb-4`} />
      <button type="button" onClick={save} disabled={busy || !customerId || qty <= 0}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
        {busy ? 'Adding…' : 'Add order'}
      </button>
    </SheetShell>
  );
}
