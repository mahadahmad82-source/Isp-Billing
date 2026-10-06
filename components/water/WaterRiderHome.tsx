import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterRouteSheet } from './waterTypes';
import { todayKarachi, formatDayPK, formatRs } from './waterTypes';
import { Stepper } from './VehiclesPanel';
import { useRiderQueue } from './useRiderQueue';
import RiderStopCard from './RiderStopCard';

interface Props {
  riderUsername: string;
  /** Manager username — every payload is RLS-scoped to it. */
  managerUsername: string;
  onLogout: () => void;
}

interface RiderPlan {
  plan_id: string;
  date: string;
  status: string;
  rider: string;
  loaded_bottles: number;
  returned_bottles: number | null;
  route_name: string;
  area: string;
  stops_count: number;
  vehicle: string;
  plate: string;
  stops_done: number;
}

/**
 * M6c: the rider's delivery app. Only today's plans, route stops in order,
 * per-stop delivery entry (offline-safe), day close, and the rider's own
 * day totals. No ledger, no balances, no rates beyond the route sheet,
 * no other riders' data.
 */
export default function WaterRiderHome({ riderUsername, managerUsername, onLogout }: Props): React.JSX.Element {
  const today = todayKarachi();
  const [plans, setPlans] = useState<RiderPlan[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<WaterRouteSheet | null>(null);
  const [totals, setTotals] = useState({ bottles: 0, collected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [returned, setReturned] = useState(0);
  const [busy, setBusy] = useState(false);
  const { queue, enqueue, pending, flush } = useRiderQueue(riderUsername);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_my_plans', { p_date: today });
      if (error) throw new Error(error.message);
      const list = (data as RiderPlan[]) || [];
      setPlans(list);
      setPlanId(prev => prev || (list.length === 1 ? list[0].plan_id : null));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load plans.');
    } finally {
      setLoading(false);
    }
  }, [today]);

  const loadSheet = useCallback(async (id: string) => {
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_route_sheet', { p_plan_id: id });
      if (error) throw new Error(error.message);
      if (!data || !data.success) {
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(payload || 'Could not load route sheet.');
      }
      setSheet(data as WaterRouteSheet);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load route sheet.');
    }
  }, []);

  const loadTotals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('water_deliveries')
        .select('bottles_delivered,amount_collected')
        .eq('manager_id', managerUsername)
        .eq('rider_username', riderUsername)
        .eq('delivery_date', today)
        .is('voided_at', null);
      if (error) throw new Error(error.message);
      let b = 0, c = 0;
      for (const r of (data as { bottles_delivered: number; amount_collected: number }[]) || []) {
        b += r.bottles_delivered || 0;
        c += r.amount_collected || 0;
      }
      setTotals({ bottles: b, collected: c });
    } catch {
      /* totals are nice-to-have; the list still works */
    }
  }, [managerUsername, riderUsername, today]);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { if (planId) loadSheet(planId); }, [planId, loadSheet]);
  useEffect(() => { loadTotals(); }, [loadTotals]);

  // M6c: when the offline queue drains, refresh so synced stops flip to Done.
  const prevPending = useRef(pending);
  useEffect(() => {
    if (prevPending.current > 0 && pending === 0) {
      if (planId) loadSheet(planId);
      loadTotals();
    }
    prevPending.current = pending;
  }, [pending, planId, loadSheet, loadTotals]);

  const refresh = useCallback(() => {
    if (planId) loadSheet(planId);
    loadPlans();
    loadTotals();
  }, [planId, loadSheet, loadPlans, loadTotals]);

  const closeDay = async () => {
    if (busy || !planId) return;
    if (pending > 0) {
      setMsg(`Pehle pending sync mukammal karein (${pending} entries baqi hain).`);
      flush();
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('water_close_plan', { p_plan_id: planId, p_returned: returned });
      if (error || (data && !data.success)) {
        const transport = (error as { message?: string } | null)?.message;
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(transport || payload || 'Could not close the plan.');
      }
      setClosing(false);
      setReturned(0);
      refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not close the plan.');
    } finally {
      setBusy(false);
    }
  };

  if (!managerUsername) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-[#f4f7fc] dark:bg-[#0b0f1a]">
        <p className="text-base font-bold text-[#0f172a] dark:text-white mb-2">Session issue</p>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4">Apna manager link nahi mila. Dobara login karein.</p>
        <button type="button" onClick={onLogout} className="min-h-[52px] px-8 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">Log out</button>
      </div>
    );
  }

  const plan = plans.find(p => p.plan_id === planId) || null;
  const stops = sheet?.stops || [];
  const doneCount = stops.filter(s => s.done).length;

  return (
    <div className="min-h-screen bg-[#f4f7fc] dark:bg-[#0b0f1a]">
      <header className="sticky top-0 z-30 bg-white dark:bg-[#0f172a] border-b border-[#e2e8f0] dark:border-white/10 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-[#0f172a] dark:text-white truncate">{riderUsername}</p>
            <p className="text-[11px] text-[#64748b] dark:text-[#94a3b8] font-semibold">Today • {formatDayPK(today)}</p>
          </div>
          {pending > 0 && (
            <span className="shrink-0 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-[rgba(245,158,11,0.18)] text-[#b45309] dark:text-[#fbbf24]">
              Pending sync ({pending})
            </span>
          )}
          <button type="button" onClick={onLogout} aria-label="Log out"
            className="shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#475569] dark:text-[#94a3b8]">
            Logout
          </button>
        </div>
      </header>

      <div className="px-4 py-4 max-w-3xl mx-auto">
        {msg && (
          <p className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">{msg}</p>
        )}
        {error && (
          <div className="rounded-2xl bg-[rgba(239,68,68,0.1)] p-4 mb-3">
            <p className="text-sm font-bold text-[#b91c1c] dark:text-[#f87171] mb-2">{error}</p>
            <button type="button" onClick={refresh} className="min-h-[48px] px-6 rounded-2xl bg-[#dc2626] text-white text-base font-bold">Retry</button>
          </div>
        )}

        {/* Day totals */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
            <div className="text-xl font-black text-[#0f172a] dark:text-white">{totals.bottles.toLocaleString('en-US')}</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Bottles today</div>
          </div>
          <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
            <div className="text-xl font-black text-[#15803d] dark:text-[#4ade80]">{formatRs(totals.collected)}</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">Collected today</div>
          </div>
        </div>

        {loading && <p className="text-sm text-[#94a3b8] text-center py-8">Loading plans…</p>}

        {!loading && plans.length === 0 && (
          <p className="text-sm text-[#94a3b8] text-center py-8">Aaj ke liye koi plan nahi hai.</p>
        )}

        {!loading && plans.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="tablist" aria-label="Plans">
            {plans.map(p => (
              <button key={p.plan_id} type="button" role="tab" aria-selected={planId === p.plan_id} onClick={() => setPlanId(p.plan_id)}
                className={`shrink-0 min-h-[48px] px-4 rounded-2xl text-sm font-bold ${planId === p.plan_id
                  ? 'bg-[#1d4ed8] text-white' : 'bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
                {p.route_name || 'Plan'}
              </button>
            ))}
          </div>
        )}

        {plan && (
          <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-black text-[#0f172a] dark:text-white truncate">{sheet?.route?.name || plan.route_name || 'Route'}</p>
                <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">
                  {doneCount}/{stops.length} stops • Loaded {plan.loaded_bottles} bottles
                  {sheet?.vehicle ? ` • ${sheet.vehicle.name}${sheet.vehicle.plate ? ` (${sheet.vehicle.plate})` : ''}` : ''}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${plan.status === 'closed'
                ? 'bg-[#f1f5f9] dark:bg-white/10 text-[#64748b] dark:text-[#94a3b8]'
                : 'bg-[rgba(59,130,246,0.12)] text-[#1d4ed8] dark:text-[#93c5fd]'}`}>
                {plan.status}
              </span>
            </div>
            {plan.status !== 'closed' && (
              !closing ? (
                <button type="button" onClick={() => setClosing(true)} disabled={busy}
                  className="w-full min-h-[52px] mt-3 rounded-2xl bg-[#0f172a] dark:bg-white text-white dark:text-[#0f172a] text-base font-bold disabled:opacity-40">
                  Close day
                </button>
              ) : (
                <div className="mt-3 rounded-2xl border border-[#e2e8f0] dark:border-white/10 p-3">
                  <span className="text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5 block">Empties returned to plant</span>
                  <div className="mb-3"><Stepper value={returned} onChange={setReturned} min={0} max={10000} label="Empties returned" /></div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setClosing(false)} disabled={busy}
                      className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={closeDay} disabled={busy}
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-sm font-bold disabled:opacity-50">{busy ? 'Closing…' : 'Confirm close'}</button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <div className="space-y-3 pb-8">
          {stops.map(s => (
            <RiderStopCard
              key={s.customer_id}
              stop={s}
              planId={plan?.plan_id || ''}
              planDate={today}
              managerId={managerUsername}
              riderUsername={riderUsername}
              vehicleId={sheet?.vehicle?.id || null}
              hasPending={queue.some(q => (q.payload as { customer_id?: string }).customer_id === s.customer_id)}
              queuedRef={queue.find(q => (q.payload as { customer_id?: string }).customer_id === s.customer_id)?.client_ref || null}
              onChanged={refresh}
              enqueue={enqueue}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
