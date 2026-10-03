import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { BusinessType } from '../../types';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES, normalizeBusinessType } from '../../utils/businessType';
import {
  ManagerRow, ManagerFilter, SortKey, formatRs, formatEnPK, presenceOf, presenceLabel,
  extractRpcError, safeInt, checkAdminSession,
} from './managersPanelUtils';

export default function ManagersPanel(): JSX.Element {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ManagerFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selected, setSelected] = useState<ManagerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const { data, error } = await supabase.rpc('get_admin_manager_stats_v2');
      if (error) throw new Error(error.message);
      setManagers(Array.isArray(data) ? (data as ManagerRow[]) : []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load managers.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    total: managers.length,
    isp: managers.filter(m => normalizeBusinessType(m.business_type) === 'isp').length,
    water: managers.filter(m => normalizeBusinessType(m.business_type) === 'water').length,
    inactive: managers.filter(m => !m.is_active).length,
  }), [managers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = managers.filter(m => {
      if (filter !== 'all' && normalizeBusinessType(m.business_type) !== filter) return false;
      if (!q) return true;
      return m.business_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q) || (m.phone || '').toLowerCase().includes(q);
    });
    const ts = (s: string | null | undefined) => { if (!s) return -1; const t = new Date(s).getTime(); return Number.isNaN(t) ? -1 : t; };
    const sorted = [...list];
    if (sort === 'recent') sorted.sort((a, b) => ts(b.last_seen ?? b.last_login) - ts(a.last_seen ?? a.last_login));
    else if (sort === 'joined') sorted.sort((a, b) => ts(b.joined_at) - ts(a.joined_at));
    else if (sort === 'revenue') sorted.sort((a, b) => safeInt(b.total_revenue) - safeInt(a.total_revenue));
    else sorted.sort((a, b) => safeInt(b.user_count) - safeInt(a.user_count));
    return sorted;
  }, [managers, filter, search, sort]);

  const chip = (key: ManagerFilter, label: string, n: number) => {
    const active = filter === key;
    return (
      <button key={key} type="button" aria-pressed={active} onClick={() => setFilter(key)}
        className={`min-h-[44px] px-4 rounded-full text-sm font-bold border transition-colors ${active
          ? 'bg-[#0f172a] text-white border-[#0f172a] dark:bg-[#e2e8f0] dark:text-[#0f172a] dark:border-[#e2e8f0]'
          : 'bg-white text-[#475569] border-[#e2e8f0] dark:bg-[#0f172a] dark:text-[#94a3b8] dark:border-white/10'}`}>
        {label} <span className="opacity-70 font-semibold">({n})</span>
      </button>
    );
  };

  return (
    <div className="px-4 py-4 md:px-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Managers</h1>
          <p className="text-xs text-[#64748b] dark:text-[#94a3b8]">{counts.total} total accounts</p>
        </div>
        <button type="button" onClick={load} disabled={loading} aria-label="Refresh manager list"
          className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white flex items-center justify-center gap-2 disabled:opacity-50">
          <IconRefresh spin={loading} /><span className="text-sm font-bold hidden sm:inline">Refresh</span>
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatTile label="Total" value={counts.total} />
        <StatTile label="ISP" value={counts.isp} />
        <StatTile label="Water" value={counts.water} />
        <StatTile label="Inactive" value={counts.inactive} tone="warn" />
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {chip('all', 'All', counts.total)}{chip('isp', 'ISP', counts.isp)}{chip('water', 'Water', counts.water)}
      </div>
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"><IconSearch /></span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username, phone" aria-label="Search managers"
            className="w-full min-h-[44px] pl-10 pr-3 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]" />
        </div>
        <div className="relative">
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort managers"
            className="min-h-[44px] pl-3 pr-9 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm font-semibold text-[#0f172a] dark:text-white outline-none appearance-none">
            <option value="recent">Recently active</option><option value="joined">Joined (newest)</option>
            <option value="revenue">Revenue</option><option value="customers">Customers</option>
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none"><IconChevronDown /></span>
        </div>
      </div>
      {loading && <SkeletonList />}
      {!loading && loadError && (
        <StateBox icon={<IconAlert />} tone="red" title="Could not load managers" text={loadError}
          action={<button type="button" onClick={load} className="min-h-[44px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-sm font-bold">Retry</button>} />
      )}
      {!loading && !loadError && filtered.length === 0 && (
        <StateBox icon={<IconUsers />} tone="blue" title="No managers found" text="Try a different search or filter." />
      )}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="flex flex-col gap-3 pb-8">
          {filtered.map(m => <ManagerCard key={m.username} m={m} onOpen={() => setSelected(m)} />)}
        </div>
      )}
      {selected && (
        <ManagerSheet manager={selected} onClose={() => setSelected(null)}
          onChanged={load} onDeleted={() => { setSelected(null); load(); }} />
      )}
    </div>
  );
}

