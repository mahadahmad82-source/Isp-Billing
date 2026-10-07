import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { UserRecord } from '../../types';
import type { WaterCustomer, WaterCustomerSettings } from './waterTypes';
import { formatRs } from './waterTypes';
import { SheetShell, Stepper } from './VehiclesPanel';
import CustomerFormSheet from './CustomerFormSheet';
import BulkCustomerSheet from './BulkCustomerSheet';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  onAddUser: (u: UserRecord) => void;
  onBulkAddUsers: (u: UserRecord[]) => void;
  onUpdateUser: (id: string, update: Partial<UserRecord>) => void;
  /** M6a: open the add-customer form (from the dashboard quick action). */
  requestAdd?: boolean;
  onRequestAddConsumed?: () => void;
}

export default function CustomersPanel({ managerId, customers, onAddUser, onBulkAddUsers, onUpdateUser, requestAdd, onRequestAddConsumed }: Props): React.JSX.Element {
  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const [settings, setSettings] = useState<Map<string, WaterCustomerSettings>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetCustomer, setSheetCustomer] = useState<WaterCustomer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // M6a: dashboard "Add customer" quick action opens the form.
  useEffect(() => {
    if (requestAdd) {
      setAddOpen(true);
      onRequestAddConsumed?.();
    }
  }, [requestAdd, onRequestAddConsumed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('water_customer_settings')
        .select('*')
        .eq('manager_id', managerId);
      if (error) throw new Error(error.message);
      const map = new Map<string, WaterCustomerSettings>();
      for (const s of (data as WaterCustomerSettings[]) || []) map.set(s.customer_id, s);
      setSettings(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load customer settings.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return live;
    return live.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.area || '').toLowerCase().includes(q)
    );
  }, [live, search]);

  const missingRate = useMemo(
    () => live.filter(c => { const s = settings.get(c.id); return !s || s.rate_per_bottle === 0; }),
    [live, settings]
  );

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="relative mb-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone, area"
          aria-label="Search customers"
          className="w-full min-h-[48px] pl-4 pr-3 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]"
        />
      </div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-[#64748b] dark:text-[#94a3b8]">
          {filtered.length} customer{filtered.length === 1 ? '' : 's'}
          {missingRate.length > 0 ? ` • ${missingRate.length} missing rate` : ''}
        </p>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => setAddOpen(true)}
            className="min-h-[48px] px-4 rounded-2xl bg-[#1d4ed8] text-white text-sm font-bold">
            Add customer
          </button>
          <button type="button" onClick={() => setPasteOpen(true)}
            className="min-h-[48px] px-4 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white">
            Bulk add
          </button>
          <button type="button" onClick={() => setBulkOpen(true)}
            className="min-h-[48px] px-4 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white">
            Bulk rate
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-8">Loading…</p>}
      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Retry</button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white">No customers found</p>
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-2 pb-8">
          {filtered.map(c => {
            const s = settings.get(c.id);
            const noRate = !s || s.rate_per_bottle === 0;
            const checked = selected.has(c.id);
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-3">
                <button type="button" onClick={() => toggleSelect(c.id)} aria-pressed={checked} aria-label={`Select ${c.name}`}
                  className={`min-h-[48px] min-w-[48px] rounded-2xl border flex items-center justify-center shrink-0 ${checked
                    ? 'border-[#3b82f6] bg-[#dbeafe] dark:bg-[rgba(59,130,246,0.18)]'
                    : 'border-[#e2e8f0] dark:border-white/10'}`}>
                  {checked && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <button type="button" onClick={() => setSheetCustomer(c)} aria-label={`Water settings for ${c.name}`}
                  className="flex-1 min-w-0 text-left min-h-[48px]">
                  <div className="text-base font-black text-[#0f172a] dark:text-white truncate">{c.name}</div>
                  <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold truncate">
                    {c.area || 'No area'} • {s ? `${formatRs(s.rate_per_bottle)}/bottle • ${s.usual_bottles}/day • ${s.billing_mode === 'daily' ? 'Daily' : 'Monthly'}` : 'No settings'}
                  </div>
                </button>
                {noRate && (
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#fef3c7] text-[#92400e] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24]">
                    Rate missing
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sheetCustomer && (
        <CustomerFormSheet
          managerId={managerId}
          customer={sheetCustomer}
          existingSettings={settings.get(sheetCustomer.id) || null}
          customers={live}
          onClose={() => setSheetCustomer(null)}
          onSaved={() => { setSheetCustomer(null); load(); }}
          onAddUser={onAddUser}
          onUpdateUser={onUpdateUser}
        />
      )}
      {addOpen && (
        <CustomerFormSheet
          managerId={managerId}
          customer={null}
          customers={live}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load(); }}
          onAddUser={onAddUser}
          onUpdateUser={onUpdateUser}
        />
      )}
      {pasteOpen && (
        <BulkCustomerSheet
          managerId={managerId}
          customers={live}
          onClose={() => setPasteOpen(false)}
          onSaved={() => { setPasteOpen(false); load(); }}
          onBulkAddUsers={onBulkAddUsers}
        />
      )}
      {bulkOpen && (
        <BulkRateModal
          managerId={managerId}
          targets={selected.size > 0 ? live.filter(c => selected.has(c.id)) : missingRate}
          mode={selected.size > 0 ? 'selected' : 'missing'}
          onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); setSelected(new Set()); load(); }}
        />
      )}
    </div>
  );
}

/* ── Bulk rate modal ── */
function BulkRateModal({ managerId, targets, mode, onClose, onSaved }: {
  managerId: string;
  targets: WaterCustomer[];
  mode: 'selected' | 'missing';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rate, setRate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = async () => {
    if (busy || rate <= 0 || targets.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const rows = targets.map(c => ({ manager_id: managerId, customer_id: c.id, rate_per_bottle: rate }));
      const { error } = await supabase
        .from('water_customer_settings')
        .upsert(rows, { onConflict: 'manager_id,customer_id' });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Bulk update failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title="Bulk rate" onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-3">
        Set rate for {targets.length} customer{targets.length === 1 ? '' : 's'}
        ({mode === 'selected' ? 'selected' : 'missing rate'}).
      </p>
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Rate per bottle (Rs.)</span>
      <div className="mb-4"><Stepper value={rate} onChange={setRate} min={0} max={100000} label="Bulk rate per bottle" /></div>
      <button type="button" onClick={apply} disabled={busy || rate <= 0 || targets.length === 0}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
        {busy ? 'Applying…' : `Apply to ${targets.length}`}
      </button>
    </SheetShell>
  );
}
