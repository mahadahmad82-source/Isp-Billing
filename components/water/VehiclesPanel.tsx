import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterVehicle, VehicleType } from './waterTypes';
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from './waterTypes';

interface Props {
  managerId: string;
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

export default function VehiclesPanel({ managerId }: Props): React.JSX.Element {
  const [vehicles, setVehicles] = useState<WaterVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaterVehicle | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('water_vehicles')
        .select('*')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setVehicles((data as WaterVehicle[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load vehicles.');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-[#64748b] dark:text-[#94a3b8]">
          {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-[48px] px-5 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold"
        >
          Add vehicle
        </button>
      </div>

      {loading && (
        <div className="flex flex-col gap-3" aria-label="Loading vehicles">
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
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">Could not load vehicles</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{error}</p>
          <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && vehicles.length === 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[rgba(59,130,246,0.12)] text-[#3b82f6] flex items-center justify-center mb-3">
            <IconTruck />
          </div>
          <p className="text-base font-bold text-[#0f172a] dark:text-white mb-1">No vehicles yet</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Add your bike, rickshaw, van or truck.</p>
        </div>
      )}

      {!loading && !error && vehicles.length > 0 && (
        <div className="flex flex-col gap-3 pb-8">
          {vehicles.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => setEditing(v)}
              aria-label={`Edit ${v.name}`}
              className={`w-full text-left rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 active:scale-[0.99] transition-transform ${v.is_active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-black text-[#0f172a] dark:text-white truncate">{v.name}</div>
                  <div className="text-sm text-[#64748b] dark:text-[#94a3b8] font-semibold">
                    {VEHICLE_TYPE_LABELS[(v.vehicle_type as VehicleType)] || v.vehicle_type}
                    {v.plate ? ` • ${v.plate}` : ''}
                    {v.capacity != null ? ` • ${v.capacity} bottles` : ''}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${v.is_active
                  ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
                  : 'bg-[rgba(148,163,184,0.15)] text-[#64748b] dark:text-[#94a3b8]'}`}>
                  {v.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <VehicleSheet
          managerId={managerId}
          vehicle={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

/* ── Add / edit sheet ── */
function VehicleSheet({ managerId, vehicle, onClose, onSaved }: {
  managerId: string;
  vehicle: WaterVehicle | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vehicle?.name || '');
  const [plate, setPlate] = useState(vehicle?.plate || '');
  const [type, setType] = useState<VehicleType>((vehicle?.vehicle_type as VehicleType) || 'bike');
  const [capacity, setCapacity] = useState<number>(vehicle?.capacity ?? 0);
  const [isActive, setIsActive] = useState(vehicle?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const valid = name.trim().length > 0;

  const save = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setMsg(null);
    try {
      const row = {
        manager_id: managerId,
        name: name.trim(),
        plate: plate.trim() || null,
        vehicle_type: type,
        capacity,
        is_active: isActive,
      };
      if (vehicle) {
        const { error } = await supabase.from('water_vehicles').update(row).eq('id', vehicle.id).eq('manager_id', managerId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('water_vehicles').insert(row);
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
    if (busy || !vehicle) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('water_vehicles').update({ is_active: false }).eq('id', vehicle.id).eq('manager_id', managerId);
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Deactivate failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={vehicle ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="veh-name">
        Name *
      </label>
      <input
        id="veh-name"
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Loader rickshaw 1"
        className={`${inputCls} mb-4`}
      />
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="veh-plate">
        Number plate
      </label>
      <input
        id="veh-plate"
        type="text"
        value={plate}
        onChange={e => setPlate(e.target.value)}
        placeholder="e.g. LEA-1234"
        className={`${inputCls} mb-4`}
      />
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Type</span>
      <div className="grid grid-cols-4 gap-2 mb-4" role="radiogroup" aria-label="Vehicle type">
        {VEHICLE_TYPES.map(t => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={`min-h-[48px] rounded-2xl border text-sm font-bold transition-colors ${type === t
              ? 'border-[#3b82f6] bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
              : 'border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}
          >
            {VEHICLE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Capacity (bottles)</span>
      <div className="mb-4"><Stepper value={capacity} onChange={setCapacity} min={0} max={10000} label="Capacity in bottles" /></div>
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
        {busy ? 'Saving…' : vehicle ? 'Save changes' : 'Add vehicle'}
      </button>
      {vehicle && vehicle.is_active && (
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

/* ── Shared bits ── */
export function SheetShell({ title, onClose, busy, children }: {
  title: string; onClose: () => void; busy?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] bg-white dark:bg-[#0f172a] border-t border-[#e2e8f0] dark:border-white/10 p-5 pb-8">
        <div className="w-10 h-1 rounded-full bg-[#e2e8f0] dark:bg-white/15 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-[#0f172a] dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${title}`}
            className="min-h-[48px] min-w-[48px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#475569] dark:text-[#94a3b8] flex items-center justify-center disabled:opacity-50"
          >
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min, max, label }: {
  value: number; onChange: (v: number) => void; min: number; max: number; label: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.trunc(v) || 0));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        aria-label={`Decrease ${label}`}
        className="min-h-[48px] min-w-[48px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-xl font-black text-[#0f172a] dark:text-white flex items-center justify-center"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(clamp(Number(e.target.value)))}
        aria-label={label}
        className="flex-1 min-h-[48px] rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-center text-lg font-black text-[#0f172a] dark:text-white outline-none focus:border-[#3b82f6]"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        aria-label={`Increase ${label}`}
        className="min-h-[48px] min-w-[48px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-xl font-black text-[#0f172a] dark:text-white flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
      <path d="M1 8h13v9H1z" /><path d="M14 11h4l3 3v3h-7z" /><circle cx="6" cy="19" r="1.6" /><circle cx="17" cy="19" r="1.6" />
    </svg>
  );
}
