import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterCustomer, WaterCustomerSettings } from './waterTypes';
import { todayKarachi, formatRs } from './waterTypes';
import { SheetShell, Stepper } from './VehiclesPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

export default function CustomersPanel({ managerId, customers }: Props): React.JSX.Element {
  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const [settings, setSettings] = useState<Map<string, WaterCustomerSettings>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetCustomer, setSheetCustomer] = useState<WaterCustomer | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

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
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#64748b] dark:text-[#94a3b8]">
          {filtered.length} customer{filtered.length === 1 ? '' : 's'}
          {missingRate.length > 0 ? ` • ${missingRate.length} missing rate` : ''}
        </p>
        <button type="button" onClick={() => setBulkOpen(true)}
          className="min-h-[48px] px-4 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white">
          Bulk rate
        </button>
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
                    {c.area || 'No area'} • {s ? `${formatRs(s.rate_per_bottle)}/bottle • ${s.usual_bottles}/day` : 'No settings'}
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
        <CustomerSettingsSheet
          managerId={managerId}
          customer={sheetCustomer}
          existing={settings.get(sheetCustomer.id) || null}
          onClose={() => setSheetCustomer(null)}
          onSaved={() => { setSheetCustomer(null); load(); }}
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

/* ── Per-customer settings sheet ── */
function CustomerSettingsSheet({ managerId, customer, existing, onClose, onSaved }: {
  managerId: string;
  customer: WaterCustomer;
  existing: WaterCustomerSettings | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rate, setRate] = useState(existing?.rate_per_bottle ?? 0);
  const [usual, setUsual] = useState(existing?.usual_bottles ?? 1);
  const [deposit, setDeposit] = useState(existing?.deposit_amount ?? 0);
  const [opening, setOpening] = useState(existing?.opening_balance ?? 0);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [openingBottles, setOpeningBottles] = useState(0);
  const [confirmOpening, setConfirmOpening] = useState(false);

  const openingChanged = existing != null && existing.opening_balance !== opening;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('water_customer_settings').upsert(
        {
          manager_id: managerId,
          customer_id: customer.id,
          rate_per_bottle: rate,
          usual_bottles: usual,
          deposit_amount: deposit,
          opening_balance: opening,
          notes: notes.trim() || null,
        },
        { onConflict: 'manager_id,customer_id' }
      );
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const addOpeningBottles = async () => {
    if (busy || openingBottles <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('water_deliveries').insert({
        manager_id: managerId,
        customer_id: customer.id,
        delivery_date: todayKarachi(),
        bottles_delivered: openingBottles,
        empties_returned: 0,
        amount_collected: 0,
        rate_per_bottle: null,
        source: 'manager',
        note: 'Opening balance',
        client_ref: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
      setConfirmOpening(false);
      setOpeningBottles(0);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not add opening bottles.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={customer.name} onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Rate per bottle (Rs.)</span>
      <div className="mb-4"><Stepper value={rate} onChange={setRate} min={0} max={100000} label="Rate per bottle" /></div>
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Usual bottles / day</span>
      <div className="mb-4"><Stepper value={usual} onChange={setUsual} min={0} max={1000} label="Usual bottles per day" /></div>
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Deposit (Rs.)</span>
      <div className="mb-4"><Stepper value={deposit} onChange={setDeposit} min={0} max={10000000} label="Deposit amount" /></div>
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Opening balance (Rs.)</span>
      <div className="mb-1"><Stepper value={opening} onChange={setOpening} min={0} max={10000000} label="Opening balance" /></div>
      {openingChanged && (
        <p className="text-xs font-bold text-[#92400e] dark:text-[#fbbf24] bg-[rgba(245,158,11,0.12)] rounded-2xl px-3 py-2 mb-3">
          Changing this will change the customer&apos;s balance.
        </p>
      )}
      <div className="mb-4" />
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="ws-notes">
        Notes
      </label>
      <input id="ws-notes" type="text" value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes" className={`${inputCls} mb-4`} />
      <button type="button" onClick={save} disabled={busy}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40 mb-5">
        {busy ? 'Saving…' : 'Save'}
      </button>

      <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4">
        <p className="text-sm font-black text-[#0f172a] dark:text-white mb-1">Opening bottles</p>
        <p className="text-xs text-[#64748b] dark:text-[#94a3b8] mb-2">How many bottles does the customer already have?</p>
        <div className="mb-2"><Stepper value={openingBottles} onChange={setOpeningBottles} min={0} max={10000} label="Opening bottles" /></div>
        <button type="button" onClick={() => setConfirmOpening(true)} disabled={busy || openingBottles <= 0}
          className="w-full min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
          Add
        </button>
      </div>

      {confirmOpening && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirm opening bottles">
          <div className="absolute inset-0 bg-black/70" onClick={() => !busy && setConfirmOpening(false)} />
          <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#0f172a] rounded-t-[2rem] sm:rounded-[2rem] border border-[#e2e8f0] dark:border-white/10 p-5 pb-6">
            <p className="text-base font-bold text-[#0f172a] dark:text-white mb-5">
              Add {openingBottles} opening {openingBottles === 1 ? 'bottle' : 'bottles'} for {customer.name}?
              This entry cannot be edited later, it can only be voided.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmOpening(false)} disabled={busy}
                className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={addOpeningBottles} disabled={busy}
                className="flex-1 min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-50">
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SheetShell>
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
