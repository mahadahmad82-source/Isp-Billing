import React, { useState, useMemo } from 'react';
import { OutageLog, OutageSeverity } from '../types';

interface Props {
  outageLogs: OutageLog[];
  currentUser: string;
  totalUsers: number;
  onAdd: (log: OutageLog) => void;
  onUpdate: (id: string, updates: Partial<OutageLog>) => void;
  onDelete: (id: string) => void;
}

const SEVERITY: Record<OutageSeverity, { label: string; emoji: string; color: string; bg: string }> = {
  degraded: { label: 'Degraded',     emoji: '🟡', color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30' },
  partial:  { label: 'Partial Down', emoji: '🟠', color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  full:     { label: 'Full Outage',  emoji: '🔴', color: 'text-red-400',    bg: 'bg-red-500/15 border-red-500/30' },
};

const genId = () => `OUT-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
const nowLocal = () => new Date().toISOString().slice(0,16);

const OutageTracker: React.FC<Props> = ({ outageLogs, currentUser, totalUsers, onAdd, onUpdate, onDelete }) => {
  const [view, setView] = useState<'list' | 'add' | 'detail'>('list');
  const [detail, setDetail] = useState<OutageLog | null>(null);
  const [form, setForm] = useState({ title: '', description: '', severity: 'full' as OutageSeverity, areasAffected: '', cause: '', affectedCount: '', startTime: nowLocal() });
  const [resolveNote, setResolveNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string|null>(null);
  const [toast, setToast] = useState<string|null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const ongoing = useMemo(() => outageLogs.filter(o => !o.endTime), [outageLogs]);
  const resolved = useMemo(() => outageLogs.filter(o => !!o.endTime).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [outageLogs]);

  const duration = (start: string, end?: string) => {
    const ms = new Date(end || new Date()).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleAdd = () => {
    if (!form.title.trim()) { showToast('Title zaroori hai!'); return; }
    const log: OutageLog = {
      id: genId(),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      severity: form.severity,
      areasAffected: form.areasAffected.split(',').map(a => a.trim()).filter(Boolean),
      cause: form.cause.trim() || undefined,
      affectedCount: form.affectedCount ? Number(form.affectedCount) : undefined,
      startTime: new Date(form.startTime).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
    };
    onAdd(log);
    setForm({ title:'', description:'', severity:'full', areasAffected:'', cause:'', affectedCount:'', startTime: nowLocal() });
    showToast('Outage logged!');
    setView('list');
  };

  const handleResolve = (log: OutageLog) => {
    onUpdate(log.id, { endTime: new Date().toISOString(), resolvedBy: currentUser, cause: resolveNote || log.cause });
    showToast('Outage resolved! ✅');
    setResolveNote('');
    setDetail(null); setView('list');
  };

  // ── ADD FORM ───────────────────────────────────────────────
  if (view === 'add') return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-6">Log New Outage</h2>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Title *</label>
          <input value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))}
            placeholder="e.g. Main Fiber Cut — Gulshan Area"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500"/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Severity</label>
            <select value={form.severity} onChange={e => setForm(p=>({...p,severity:e.target.value as OutageSeverity}))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-red-500">
              {Object.entries(SEVERITY).map(([k,v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Users Affected</label>
            <input type="number" value={form.affectedCount} onChange={e => setForm(p=>({...p,affectedCount:e.target.value}))}
              placeholder={`Max ${totalUsers}`}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-red-500"/>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Areas Affected (comma separated)</label>
          <input value={form.areasAffected} onChange={e => setForm(p=>({...p,areasAffected:e.target.value}))}
            placeholder="Gulshan, DHA, Clifton"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500"/>
        </div>

        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Start Time</label>
          <input type="datetime-local" value={form.startTime} onChange={e => setForm(p=>({...p,startTime:e.target.value}))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500"/>
        </div>

        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Cause / Description</label>
          <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} rows={3}
            placeholder="Kya hua tha..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 resize-none"/>
        </div>

        <button onClick={handleAdd}
          className="w-full py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">
          🔴 Log Outage
        </button>
      </div>
    </div>
  );

  // ── DETAIL VIEW ────────────────────────────────────────────
  if (view === 'detail' && detail) {
    const cfg = SEVERITY[detail.severity];
    const isOngoing = !detail.endTime;
    return (
      <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">
        <button onClick={() => { setView('list'); setDetail(null); }}
          className="flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        {isOngoing && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-2 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-red-400 font-black text-xs uppercase tracking-wider">Live Outage — {duration(detail.startTime)} ago</span>
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-4">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-xl font-black flex-1 mr-3">{detail.title}</h2>
            <span className={`px-3 py-1.5 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>{cfg.emoji} {cfg.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-xs">Start Time</p>
              <p className="font-semibold mt-1 text-xs">{new Date(detail.startTime).toLocaleString('en-PK')}</p>
            </div>
            {detail.endTime ? (
              <div className="bg-emerald-500/10 rounded-xl p-3">
                <p className="text-emerald-400 text-xs">Resolved At</p>
                <p className="font-semibold mt-1 text-xs">{new Date(detail.endTime).toLocaleString('en-PK')}</p>
              </div>
            ) : (
              <div className="bg-red-500/10 rounded-xl p-3">
                <p className="text-red-400 text-xs">Duration</p>
                <p className="font-black mt-1 text-red-400">{duration(detail.startTime)}</p>
              </div>
            )}
            {detail.affectedCount && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-xs">Users Affected</p>
                <p className="font-black mt-1 text-orange-400">{detail.affectedCount}</p>
              </div>
            )}
            {detail.resolvedBy && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-xs">Resolved By</p>
                <p className="font-semibold mt-1">{detail.resolvedBy}</p>
              </div>
            )}
            {detail.areasAffected.length > 0 && (
              <div className="col-span-2 bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-xs mb-2">Areas Affected</p>
                <div className="flex flex-wrap gap-2">
                  {detail.areasAffected.map(a => (
                    <span key={a} className="px-2 py-1 bg-orange-500/15 border border-orange-500/20 text-orange-400 rounded-lg text-xs font-bold">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {detail.description && <p className="mt-3 text-sm text-white/60 bg-white/5 rounded-xl p-3">{detail.description}</p>}
        </div>

        {isOngoing && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Resolve Outage</p>
            <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} rows={2}
              placeholder="Resolution details / cause..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none mb-3"/>
            <button onClick={() => handleResolve(detail)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">
              ✅ Mark Resolved
            </button>
          </div>
        )}

        <button onClick={() => setConfirmDelete(detail.id)}
          className="w-full py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl font-bold text-sm">
          🗑️ Delete Log
        </button>

        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}/>
            <div className="relative z-10 bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-sm text-center">
              <p className="text-lg font-black mb-4">Delete Outage Log?</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 bg-white/5 rounded-2xl font-bold text-sm">Cancel</button>
                <button onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); setView('list'); }} className="flex-1 py-3 bg-red-600 rounded-2xl font-bold text-sm">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MAIN LIST ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black">Outage Tracker</h1>
          <p className="text-white/40 text-xs mt-0.5">Network downtime ka record</p>
        </div>
        <button onClick={() => setView('add')}
          className="bg-red-600 hover:bg-red-500 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">
          + Log
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className={`rounded-2xl p-4 text-center border ${ongoing.length > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
          <p className={`text-2xl font-black ${ongoing.length > 0 ? 'text-red-400' : 'text-white'}`}>{ongoing.length}</p>
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-1">Ongoing</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black">{outageLogs.length}</p>
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-1">Total Logged</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-400">{resolved.length}</p>
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-1">Resolved</p>
        </div>
      </div>

      {/* Ongoing outages */}
      {ongoing.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-black text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
            Live Outages
          </p>
          {ongoing.map(o => {
            const cfg = SEVERITY[o.severity];
            return (
              <button key={o.id} onClick={() => { setDetail(o); setView('detail'); }}
                className="w-full bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-left mb-3 hover:bg-red-500/15 transition-all active:scale-[0.98]">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-black text-base flex-1 mr-2">{o.title}</p>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.color}`}>{cfg.emoji} {cfg.label}</span>
                </div>
                <div className="flex gap-3 text-xs text-white/40 flex-wrap">
                  <span>⏱ {duration(o.startTime)}</span>
                  {o.affectedCount && <span>👥 {o.affectedCount} users</span>}
                  {o.areasAffected.length > 0 && <span>📍 {o.areasAffected.slice(0,2).join(', ')}{o.areasAffected.length > 2 ? '...' : ''}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div>
          <p className="text-xs font-black text-white/40 uppercase tracking-wider mb-3">Resolved History</p>
          <div className="space-y-3">
            {resolved.map(o => {
              const cfg = SEVERITY[o.severity];
              return (
                <button key={o.id} onClick={() => { setDetail(o); setView('detail'); }}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left hover:bg-white/8 transition-all active:scale-[0.98]">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-bold text-sm flex-1 mr-2 text-white/80">{o.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.color}`}>{cfg.emoji}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-white/30 flex-wrap">
                    <span>✅ {duration(o.startTime, o.endTime)}</span>
                    <span>• {new Date(o.startTime).toLocaleDateString('en-PK', {day:'2-digit',month:'short'})}</span>
                    {o.affectedCount && <span>• {o.affectedCount} users</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {outageLogs.length === 0 && (
        <div className="text-center py-20 text-white/30">
          <div className="text-5xl mb-4">🌐</div>
          <p className="font-bold text-lg">Koi outage nahi</p>
          <p className="text-sm mt-1">Alhamdulillah sab theek hai!</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-800 border border-white/20 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold">{toast}</div>
        </div>
      )}
    </div>
  );
};

export default OutageTracker;