/* ── Small pieces ── */
function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  const warn = tone === 'warn' && value > 0;
  return (
    <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 px-3 py-3 text-center">
      <div className={`text-xl font-black ${warn ? 'text-[#d97706] dark:text-[#fbbf24]' : 'text-[#0f172a] dark:text-white'}`}>{value.toLocaleString('en-US')}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">{label}</div>
    </div>
  );
}
function StateBox({ icon, tone, title, text, action }: { icon: React.ReactNode; tone: 'red' | 'blue'; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
      <div className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${tone === 'red'
        ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] dark:text-[#f87171]'
        : 'bg-[rgba(59,130,246,0.12)] text-[#3b82f6]'}`}>{icon}</div>
      <p className="text-sm font-bold text-[#0f172a] dark:text-white mb-1">{title}</p>
      <p className="text-xs text-[#64748b] dark:text-[#94a3b8] mb-4 break-words">{text}</p>
      {action}
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-black text-[#0f172a] dark:text-white truncate">{value}</div>
      <div className="text-[10px] font-semibold text-[#64748b] dark:text-[#94a3b8]">{label}</div>
    </div>
  );
}
function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isActive
      ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
      : 'bg-[rgba(148,163,184,0.15)] text-[#64748b] dark:text-[#94a3b8]'}`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}
function TypeBadge({ type }: { type: BusinessType }) {
  const isIsp = type === 'isp';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isIsp
      ? 'bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
      : 'bg-[#ccfbf1] text-[#0f766e] dark:bg-[rgba(45,212,191,0.15)] dark:text-[#5eead4]'}`}>
      {isIsp ? <IconWifi className="w-3 h-3" /> : <IconDrop className="w-3 h-3" />}{isIsp ? 'ISP' : 'Water'}
    </span>
  );
}
function PresenceDot({ lastSeen }: { lastSeen: string | null }) {
  const p = presenceOf(lastSeen);
  const color = p === 'online' ? '#22c55e' : p === 'recent' ? '#f59e0b' : '#94a3b8';
  return (
    <span className="flex items-center gap-1.5 shrink-0 pt-0.5" title={presenceLabel(p)}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-bold text-[#64748b] dark:text-[#94a3b8]">{presenceLabel(p)}</span>
    </span>
  );
}
function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-xs font-semibold px-3 py-2.5 rounded-2xl mb-3 ${msg.ok
      ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
      : 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]'}`}>
      {msg.text}
    </div>
  );
}

