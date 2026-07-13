import React, { useState, useMemo } from 'react';
import { useIsDark } from '../hooks/useIsDark';
import { ClipboardIcon } from './icons/UiIcons';
import { SuspensionLog, SuspensionReason, UserRecord } from '../types';

interface Props {
  suspensionLogs: SuspensionLog[];
  users: UserRecord[];
  currentUser: string;
  onAdd: (log: SuspensionLog) => void;
  onUpdateUserStatus: (userId: string, status: 'active' | 'suspended') => void;
}

const REASON_LABELS: Record<SuspensionReason, string> = {
  non_payment: 'Non-Payment',
  customer_request: 'Customer Request',
  abuse: 'Abuse / Misuse',
  maintenance: 'Maintenance',
  other: 'Other',
};

const genId = () => `SUS-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;

const SuspensionManager: React.FC<Props> = ({ suspensionLogs, users, currentUser, onAdd, onUpdateUserStatus }) => {
  const isDark = useIsDark();
  const [view, setView] = useState<'list' | 'action'>('list');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [actionType, setActionType] = useState<'suspended' | 'restored'>('suspended');
  const [reason, setReason] = useState<SuspensionReason>('non_payment');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<'all' | 'suspended' | 'restored'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const suspendedUsers = useMemo(() =>
    users.filter(u => u.status === 'suspended' || (u as any).isSuspended),
  [users]);

  const filteredLogs = useMemo(() => {
    let list = [...suspensionLogs];
    if (filterAction !== 'all') list = list.filter(l => l.action === filterAction);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.userName.toLowerCase().includes(q) || (l.userPhone||'').includes(q));
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [suspensionLogs, filterAction, search]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return users
      .filter(u => u.status !== 'deleted')
      .filter(u => !q || u.name.toLowerCase().includes(q) || (u.phone||'').includes(q))
      .slice(0, 20);
  }, [users, userSearch]);

  const handleAction = () => {
    if (!selectedUser) return;
    const log: SuspensionLog = {
      id: genId(),
      userId: selectedUser.id,
      userName: selectedUser.name,
      userPhone: selectedUser.phone,
      action: actionType,
      reason,
      note: note.trim() || undefined,
      performedBy: currentUser,
      createdAt: new Date().toISOString(),
    };
    onAdd(log);
    onUpdateUserStatus(selectedUser.id, actionType === 'suspended' ? 'suspended' : 'active');
    showToast(`${selectedUser.name} — ${actionType === 'suspended' ? 'Suspended' : 'Restored'}`);
    setSelectedUser(null); setNote(''); setView('list');
  };

  // ── ACTION FORM ────────────────────────────────────────────
  if (view === 'action') return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      <button onClick={() => { setView('list'); setSelectedUser(null); }}
        className={`flex items-center gap-2 ${isDark ? 'text-white/50' : 'text-slate-500'} hover:${isDark ? 'text-white' : 'text-slate-900'} mb-6 text-sm`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-6">Suspend / Restore Customer</h2>

      {/* Action toggle */}
      <div className={`flex gap-2 mb-5 p-1 ${isDark ? 'bg-white/5' : 'bg-white'} rounded-2xl`}>
        <button onClick={() => setActionType('suspended')}
          className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${actionType === 'suspended' ? 'bg-red-600 text-white' : 'text-white/40'}`}>
          Suspend
        </button>
        <button onClick={() => setActionType('restored')}
          className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${actionType === 'restored' ? 'bg-emerald-600 text-white' : 'text-white/40'}`}>
          Restore
        </button>
      </div>

      {/* Customer search */}
      <div className="mb-4">
        <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Select Customer</label>
        <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
          placeholder="Search name or phone..."
          className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 mb-2 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'}`}/>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {filteredUsers.map(u => (
            <button key={u.id} onClick={() => setSelectedUser(u)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                selectedUser?.id === u.id
                  ? 'bg-indigo-600/30 border-indigo-500 text-white'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}>
              <span className="font-bold">{u.name}</span>
              <span className={`${isDark ? 'text-white/40' : 'text-slate-500'} ml-2 text-xs`}>{u.phone}</span>
              <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${
                (u as any).isSuspended ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>{(u as any).isSuspended ? 'Suspended' : u.status}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reason */}
      <div className="mb-4">
        <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Reason</label>
        <select value={reason} onChange={e => setReason(e.target.value as SuspensionReason)}
          className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}>
          {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Note */}
      <div className="mb-5">
        <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Note (optional)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Koi note..."
          className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 resize-none`}/>
      </div>

      <button onClick={handleAction} disabled={!selectedUser}
        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 ${
          !selectedUser ? 'bg-white/10 text-white/30 cursor-not-allowed' :
          actionType === 'suspended' ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
        }`}>
        {actionType === 'suspended' ? 'Suspend Customer' : 'Restore Customer'}
      </button>
    </div>
  );

  // ── MAIN LIST ──────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black">Suspension Log</h1>
          <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>Connection suspend/restore history</p>
        </div>
        <button onClick={() => setView('action')}
          className="bg-red-600 hover:bg-red-500 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">
          + Action
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-red-400">{suspendedUsers.length}</p>
          <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>Suspended</p>
        </div>
        <div className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl p-4 text-center`}>
          <p className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{suspensionLogs.filter(l => l.action === 'suspended').length}</p>
          <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>Total Suspended</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-400">{suspensionLogs.filter(l => l.action === 'restored').length}</p>
          <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>Restored</p>
        </div>
      </div>

      {/* Currently Suspended */}
      {suspendedUsers.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-5">
          <p className="text-red-400 font-black text-xs uppercase tracking-wider mb-3">Currently Suspended ({suspendedUsers.length})</p>
          <div className="space-y-2">
            {suspendedUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm">{u.name}</span>
                  <span className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs ml-2`}>{u.phone}</span>
                </div>
                <button onClick={() => {
                  setSelectedUser(u); setActionType('restored'); setView('action');
                }} className="text-xs px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-xl font-bold">
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search naam, phone..."
          className={`flex-1 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'}`}/>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value as any)}
          className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-xs focus:outline-none`}>
          <option value="all">All</option>
          <option value="suspended">Suspended</option>
          <option value="restored">Restored</option>
        </select>
      </div>

      {/* Log list */}
      {filteredLogs.length === 0 ? (
        <div className={`text-center py-20 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          <div className="flex justify-center mb-4"><ClipboardIcon className="w-12 h-12" /></div>
          <p className="font-bold">No records found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map(log => (
            <div key={log.id} className={`bg-white/5 border rounded-2xl p-4 ${log.action === 'suspended' ? 'border-red-500/20' : 'border-emerald-500/20'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-black text-base">{log.userName}</p>
                  <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>{log.userPhone}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                  log.action === 'suspended' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                }`}>{log.action === 'suspended' ? 'Suspended' : 'Restored'}</span>
              </div>
              <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-white/40' : 'text-slate-500'} flex-wrap`}>
                <span>{REASON_LABELS[log.reason]}</span>
                <span>• By: {log.performedBy}</span>
                <span>• {new Date(log.createdAt).toLocaleDateString('en-PK', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              {log.note && <p className={`mt-2 text-xs ${isDark ? 'text-white/50' : 'text-slate-500'} italic ${isDark ? 'bg-white/5' : 'bg-white'} rounded-lg px-3 py-2`}>"{log.note}"</p>}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className={`${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-white/20' : 'border-slate-200'} ${isDark ? 'text-white' : 'text-slate-900'} px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold`}>{toast}</div>
        </div>
      )}
    </div>
  );
};

export default SuspensionManager;
