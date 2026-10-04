import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterRoute, WaterCustomer } from './waterTypes';
import { DAY_SHORT, daysSummary } from './waterTypes';
import { SheetShell } from './VehiclesPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

const customerName = (customers: WaterCustomer[], id: string): string => {
  const c = customers.find(x => x.id === id);
  if (!c) return '(deleted customer)';
  return c.name || '(deleted customer)';
};

export default function RoutesPanel({ managerId, customers }: Props): JSX.Element {
  const [routes, setRoutes] = useState<WaterRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaterRoute | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('water_routes')
        .select('*')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setRoutes((data as WaterRoute[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load routes.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#64748b] dark:text-[#94a3b8]">
          {routes.length} route{routes.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-[48px] px-5 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold"
        >
          Add route
        </button>
      </div>

      {loading && (
        <div className="flex flex-col gap-3" aria-label="Loading routes">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 animate-pulse">
              <div className="h-5 w-1/2 rounded-lg bg-[#e2e8f0] dark:bg-white/10 mb-2" />
              <div className="h-4 w-2/3 rounded-lg bg-[#f1f5f9] dark:bg-white/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load routes</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && routes.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[rgba(20,184,166,0.12)] text-[#0d9488] dark:text-[#5eead4] flex items-center justify-center mb-3">
            <IconPin />
          </div>
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">No routes yet</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Add your first delivery route with customer stops.</p>
        </div>
      )}

      {!loading && !error && routes.length > 0 && (
        <div className="flex flex-col gap-3 pb-8">
          {routes.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditing(r)}
              aria-label={`Edit route ${r.name}`}
              className={`w-full text-left rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 active:scale-[0.99] transition-transform ${r.is_active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-black text-[#0f172a] dark:text-white truncate">{r.name}</div>
                  <div className="text-sm text-[#64748b] dark:text-[#94a3b8] font-semibold">
                    {r.area || 'No area'} • {daysSummary(r.days)}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${r.is_active
                  ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
                  : 'bg-[rgba(148,163,184,0.15)] text-[#64748b] dark:text-[#94a3b8]'}`}>
                  {r.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-2.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-[#ccfbf1] text-[#0f766e] dark:bg-[rgba(45,212,191,0.15)] dark:text-[#5eead4]">
                  <IconPin className="w-3.5 h-3.5" />
                  {(r.stops || []).length} stop{(r.stops || []).length === 1 ? '' : 's'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <RouteSheet
          managerId={managerId}
          customers={customers}
          route={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

/* ── Add / edit sheet ── */
function RouteSheet({ managerId, customers, route, onClose, onSaved }: {
  managerId: string;
  customers: WaterCustomer[];
  route: WaterRoute | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(route?.name || '');
  const [area, setArea] = useState(route?.area || '');
  const [days, setDays] = useState<number[]>(route?.days || []);
  const [stops, setStops] = useState<string[]>(route?.stops || []);
  const [isActive, setIsActive] = useState(route?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const valid = name.trim().length > 0;

  const toggleDay = (d: number) =>
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));

  const addStop = (id: string) => {
    if (stops.includes(id)) return; // same customer not twice
    setStops(prev => [...prev, id]);
  };
  const removeStop = (idx: number) => setStops(prev => prev.filter((_, i) => i !== idx));
  const moveStop = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= stops.length) return;
    setStops(prev => {
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const save = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setMsg(null);
    try {
      const row = {
        manager_id: managerId,
        name: name.trim(),
        area: area.trim() || null,
        days,
        stops, // whole ordered array in one write
        is_active: isActive,
      };
      if (route) {
        const { error } = await supabase.from('water_routes').update(row).eq('id', route.id).eq('manager_id', managerId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('water_routes').insert(row);
        if (error) throw new Error(error.message);
      }
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (busy || !route) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('water_routes').update({ is_active: false }).eq('id', route.id).eq('manager_id', managerId);
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Deactivate failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={route ? 'Edit route' : 'Add route'} onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="route-name">
        Route name *
      </label>
      <input id="route-name" type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="e.g. Model Town morning" className={`${inputCls} mb-4`} />
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="route-area">
        Area
      </label>
      <input id="route-area" type="text" value={area} onChange={e => setArea(e.target.value)}
        placeholder="e.g. Model Town" className={`${inputCls} mb-4`} />

      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Days</span>
      <div className="grid grid-cols-7 gap-1.5 mb-4" role="group" aria-label="Delivery days">
        {DAY_SHORT.map((d, i) => {
          const on = days.includes(i);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => toggleDay(i)}
              className={`min-h-[48px] rounded-xl border text-xs font-black transition-colors ${on
                ? 'border-[#14b8a6] bg-[#ccfbf1] text-[#0f766e] dark:bg-[rgba(45,212,191,0.15)] dark:text-[#5eead4]'
                : 'border-[#e2e8f0] dark:border-white/10 text-[#64748b] dark:text-[#94a3b8]'}`}
            >
              {d}
            </button>
          );
        })}
      </div>

      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">
        Stops ({stops.length})
      </span>
      <StopPicker customers={customers} excludeIds={stops} onAdd={addStop} />
      <div className="flex flex-col gap-2 mb-4 mt-2">
        {stops.map((id, idx) => {
          const c = customers.find(x => x.id === id);
          return (
            <div
              key={`${id}-${idx}`}
              className="flex items-center gap-2 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-2 pl-3"
            >
              <span className="min-w-[28px] h-7 rounded-lg bg-[#0f172a] dark:bg-[#e2e8f0] text-white dark:text-[#0f172a] text-sm font-black flex items-center justify-center">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{customerName(customers, id)}</div>
                {c?.phone ? <div className="text-xs text-[#64748b] dark:text-[#94a3b8]">{c.phone}</div> : null}
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0} aria-label={`Move stop ${idx + 1} up`}
                  className="min-h-[48px] min-w-[44px] rounded-xl text-[#475569] dark:text-[#94a3b8] flex items-center justify-center disabled:opacity-30">
                  <IconUp />
                </button>
                <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1} aria-label={`Move stop ${idx + 1} down`}
                  className="min-h-[48px] min-w-[44px] rounded-xl text-[#475569] dark:text-[#94a3b8] flex items-center justify-center disabled:opacity-30">
                  <IconDown />
                </button>
                <button type="button" onClick={() => removeStop(idx)} aria-label={`Remove stop ${idx + 1}`}
                  className="min-h-[48px] min-w-[44px] rounded-xl text-[#b91c1c] dark:text-[#f87171] flex items-center justify-center">
                  <IconX />
                </button>
              </div>
            </div>
          );
        })}
        {stops.length === 0 && (
          <p className="text-sm text-[#94a3b8] text-center py-3">No stops yet — search and tap a customer to add.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsActive(a => !a)}
        aria-pressed={isActive}
        className="w-full min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white flex items-center justify-between px-4 mb-4"
      >
        <span>Active</span>
        <span className={`w-12 h-7 rounded-full p-1 transition-colors ${isActive ? 'bg-[#22c55e]' : 'bg-[#cbd5e1] dark:bg-white/15'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : ''}`} />
        </span>
      </button>
      <button
        type="button"
        onClick={save}
        disabled={busy || !valid}
        className="w-full min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40 mb-2"
      >
        {busy ? 'Saving…' : route ? 'Save changes' : 'Add route'}
      </button>
      {route && route.is_active && (
        <button
          type="button"
          onClick={deactivate}
          disabled={busy}
          className="w-full min-h-[48px] rounded-2xl border border-[rgba(239,68,68,0.25)] text-[#b91c1c] dark:text-[#f87171] text-base font-bold disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Deactivate'}
        </button>
      )}
    </SheetShell>
  );
}

/* ── Customer picker: search name/phone/area, tap to add ── */
function StopPicker({ customers, excludeIds, onAdd }: {
  customers: WaterCustomer[];
  excludeIds: string[];
  onAdd: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return customers
      .filter(c => !excludeIds.includes(c.id))
      .filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query) ||
        (c.area || '').toLowerCase().includes(query)
      )
      .slice(0, 30);
  }, [q, customers, excludeIds]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"><IconSearch /></span>
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search customer to add stop"
        aria-label="Search customers"
        className="w-full min-h-[48px] pl-10 pr-3 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#14b8a6]"
      />
      {q.trim() && (
        <div className="mt-2 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
          {results.length === 0 && (
            <p className="text-sm text-[#94a3b8] text-center py-2">No match.</p>
          )}
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onAdd(c.id); setQ(''); }}
              aria-label={`Add ${c.name} as stop`}
              className="w-full min-h-[48px] text-left rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 px-3 py-2 flex items-center gap-2"
            >
              <span className="min-w-[40px] min-h-[40px] rounded-xl bg-[rgba(20,184,166,0.12)] text-[#0d9488] dark:text-[#5eead4] flex items-center justify-center shrink-0">
                <IconPlus />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#0f172a] dark:text-white truncate">{c.name}</span>
                <span className="block text-xs text-[#64748b] dark:text-[#94a3b8] truncate">
                  {c.phone}{c.area ? ` • ${c.area}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Icons (inline SVG only) ── */
function IconPin({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
function IconDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