/* ── Manager card: whole card is a button, no table ── */
function ManagerCard({ m, onOpen }: { m: ManagerRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Open details for ${m.business_name}`}
      className="w-full text-left rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 active:scale-[0.99] transition-transform">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-black text-[#0f172a] dark:text-white truncate">{m.business_name}</div>
          <div className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">@{m.username}</div>
        </div>
        <PresenceDot lastSeen={m.last_seen} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <TypeBadge type={normalizeBusinessType(m.business_type)} />
        <ActiveBadge isActive={m.is_active} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#f1f5f9] dark:border-white/5">
        <MiniStat label="Customers" value={safeInt(m.user_count).toLocaleString('en-US')} />
        <MiniStat label="Active / Expired" value={`${safeInt(m.active_count)}/${safeInt(m.expired_count)}`} />
        <MiniStat label="Revenue" value={formatRs(m.total_revenue)} />
      </div>
    </button>
  );
}

/* ── Detail sheet: bottom sheet on phone, side panel on desktop ── */
function ManagerSheet({ manager, onClose, onChanged, onDeleted }: {
  manager: ManagerRow; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const [mgr, setMgr] = useState<ManagerRow>(manager);
  const [draftType, setDraftType] = useState<BusinessType>(normalizeBusinessType(manager.business_type));
  const [confirmType, setConfirmType] = useState(false);
  const [typeBusy, setTypeBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  useEffect(() => {
    setMgr(manager); setDraftType(normalizeBusinessType(manager.business_type)); setMsg(null); setConfirmType(false);
  }, [manager]);

  const saveBusinessType = async () => {
    if (typeBusy || draftType === normalizeBusinessType(mgr.business_type)) return;
    setTypeBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc('admin_set_business_type', { p_username: mgr.username, p_type: draftType });
      if (error || (data && !data.success)) { setMsg({ ok: false, text: extractRpcError(error, data) }); return; }
      // No optimistic update — UI changes only after RPC success; close sheet so the refreshed list shows the new type.
      setConfirmType(false); onClose(); onChanged();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed.' });
    } finally { setTypeBusy(false); }
  };
  const toggleActive = async () => {
    if (toggleBusy) return;
    const next = !mgr.is_active;
    setToggleBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc('admin_set_manager_active', { p_username: mgr.username, p_active: next });
      if (error || (data && !data.success)) { setMsg({ ok: false, text: extractRpcError(error, data) }); return; }
      setMgr(prev => ({ ...prev, is_active: next })); onChanged();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Action failed.' });
    } finally { setToggleBusy(false); }
  };
  const detail = (label: string, value: string) => (
    <div className="py-2.5 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">{label}</div>
      <div className="text-sm font-semibold text-[#0f172a] dark:text-white break-words">{value}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Manager details for ${mgr.business_name}`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto md:w-[420px] max-h-[92dvh] md:max-h-none overflow-y-auto rounded-t-[2rem] md:rounded-l-[2rem] md:rounded-tr-none bg-white dark:bg-[#0f172a] border-t md:border-t-0 md:border-l border-[#e2e8f0] dark:border-white/10 p-5 pb-8">
        <div className="w-10 h-1 rounded-full bg-[#e2e8f0] dark:bg-white/15 mx-auto mb-4 md:hidden" />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#0f172a] dark:text-white truncate">{mgr.business_name}</h2>
            <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">@{mgr.username}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <TypeBadge type={normalizeBusinessType(mgr.business_type)} /><ActiveBadge isActive={mgr.is_active} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details"
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#475569] dark:text-[#94a3b8] flex items-center justify-center shrink-0"><IconClose /></button>
        </div>
        <Msg msg={msg} />
        <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 px-4 py-1 mb-4">
          {detail('Email', mgr.email || '—')}{detail('Phone', mgr.phone || '—')}{detail('Role', mgr.role || '—')}
          {detail('Joined', formatEnPK(mgr.joined_at))}{detail('Last login', formatEnPK(mgr.last_login))}
          {detail('Last seen', formatEnPK(mgr.last_seen))}{detail('Receipts', safeInt(mgr.receipt_count).toLocaleString('en-US'))}
          {detail('Balance', formatRs(mgr.total_balance))}{detail('Data updated', formatEnPK(mgr.data_updated_at))}
        </div>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">Business Type</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {BUSINESS_TYPES.map(t => {
            const sel = draftType === t, isIsp = t === 'isp';
            return (
              <button key={t} type="button" aria-pressed={sel} onClick={() => setDraftType(t)}
                className={`min-h-[44px] rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors ${sel
                  ? isIsp ? 'border-[#3b82f6] bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
                    : 'border-[#14b8a6] bg-[#ccfbf1] text-[#0f766e] dark:bg-[rgba(45,212,191,0.15)] dark:text-[#5eead4]'
                  : 'border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
                {isIsp ? <IconWifi className="w-4 h-4" /> : <IconDrop className="w-4 h-4" />}{isIsp ? 'ISP' : 'Water'}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[#94a3b8] mb-2">{BUSINESS_TYPE_LABELS[draftType]}</p>
        <button type="button" onClick={() => setConfirmType(true)}
          disabled={draftType === normalizeBusinessType(mgr.business_type) || typeBusy}
          className="w-full min-h-[44px] rounded-2xl bg-[#1d4ed8] text-white text-sm font-bold disabled:opacity-40 mb-4">
          {typeBusy ? 'Saving…' : 'Save Business Type'}
        </button>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">Actions</h3>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={toggleActive} disabled={toggleBusy}
            aria-label={mgr.is_active ? `Deactivate ${mgr.username}` : `Activate ${mgr.username}`}
            className="w-full min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white flex items-center justify-center gap-2 disabled:opacity-50">
            <IconPower />{toggleBusy ? 'Working…' : mgr.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button" onClick={() => setShowReset(true)} aria-label={`Reset password for ${mgr.username}`}
            className="w-full min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white flex items-center justify-center gap-2">
            <IconKey />Reset Password
          </button>
          <button type="button" onClick={() => setShowDelete(true)} aria-label={`Delete ${mgr.username}`}
            className="w-full min-h-[44px] rounded-2xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-[#b91c1c] dark:text-[#f87171] text-sm font-bold flex items-center justify-center gap-2">
            <IconTrash />Delete Manager
          </button>
        </div>
      </div>
      {confirmType && (
        <Modal onClose={() => !typeBusy && setConfirmType(false)} title="Change business type?">
          <p className="text-sm text-[#475569] dark:text-[#cbd5e1] mb-5">
            Changing this manager's business type will change their menu and tabs. Continue?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmType(false)} disabled={typeBusy}
              className="flex-1 min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-50">Cancel</button>
            <button type="button" onClick={saveBusinessType} disabled={typeBusy}
              className="flex-1 min-h-[44px] rounded-2xl bg-[#1d4ed8] text-white text-sm font-bold disabled:opacity-50">
              {typeBusy ? 'Saving…' : 'Yes, change'}
            </button>
          </div>
        </Modal>
      )}
      {showReset && <ResetModal username={mgr.username} onClose={() => setShowReset(false)} />}
      {showDelete && <DeleteModal username={mgr.username} onClose={() => setShowDelete(false)} onDone={() => { setShowDelete(false); onDeleted(); }} />}
    </div>
  );
}

/* ── Reset password modal ── */
function ResetModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = pw.trim().length >= 6;
  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true); setMsg(null);
    const sessionErr = await checkAdminSession();
    if (sessionErr) { setMsg({ ok: false, text: sessionErr }); setBusy(false); return; }
    try {
      const { data, error } = await supabase.rpc('admin_reset_manager_password', { p_username: username, p_new_password: pw.trim() });
      if (error || (data && !data.success)) { setMsg({ ok: false, text: extractRpcError(error, data) }); return; }
      setMsg({ ok: true, text: 'Password updated successfully.' });
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Reset failed.' });
    } finally { setBusy(false); }
  };
  return (
    <Modal onClose={() => !busy && onClose()} title="Reset Password">
      <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold mb-3">@{username}</p>
      <Msg msg={msg} />
      <div className="relative mb-2">
        <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="New password (min 6 characters)"
          aria-label="New password" autoComplete="new-password"
          className="w-full min-h-[44px] pl-4 pr-12 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]" />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#64748b] dark:text-[#94a3b8]">
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
      {!valid && pw.length > 0 && <p className="text-[11px] text-[#b91c1c] dark:text-[#f87171] font-semibold mb-2">Minimum 6 characters.</p>}
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onClose} disabled={busy}
          className="flex-1 min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-50">Cancel</button>
        <button type="button" onClick={submit} disabled={busy || !valid} aria-label={`Confirm password reset for ${username}`}
          className="flex-1 min-h-[44px] rounded-2xl bg-[#1d4ed8] text-white text-sm font-bold disabled:opacity-40">
          {busy ? 'Saving…' : 'Reset Password'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Delete modal: type-username-to-confirm ── */
function DeleteModal({ username, onClose, onDone }: { username: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canDelete = text === username && !busy;
  const submit = async () => {
    if (!canDelete) return;
    setBusy(true); setMsg(null);
    const sessionErr = await checkAdminSession();
    if (sessionErr) { setMsg(sessionErr); setBusy(false); return; }
    try {
      const { data, error } = await supabase.rpc('admin_delete_manager', { p_username: username });
      if (error || !data?.success) { setMsg(extractRpcError(error, data) || 'Delete failed — manager still exists.'); return; }
      onDone(); // modal stays open + nothing removed from UI unless server confirms
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Delete failed — manager still exists.');
    } finally { setBusy(false); }
  };
  return (
    <Modal onClose={() => !busy && onClose()} title="Delete Manager">
      <div className="flex items-center gap-2 text-xs font-bold text-[#b91c1c] dark:text-[#f87171] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-2xl px-3 py-2.5 mb-3">
        <IconAlert />This permanently removes the manager and all their data.
      </div>
      <p className="text-sm text-[#475569] dark:text-[#cbd5e1] mb-2">
        Type <span className="font-black text-[#0f172a] dark:text-white">{username}</span> to confirm:
      </p>
      <input type="text" value={text} onChange={e => { setText(e.target.value); setMsg(null); }} placeholder={username}
        aria-label="Type username to confirm deletion" autoComplete="off"
        className="w-full min-h-[44px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#ef4444] mb-3" />
      {msg && (
        <div className="text-xs font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">{msg}</div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy}
          className="flex-1 min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-50">Cancel</button>
        <button type="button" onClick={submit} disabled={!canDelete} aria-label={`Confirm deletion of ${username}`}
          className="flex-1 min-h-[44px] rounded-2xl bg-[#dc2626] text-white text-sm font-bold disabled:opacity-40">
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Shared modal shell: bottom sheet on phone, centered on desktop ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#0f172a] rounded-t-[2rem] sm:rounded-[2rem] border border-[#e2e8f0] dark:border-white/10 p-5 pb-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black text-[#0f172a] dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#475569] dark:text-[#94a3b8] flex items-center justify-center"><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Loading skeletons ── */
function SkeletonList() {
  return (
    <div className="flex flex-col gap-3 pb-8" aria-label="Loading managers">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 animate-pulse">
          <div className="h-5 w-2/3 rounded-lg bg-[#e2e8f0] dark:bg-white/10 mb-2" />
          <div className="h-3 w-1/3 rounded-lg bg-[#e2e8f0] dark:bg-white/10 mb-3" />
          <div className="flex gap-2 mb-3">
            <div className="h-6 w-16 rounded-full bg-[#e2e8f0] dark:bg-white/10" />
            <div className="h-6 w-20 rounded-full bg-[#e2e8f0] dark:bg-white/10" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#f1f5f9] dark:border-white/5">
            <div className="h-8 rounded-lg bg-[#f1f5f9] dark:bg-white/5" />
            <div className="h-8 rounded-lg bg-[#f1f5f9] dark:bg-white/5" />
            <div className="h-8 rounded-lg bg-[#f1f5f9] dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Inline SVG icons only (no emoji, no icon fonts, no images) ── */
function Ic({ children, className = 'w-5 h-5' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
  );
}
const IconSearch = () => (<Ic><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Ic>);
const IconRefresh = ({ spin }: { spin?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${spin ? 'animate-spin' : ''}`} aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
);
const IconClose = () => (<Ic><path d="M18 6 6 18M6 6l12 12" /></Ic>);
const IconChevronDown = () => (<Ic className="w-4 h-4"><path d="m6 9 6 6 6-6" /></Ic>);
const IconUsers = () => (<Ic><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Ic>);
const IconWifi = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <Ic className={className}><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M2 9.5a15 15 0 0 1 20 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></Ic>);
const IconDrop = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <Ic className={className}><path d="M12 2.7 6.7 8.6a7 7 0 1 0 10.6 0Z" /></Ic>);
const IconKey = () => (<Ic><circle cx="7.5" cy="15.5" r="4.5" /><path d="m11 12 9-9" /><path d="m15 5 3 3" /></Ic>);
const IconEye = () => (<Ic><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Ic>);
const IconEyeOff = () => (<Ic><path d="M9.9 4.24A9.5 9.5 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.16 3.19M6.61 6.61A16.8 16.8 0 0 0 2 12s3.5 8 10 8a9.9 9.9 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></Ic>);
const IconTrash = () => (<Ic><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></Ic>);
const IconPower = () => (<Ic><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><path d="M12 2v10" /></Ic>);
const IconAlert = () => (<Ic><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></Ic>);
