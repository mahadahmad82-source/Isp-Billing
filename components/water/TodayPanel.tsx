import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterDailyPlan, WaterRoute, WaterVehicle } from './waterTypes';
import { toISODate, formatDayPK } from './waterTypes';
import { SheetShell, Stepper } from './VehiclesPanel';
import BulkEntry from './BulkEntry';
import PrintRouteSheet from './PrintRouteSheet';

interface Props {
  managerId: string;
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

export default function TodayPanel({ managerId }: Props): React.JSX.Element {
  const [dateIso, setDateIso] = useState(() => toISODate(new Date()));
  const [plans, setPlans] = useState<WaterDailyPlan[]>([]);
  const [routes, setRoutes] = useState<WaterRoute[]>([]);
  const [vehicles, setVehicles] = useState<WaterVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [closePlan, setClosePlan] = useState<WaterDailyPlan | null>(null);
  const [entryPlan, setEntryPlan] = useState<WaterDailyPlan | null>(null);
  const [printPlanId, setPrintPlanId] = useState<string | null>(null);

  const load = useCallback(async (iso: string) => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, rRes, vRes] = await Promise.all([
        supabase.from('water_daily_plans').select('*').eq('manager_id', managerId).eq('plan_date', iso).order('created_at'),
        supabase.from('water_routes').select('id,name,area,is_active').eq('manager_id', managerId),
        supabase.from('water_vehicles').select('id,name,plate,is_active').eq('manager_id', managerId),
      ]);
      if (pRes.error) throw new Error(pRes.error.message);
      if (rRes.error) throw new Error(rRes.error.message);
      if (vRes.error) throw new Error(vRes.error.message);
      setPlans((pRes.data as WaterDailyPlan[]) || []);
      setRoutes((rRes.data as WaterRoute[]) || []);
      setVehicles((vRes.data as WaterVehicle[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load plans.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { load(dateIso); }, [load, dateIso]);

  const shiftDay = (dir: -1 | 1) => {
    const d = new Date(dateIso + 'T00:00');
    d.setDate(d.getDate() + dir);
    setDateIso(toISODate(d));
  };

  const routeOf = (id: string) => routes.find(r => r.id === id);
  const vehicleOf = (id: string | null) => (id ? vehicles.find(v => v.id === id) : undefined);
  const isToday = dateIso === toISODate(new Date());

  return (
    <div>
      {/* Date selector */}
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => shiftDay(-1)} aria-label="Previous day"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">
          ‹
        </button>
        <button type="button" onClick={() => setDateIso(toISODate(new Date()))} aria-label="Go to today"
          className="flex-1 min-h-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-base font-black text-[#0f172a] dark:text-white">
          {formatDayPK(dateIso)}{isToday ? ' • Today' : ''}
        </button>
        <button type="button" onClick={() => shiftDay(1)} aria-label="Next day"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center text-xl font-black">
          ›
        </button>
      </div>

      <button type="button" onClick={() => setShowAdd(true)}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold mb-4">
        Add plan
      </button>

      {loading && (
        <div className="flex flex-col gap-3" aria-label="Loading plans">
          {[0, 1].map(i => (
            <div key={i} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 animate-pulse">
              <div className="h-5 w-1/2 rounded-lg bg-[#e2e8f0] dark:bg-white/10 mb-2" />
              <div className="h-4 w-2/3 rounded-lg bg-[#f1f5f9] dark:bg-white/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load plans</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={() => load(dateIso)} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && plans.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">No plans for this day</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Add a plan to start deliveries.</p>
        </div>
      )}

      {!loading && !error && plans.length > 0 && (
        <div className="flex flex-col gap-3 pb-8">
          {plans.map(p => {
            const r = routeOf(p.route_id);
            const v = vehicleOf(p.vehicle_id);
            return (
              <div key={p.id} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <div className="text-lg font-black text-[#0f172a] dark:text-white truncate">{r?.name || 'Route'}</div>
                    <div className="text-sm text-[#64748b] dark:text-[#94a3b8] font-semibold">
                      {r?.area || ''}{r?.area && (v || p.rider_username) ? ' • ' : ''}
                      {v ? `${v.name}${v.plate ? ` (${v.plate})` : ''}` : ''}
                      {v && p.rider_username ? ' • ' : ''}{p.rider_username || ''}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="text-sm font-bold text-[#0f172a] dark:text-white mb-3">
                  Loaded: {p.loaded_bottles} bottles
                  {p.status === 'closed' && p.returned_bottles != null ? ` • Returned: ${p.returned_bottles}` : ''}
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => setEntryPlan(p)}
                    className="w-full min-h-[48px] rounded-2xl bg-[#0f766e] text-white text-base font-bold">
                    Enter deliveries
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setPrintPlanId(p.id)}
                      className="min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white">
                      Print sheet
                    </button>
                    {p.status !== 'closed' && (
                      <button type="button" onClick={() => setClosePlan(p)}
                        className="min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white">
                        Close day
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddPlanSheet
          managerId={managerId}
          dateIso={dateIso}
          routes={routes.filter(r => r.is_active)}
          vehicles={vehicles.filter(v => v.is_active)}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(dateIso); }}
        />
      )}
      {closePlan && (
        <CloseDaySheet
          managerId={managerId}
          plan={closePlan}
          routeName={routeOf(closePlan.route_id)?.name || 'Route'}
          onClose={() => setClosePlan(null)}
          onSaved={() => { setClosePlan(null); load(dateIso); }}
        />
      )}
      {entryPlan && (
        <BulkEntry
          managerId={managerId}
          plan={entryPlan}
          onClose={() => setEntryPlan(null)}
          onDone={() => { setEntryPlan(null); load(dateIso); }}
        />
      )}
      {printPlanId && (
        <PrintRouteSheet planId={printPlanId} onClose={() => setPrintPlanId(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status === 'in_progress' ? 'In progress' : status === 'closed' ? 'Closed' : 'Planned';
  const cls = status === 'closed'
    ? 'bg-[rgba(148,163,184,0.15)] text-[#64748b] dark:text-[#94a3b8]'
    : status === 'in_progress'
      ? 'bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
      : 'bg-[#fef3c7] text-[#92400e] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24]';
  return (
    <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

/* ── Add plan sheet ── */
function AddPlanSheet({ managerId, dateIso, routes, vehicles, onClose, onSaved }: {
  managerId: string;
  dateIso: string;
  routes: WaterRoute[];
  vehicles: WaterVehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [routeId, setRouteId] = useState(routes[0]?.id || '');
  const [vehicleId, setVehicleId] = useState('');
  const [rider, setRider] = useState('');
  const [loaded, setLoaded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    if (busy || !routeId) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('water_daily_plans').insert({
        manager_id: managerId,
        plan_date: dateIso,
        route_id: routeId,
        vehicle_id: vehicleId || null,
        rider_username: rider.trim() || null,
        loaded_bottles: loaded,
        status: 'planned',
      });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e: unknown) {
      // DB enforces one plan per route per date — show its message as-is.
      setMsg(e instanceof Error ? e.message : 'Could not add plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={`Add plan • ${formatDayPK(dateIso)}`} onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      {routes.length === 0 ? (
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-4">
          No active routes. Add a route first (Routes tab).
        </p>
      ) : (
        <>
          <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="plan-route">
            Route *
          </label>
          <select id="plan-route" value={routeId} onChange={e => setRouteId(e.target.value)}
            className={`${inputCls} mb-4`}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="plan-vehicle">
            Vehicle
          </label>
          <select id="plan-vehicle" value={vehicleId} onChange={e => setVehicleId(e.target.value)}
            className={`${inputCls} mb-4`}>
            <option value="">None</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ''}</option>)}
          </select>
          <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="plan-rider">
            Rider
          </label>
          <input id="plan-rider" type="text" value={rider} onChange={e => setRider(e.target.value)}
            placeholder="Rider username" className={`${inputCls} mb-4`} />
          <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">
            Loaded bottles
          </span>
          <div className="mb-4"><Stepper value={loaded} onChange={setLoaded} min={0} max={10000} label="Loaded bottles" /></div>
          <button type="button" onClick={save} disabled={busy || !routeId}
            className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
            {busy ? 'Saving…' : 'Add plan'}
          </button>
        </>
      )}
    </SheetShell>
  );
}

/* ── Close day sheet ── */
function CloseDaySheet({ managerId, plan, routeName, onClose, onSaved }: {
  managerId: string;
  plan: WaterDailyPlan;
  routeName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [returned, setReturned] = useState(0);
  const [delivered, setDelivered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('water_deliveries')
          .select('bottles_delivered')
          .eq('manager_id', managerId)
          .eq('plan_id', plan.id)
          .is('voided_at', null);
        if (error) throw new Error(error.message);
        setDelivered(((data as { bottles_delivered: number }[]) || []).reduce((s, r) => s + (r.bottles_delivered || 0), 0));
      } catch {
        setDelivered(0);
      }
    })();
  }, [managerId, plan.id]);

  const diff = delivered == null ? null : plan.loaded_bottles - delivered - returned;

  const close = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('water_close_plan', { p_plan_id: plan.id, p_returned: returned });
      if (error || (data && !data.success)) {
        const transport = (error as { message?: string } | null)?.message;
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(transport || payload || 'Could not close day.');
      }
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not close day.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={`Close day • ${routeName}`} onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
        <div className="flex justify-between text-base font-bold text-[#0f172a] dark:text-white py-1">
          <span>Loaded</span><span>{plan.loaded_bottles}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-[#0f172a] dark:text-white py-1">
          <span>Delivered</span><span>{delivered == null ? '…' : delivered}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-[#0f172a] dark:text-white py-1">
          <span>Returned</span><span>{returned}</span>
        </div>
        <div className="flex justify-between text-lg font-black text-[#0f172a] dark:text-white py-1 border-t border-[#e2e8f0] dark:border-white/10 mt-1 pt-2">
          <span>Difference</span><span>{diff == null ? '…' : diff}</span>
        </div>
      </div>
      {diff != null && diff !== 0 && (
        <div className="text-sm font-bold text-[#92400e] dark:text-[#fbbf24] bg-[rgba(245,158,11,0.12)] rounded-2xl px-3 py-2.5 mb-3">
          Bottle count does not match.
        </div>
      )}
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">
        Returned bottles
      </span>
      <div className="mb-4"><Stepper value={returned} onChange={setReturned} min={0} max={10000} label="Returned bottles" /></div>
      <button type="button" onClick={close} disabled={busy}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
        {busy ? 'Closing…' : 'Close day'}
      </button>
    </SheetShell>
  );
}
