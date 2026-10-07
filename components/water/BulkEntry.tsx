import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterRouteSheet, WaterRouteSheetStop } from './waterTypes';
import { Stepper } from './VehiclesPanel';

interface PlanRef {
  id: string;
  rider_username: string | null;
  vehicle_id: string | null;
  plan_date: string;
}

interface Props {
  managerId: string;
  plan: PlanRef;
  onClose: () => void;
  onDone: () => void;
}

interface RowState {
  stop: WaterRouteSheetStop;
  delivered: number;
  empties: number;
  cash: number;
  skipped: boolean;
  deliveryId: string | null;
}

const clampQty = (v: number) => Math.max(0, Math.min(1000, Math.trunc(v) || 0));

export default function BulkEntry({ managerId, plan, onClose, onDone }: Props): React.JSX.Element {
  const [sheet, setSheet] = useState<WaterRouteSheet | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkEmpties, setLinkEmpties] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voidTarget, setVoidTarget] = useState<RowState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_route_sheet', { p_plan_id: plan.id });
      if (error) throw new Error(error.message);
      if (!data || !data.success) {
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(payload || 'Could not load route sheet.');
      }
      const s = data as WaterRouteSheet;
      // Delivery ids for the Void action (route_sheet stops carry no delivery id).
      const { data: dels, error: dErr } = await supabase
        .from('water_deliveries')
        .select('id,customer_id')
        .eq('manager_id', managerId)
        .eq('plan_id', plan.id)
        .is('voided_at', null);
      if (dErr) throw new Error(dErr.message);
      const idByCustomer = new Map(((dels as { id: string; customer_id: string }[]) || []).map(d => [d.customer_id, d.id]));
      setSheet(s);
      setRows((s.stops || []).map(stop => {
        const def = clampQty(stop.pending_order_qty ?? stop.usual_bottles);
        return {
          stop,
          delivered: def,
          empties: def,
          cash: 0,
          skipped: false,
          deliveryId: idByCustomer.get(stop.customer_id) || null,
        };
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load route sheet.');
    } finally {
      setLoading(false);
    }
  }, [managerId, plan.id]);

  useEffect(() => { load(); }, [load]);

  const patchRow = (idx: number, patch: Partial<RowState>) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const setDelivered = (idx: number, v: number) => {
    const val = clampQty(v);
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, delivered: val, empties: linkEmpties ? val : r.empties } : r)));
  };

  const fillCashRow = (idx: number) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, cash: Math.max(0, Math.round(r.delivered * (r.stop.rate_per_bottle || 0))) } : r)));
  const fillCashAll = () =>
    setRows(prev => prev.map(r =>
      r.stop.done || r.skipped ? r : { ...r, cash: Math.max(0, Math.round(r.delivered * (r.stop.rate_per_bottle || 0))) }
    ));

  const totals = useMemo(() => {
    let delivered = 0, empties = 0, cash = 0, count = 0;
    for (const r of rows) {
      if (r.stop.done || r.skipped) continue;
      if (r.delivered <= 0 && r.empties <= 0 && r.cash <= 0) continue;
      delivered += r.delivered; empties += r.empties; cash += r.cash; count++;
    }
    return { delivered, empties, cash, count };
  }, [rows]);

  // One idempotency key per customer for this open sheet: a retry after a lost response reuses the SAME key
  // (DB ignores the duplicate), while a new entry after a void/save gets a fresh key.
  const refsRef = useRef<Record<string, string>>({});
  const refFor = (customerId: string): string => {
    if (!refsRef.current[customerId]) refsRef.current[customerId] = crypto.randomUUID();
    return refsRef.current[customerId];
  };

  const saveAll = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = rows
        .filter(r => !r.stop.done && !r.skipped && (r.delivered > 0 || r.empties > 0 || r.cash > 0))
        .map(r => ({
          manager_id: managerId,
          plan_id: plan.id,
          delivery_date: plan.plan_date,
          customer_id: r.stop.customer_id,
          rider_username: plan.rider_username,
          vehicle_id: plan.vehicle_id,
          bottles_delivered: r.delivered,
          empties_returned: r.empties,
          amount_collected: r.cash,
          rate_per_bottle: r.stop.rate_per_bottle,
          source: 'paper' as const,
          client_ref: refFor(r.stop.customer_id), // retry-safe: same key on retry, no double entry
        }));
      if (payload.length === 0) {
        setMsg({ ok: false, text: 'Nothing to save — all rows are skipped or empty.' });
        return;
      }
      const { error } = await supabase
        .from('water_deliveries')
        .upsert(payload, { onConflict: 'manager_id,client_ref', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      refsRef.current = {}; // saved: next entries (e.g. after a void) must use new keys
      // W3a: mark this day's open orders delivered for the saved customers.
      // Best-effort only — the delivery is already saved, so this must never fail the save.
      try {
        const { error: ordErr } = await supabase
          .from('water_orders')
          .update({ status: 'delivered' })
          .eq('manager_id', managerId)
          .eq('delivery_date', plan.plan_date)
          .in('status', ['new', 'planned'])
          .in('customer_id', payload.map(p => p.customer_id));
        if (ordErr) console.warn('water orders auto-deliver failed:', ordErr.message);
      } catch (e) {
        console.warn('water orders auto-deliver failed:', e);
      }
      setMsg({ ok: true, text: `Saved ${payload.length} ${payload.length === 1 ? 'entry' : 'entries'}.` });
      await load(); // refresh done flags; retry stays safe via client_ref
      onDone();
    } catch (e: unknown) {
      // Nothing was half-saved from the user's view on error — rows stay as they were.
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  };

  const voidDelivery = async (reason: string) => {
    const target = voidTarget;
    if (!target?.deliveryId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('water_void_delivery', { p_id: target.deliveryId, p_reason: reason });
      if (error || (data && !data.success)) {
        const transport = (error as { message?: string } | null)?.message;
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(transport || payload || 'Void failed.');
      }
      setVoidTarget(null);
      await load();
      onDone();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Void failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f1f5f9] dark:bg-[#020617]" role="dialog" aria-modal="true" aria-label="Enter deliveries">
      <div className="h-full flex flex-col max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-[#0f172a] border-b border-[#e2e8f0] dark:border-white/10">
          <button type="button" onClick={onClose} aria-label="Close delivery entry"
            className="min-h-[48px] min-w-[48px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">
            ‹
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-base font-black text-[#0f172a] dark:text-white truncate">
              {sheet ? sheet.route.name : 'Deliveries'}
            </div>
            <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">
              {sheet ? `${sheet.stops.length} stops` : 'Loading…'}
            </div>
          </div>
          <button type="button" onClick={fillCashAll} disabled={busy || loading}
            className="min-h-[48px] px-3 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
            Cash = qty × rate
          </button>
        </div>

        {/* Options */}
        <div className="px-4 py-2 bg-white dark:bg-[#0f172a] border-b border-[#e2e8f0] dark:border-white/10">
          <button type="button" onClick={() => setLinkEmpties(v => !v)} aria-pressed={linkEmpties}
            className="w-full min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white flex items-center justify-between px-4">
            <span>Empties = Delivered</span>
            <span className={`w-12 h-7 rounded-full p-1 transition-colors ${linkEmpties ? 'bg-[#22c55e]' : 'bg-[#cbd5e1] dark:bg-white/15'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${linkEmpties ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {msg && (
            <div className={`text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 ${msg.ok
              ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
              : 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]'}`}>
              {msg.text}
            </div>
          )}
          {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-8">Loading stops…</p>}
          {!loading && error && (
            <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
              <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load stops</p>
              <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
              <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">
                Retry
              </button>
            </div>
          )}
          {!loading && !error && rows.map((r, idx) => (
            <StopRow
              key={r.stop.customer_id}
              row={r}
              onDelivered={v => setDelivered(idx, v)}
              onEmpties={v => patchRow(idx, { empties: clampQty(v) })}
              onCash={v => patchRow(idx, { cash: Math.max(0, Math.trunc(v) || 0) })}
              onFillCash={() => fillCashRow(idx)}
              onSkip={() => patchRow(idx, { skipped: !r.skipped })}
              onVoid={() => setVoidTarget(r)}
              disabled={busy}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-white dark:bg-[#0f172a] border-t border-[#e2e8f0] dark:border-white/10">
          <div className="flex justify-between text-sm font-bold text-[#0f172a] dark:text-white mb-2">
            <span>{totals.count} entries</span>
            <span>{totals.delivered} bottles • {totals.empties} empty • Rs. {totals.cash.toLocaleString('en-US')}</span>
          </div>
          <button type="button" onClick={saveAll} disabled={busy || loading || totals.count === 0}
            className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
            {busy ? 'Saving…' : 'Save all'}
          </button>
        </div>
      </div>

      {voidTarget && (
        <VoidModal
          customerName={voidTarget.stop.name || '(deleted customer)'}
          busy={busy}
          onClose={() => setVoidTarget(null)}
          onConfirm={voidDelivery}
        />
      )}
    </div>
  );
}

/* ── One stop row ── */
function StopRow({ row, onDelivered, onEmpties, onCash, onFillCash, onSkip, onVoid, disabled }: {
  row: RowState;
  onDelivered: (v: number) => void;
  onEmpties: (v: number) => void;
  onCash: (v: number) => void;
  onFillCash: () => void;
  onSkip: () => void;
  onVoid: () => void;
  disabled: boolean;
}) {
  const s = row.stop;
  const name = s.name || '(deleted customer)';

  if (s.done) {
    return (
      <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-3 opacity-60">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-bold text-[#0f172a] dark:text-white truncate">{s.position}. {name}</div>
            <div className="text-xs font-bold text-[#15803d] dark:text-[#4ade80]">Already entered • {s.delivered_today} bottles</div>
          </div>
          <button type="button" onClick={onVoid} disabled={disabled}
            className="min-h-[48px] px-4 rounded-2xl border border-[rgba(239,68,68,0.25)] text-[#b91c1c] dark:text-[#f87171] text-sm font-bold disabled:opacity-40 shrink-0">
            Void
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-3 ${row.skipped ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <div className="text-base font-black text-[#0f172a] dark:text-white truncate">{s.position}. {name}</div>
          <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold truncate">
            {[s.area, s.address].filter(Boolean).join(' • ') || '—'}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#f1f5f9] dark:bg-white/5 text-[#475569] dark:text-[#94a3b8]">
              Out: {s.bottles_out}
            </span>
            {s.pending_order_qty != null && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24]">
                Order: {s.pending_order_qty}
              </span>
            )}
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#f1f5f9] dark:bg-white/5 text-[#475569] dark:text-[#94a3b8]">
              Rs. {s.rate_per_bottle}/bottle
            </span>
          </div>
        </div>
        <button type="button" onClick={onSkip} aria-pressed={row.skipped} disabled={disabled}
          className={`min-h-[48px] px-3 rounded-2xl border text-sm font-bold shrink-0 disabled:opacity-40 ${row.skipped
            ? 'border-[#f59e0b] bg-[#fef3c7] text-[#92400e] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24]'
            : 'border-[#e2e8f0] dark:border-white/10 text-[#64748b] dark:text-[#94a3b8]'}`}>
          {row.skipped ? 'Skipped' : 'Skip'}
        </button>
      </div>
      {!row.skipped && (
        <div className="flex flex-col gap-2 mt-2">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Delivered</span>
            <Stepper value={row.delivered} onChange={onDelivered} min={0} max={1000} label={`Delivered bottles for ${name}`} />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Empty returned</span>
            <Stepper value={row.empties} onChange={onEmpties} min={0} max={1000} label={`Empty bottles for ${name}`} />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Cash</span>
              <input
                type="number"
                inputMode="numeric"
                value={row.cash}
                min={0}
                onChange={e => onCash(Math.max(0, Math.trunc(Number(e.target.value)) || 0))}
                aria-label={`Cash collected from ${name}`}
                disabled={disabled}
                className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base font-black text-[#0f172a] dark:text-white outline-none focus:border-[#3b82f6] disabled:opacity-40"
              />
            </div>
            <button type="button" onClick={onFillCash} disabled={disabled} aria-label={`Set cash as bottles times rate for ${name}`}
              className="min-h-[48px] px-3 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-xs font-bold text-[#0f172a] dark:text-white disabled:opacity-40 shrink-0">
              qty × rate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Void reason modal ── */
function VoidModal({ customerName, busy, onClose, onConfirm }: {
  customerName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Void delivery">
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose()} />
      <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#0f172a] rounded-t-[2rem] sm:rounded-[2rem] border border-[#e2e8f0] dark:border-white/10 p-5 pb-6">
        <h2 className="text-base font-black text-[#0f172a] dark:text-white mb-1">Void delivery</h2>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-3 truncate">{customerName}</p>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (required)"
          aria-label="Void reason"
          className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#ef4444] mb-3"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(reason.trim())} disabled={busy || !valid}
            className="flex-1 min-h-[48px] rounded-2xl bg-[#dc2626] text-white text-base font-bold disabled:opacity-40">
            {busy ? 'Voiding…' : 'Void'}
          </button>
        </div>
      </div>
    </div>
  );
}
