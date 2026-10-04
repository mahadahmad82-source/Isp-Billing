import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterInboxItem, WaterCustomer } from './waterTypes';
import { digitsOnly } from './waterTypes';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  onUpdate: () => void;
}

type Filter = 'unhandled' | 'all';

export default function InboxPanel({ managerId, customers, onUpdate }: Props): React.JSX.Element {
  const [items, setItems] = useState<WaterInboxItem[]>([]);
  const [filter, setFilter] = useState<Filter>('unhandled');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from('water_inbox')
        .select('*')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      setItems((data as WaterInboxItem[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load inbox.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const filtered = filter === 'all' ? items : items.filter(i => !i.handled);

  const markHandled = async (item: WaterInboxItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from('water_inbox')
        .update({ handled: true })
        .eq('id', item.id)
        .eq('manager_id', managerId);
      if (error) throw new Error(error.message);
      await load();
      onUpdate();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = (item: WaterInboxItem) => {
    if (!item.customer_id) return null;
    return customers.find(c => c.id === item.customer_id)?.name || null;
  };

  const chip = (key: Filter, label: string, n: number) => {
    const active = filter === key;
    return (
      <button key={key} type="button" aria-pressed={active} onClick={() => setFilter(key)}
        className={`min-h-[48px] px-4 rounded-full text-sm font-bold border transition-colors ${active
          ? 'bg-[#0f172a] text-white border-[#0f172a] dark:bg-[#e2e8f0] dark:text-[#0f172a] dark:border-[#e2e8f0]'
          : 'bg-white text-[#475569] border-[#e2e8f0] dark:bg-[#0f172a] dark:text-[#94a3b8] dark:border-white/10'}`}>
        {label} <span className="opacity-70 font-semibold">({n})</span>
      </button>
    );
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {chip('unhandled', 'Unhandled', items.filter(i => !i.handled).length)}
        {chip('all', 'All', items.length)}
      </div>

      {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-8">Loading…</p>}
      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load inbox</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white">Inbox is clear</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">No {filter === 'unhandled' ? 'unhandled ' : ''}messages.</p>
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-3 pb-8">
          {filtered.map(item => {
            const name = nameOf(item);
            const digits = digitsOnly(item.phone);
            return (
              <div key={item.id} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0">
                    <div className="text-base font-black text-[#0f172a] dark:text-white truncate">
                      {name || item.phone}
                    </div>
                    <div className="text-xs text-[#94a3b8]">
                      {new Date(item.created_at).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <KindBadge kind={item.kind} />
                </div>
                {item.kind === 'unknown_customer' && (
                  <p className="text-xs font-semibold text-[#92400e] dark:text-[#fbbf24] mb-1.5">
                    This number is not matched to any customer.
                  </p>
                )}
                <p className="text-sm text-[#0f172a] dark:text-white whitespace-pre-wrap break-words mb-3">
                  {item.body}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {digits ? (
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[48px] rounded-2xl bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] text-sm font-bold flex items-center justify-center"
                    >
                      Reply on WhatsApp
                    </a>
                  ) : <span />}
                  {!item.handled && (
                    <button type="button" onClick={() => markHandled(item)} disabled={busyId === item.id}
                      className="min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
                      {busyId === item.id ? '…' : 'Mark handled'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: WaterInboxItem['kind'] }) {
  const label = kind === 'complaint' ? 'Complaint' : kind === 'message' ? 'Message' : 'Unknown number';
  const cls = kind === 'complaint'
    ? 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]'
    : kind === 'message'
      ? 'bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
      : 'bg-[#fef3c7] text-[#92400e] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24]';
  return (
    <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}
