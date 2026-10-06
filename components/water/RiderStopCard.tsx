import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterRouteSheetStop } from './waterTypes';
import { formatRs, digitsOnly } from './waterTypes';
import { Stepper } from './VehiclesPanel';
import type { QueuedDelivery } from './useRiderQueue';

interface Props {
  stop: WaterRouteSheetStop;
  planId: string;
  planDate: string;
  /** Manager username — RLS requires the payload's manager_id to match. */
  managerId: string;
  riderUsername: string;
  vehicleId: string | null;
  /** A queue entry for this stop is still waiting to sync. */
  hasPending: boolean;
  /** client_ref of the already-queued entry (if any) — reused so a re-save can never fork a duplicate. */
  queuedRef?: string | null;
  onChanged: () => void;
  enqueue: (e: QueuedDelivery) => void;
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

const isNetworkError = (e: unknown) =>
  !navigator.onLine || /failed to fetch|networkerror|network request failed/i.test(e instanceof Error ? e.message : String(e));

/**
 * M6c: one route stop for the rider — customer info (tap-to-call), delivery
 * entry form, and void of the rider's own today entry. Saves use a stable
 * client_ref per attempt (BulkEntry pattern): retries never double-enter;
 * a failed-network save goes to the offline queue instead.
 */
export default function RiderStopCard({
  stop, planId, planDate, managerId, riderUsername, vehicleId, hasPending, queuedRef, onChanged, enqueue,
}: Props): React.JSX.Element {
  const [bottles, setBottles] = useState(stop.usual_bottles);
  const [empties, setEmpties] = useState(0);
  const [cash, setCash] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const refRef = useRef<string | null>(queuedRef || null);

  const refFor = () => {
    if (!refRef.current) refRef.current = `rider-${planId}-${stop.customer_id}-${Date.now().toString(36)}`;
    return refRef.current;
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const payload = {
      manager_id: managerId,
      plan_id: planId,
      delivery_date: planDate,
      customer_id: stop.customer_id,
      rider_username: riderUsername,
      vehicle_id: vehicleId,
      bottles_delivered: bottles,
      empties_returned: empties,
      amount_collected: cash,
      rate_per_bottle: stop.rate_per_bottle,
      source: 'app' as const,
      client_ref: refFor(),
    };
    try {
      const { error } = await supabase
        .from('water_deliveries')
        .upsert(payload, { onConflict: 'manager_id,client_ref', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      refRef.current = null; // saved — next entry gets a fresh key
      onChanged();
    } catch (e: unknown) {
      if (isNetworkError(e)) {
        enqueue({ client_ref: refFor(), payload: payload as Record<string, unknown>, queuedAt: new Date().toISOString() });
        setMsg({ ok: true, text: 'No connection — entry queued, will sync automatically.' });
      } else {
        setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const voidEntry = async () => {
    if (busy || !reason.trim()) {
      if (!reason.trim()) setMsg({ ok: false, text: 'A void reason is required.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { data, error: qErr } = await supabase
        .from('water_deliveries')
        .select('id')
        .eq('manager_id', managerId)
        .eq('customer_id', stop.customer_id)
        .eq('delivery_date', planDate)
        .is('voided_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (qErr) throw new Error(qErr.message);
      if (!data) throw new Error('No entry found to void for this stop.');
      const { data: vData, error: vErr } = await supabase.rpc('water_void_delivery', {
        p_id: (data as { id: string }).id,
        p_reason: reason.trim(),
      });
      if (vErr || (vData && !vData.success)) {
        const transport = (vErr as { message?: string } | null)?.message;
        const payload = vData && typeof vData === 'object' && 'error' in vData ? String((vData as { error?: unknown }).error || '') : '';
        throw new Error(transport || payload || 'Void refused.');
      }
      refRef.current = null; // voided — a re-entry must use a fresh key
      setVoiding(false);
      setReason('');
      onChanged();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Void failed.' });
    } finally {
      setBusy(false);
    }
  };

  const phone = stop.phone || '';

  return (
    <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-base font-black text-[#0f172a] dark:text-white truncate">{stop.name || '(deleted customer)'}</p>
          {stop.address ? <p className="text-xs text-[#64748b] dark:text-[#94a3b8] truncate">{stop.address}</p> : null}
        </div>
        {stop.done ? (
          <span className="shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[rgba(34,197,94,0.15)] text-[#15803d] dark:text-[#4ade80]">
            Done
          </span>
        ) : hasPending ? (
          <span className="shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[rgba(245,158,11,0.15)] text-[#b45309] dark:text-[#fbbf24]">
            Pending sync
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {digitsOnly(phone).length >= 10 && (
          <a href={`tel:${phone}`} className="min-h-[44px] px-4 rounded-2xl bg-[rgba(59,130,246,0.12)] text-[#1d4ed8] dark:text-[#93c5fd] text-sm font-bold flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Call
          </a>
        )}
        <span className="text-xs font-semibold text-[#64748b] dark:text-[#94a3b8]">
          Usual {stop.usual_bottles} bottles{stop.bottles_out > 0 ? ` • ${stop.bottles_out} out` : ''}
        </span>
        {stop.pending_order_qty != null && stop.pending_order_qty > 0 && (
          <span className="text-xs font-bold text-[#b45309] dark:text-[#fbbf24]">Order: {stop.pending_order_qty}</span>
        )}
      </div>

      {msg && (
        <p className={`text-sm font-semibold px-3 py-2 rounded-2xl mb-3 ${msg.ok
          ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
          : 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]'}`}>
          {msg.text}
        </p>
      )}

      {stop.done ? (
        <>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-3">
            Delivered today: <span className="font-black text-[#0f172a] dark:text-white">{stop.delivered_today} bottles</span>
          </p>
          {!voiding ? (
            <button type="button" onClick={() => setVoiding(true)} disabled={busy}
              className="w-full min-h-[48px] rounded-2xl border border-[rgba(239,68,68,0.3)] text-[#b91c1c] dark:text-[#f87171] text-sm font-bold disabled:opacity-50">
              Void my entry
            </button>
          ) : (
            <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] p-3">
              <label className="text-xs font-black uppercase tracking-widest text-[#64748b] mb-1.5 block" htmlFor={`vr-${stop.customer_id}`}>Void reason *</label>
              <input id={`vr-${stop.customer_id}`} type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason"
                className={`${inputCls} mb-2`} />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setVoiding(false); setReason(''); }} disabled={busy}
                  className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold disabled:opacity-50">Cancel</button>
                <button type="button" onClick={voidEntry} disabled={busy}
                  className="flex-1 min-h-[48px] rounded-2xl bg-[#dc2626] text-white text-sm font-bold disabled:opacity-50">{busy ? 'Voiding…' : 'Confirm void'}</button>
              </div>
              <p className="text-[11px] text-[#94a3b8] mt-2">You can only void your own entry from today.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5 block">Bottles delivered</span>
          <div className="mb-3"><Stepper value={bottles} onChange={setBottles} min={0} max={1000} label="Bottles delivered" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5 block">Empties returned</span>
          <div className="mb-3"><Stepper value={empties} onChange={setEmpties} min={0} max={1000} label="Empties returned" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5 block">Amount collected (Rs.)</span>
          <div className="mb-3"><Stepper value={cash} onChange={setCash} min={0} max={1000000} label="Amount collected" /></div>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
            aria-label="Note" className={`${inputCls} mb-3`} />
          <button type="button" onClick={save} disabled={busy}
            className="w-full min-h-[52px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
            {busy ? 'Saving…' : `Save delivery${cash > 0 ? ` • ${formatRs(cash)}` : ''}`}
          </button>
        </>
      )}
    </div>
  );
}
