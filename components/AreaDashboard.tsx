import React, { useMemo, useState } from 'react';
import { useIsDark } from '../hooks/useIsDark';
import { UserRecord, Receipt, AppSettings } from '../types';

interface Props {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings & { availablePlans?: { name: string; price: number }[]; monthlyFee?: number };
  onUpdateAreas?: (areas: string[]) => void;
  onAssignUserArea?: (userId: string, area: string) => void;
}

interface AreaStats {
  area: string;
  total: number;
  active: number;
  expired: number;
  suspended: number;
  revenue: number;
  pending: number;
  plans: Record<string, number>;
}

const AreaDashboard: React.FC<Props> = ({ users, receipts, settings, onUpdateAreas, onAssignUserArea }) => {
  const isDark = useIsDark();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'total' | 'revenue' | 'expired'>('total');
  const [showManageAreas, setShowManageAreas] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const definedAreas = settings.areas || [];

  const handleAddArea = () => {
    const name = newAreaName.trim();
    if (!name) return;
    if (definedAreas.some(a => a.toLowerCase() === name.toLowerCase())) {
      showToast('Yeh area pehle se maujood hai!');
      return;
    }
    onUpdateAreas?.([...definedAreas, name]);
    setNewAreaName('');
    showToast(`"${name}" area add ho gaya!`);
  };

  const handleRemoveArea = (name: string) => {
    onUpdateAreas?.(definedAreas.filter(a => a !== name));
    showToast(`"${name}" area list se hata diya (customers ka data safe hai).`);
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const currentMonth = `${today.toLocaleString('en',{month:'long'})} ${today.getFullYear()}`;

  const getPlanPrice = (user: UserRecord) => {
    if (settings.availablePlans) {
      const p = settings.availablePlans.find(p => p.name.toLowerCase() === (user.plan||'').toLowerCase());
      if (p) return p.price;
    }
    return settings.monthlyFee || 0;
  };

  const isActive = (u: UserRecord) => {
    if (u.status === 'deleted' || u.status === 'pending') return false;
    if (u.activatedMonths?.includes(currentMonth)) return true;
    if (!u.expiryDate) return false;
    const exp = new Date(u.expiryDate); exp.setHours(0,0,0,0);
    return exp >= today;
  };

  const areaStats = useMemo((): AreaStats[] => {
    const map: Record<string, AreaStats> = {};
    const noArea = 'No Area';

    users.filter(u => u.status !== 'deleted').forEach(u => {
      const area = (u.area || noArea).trim() || noArea;
      if (!map[area]) map[area] = { area, total:0, active:0, expired:0, suspended:0, revenue:0, pending:0, plans:{} };
      const s = map[area];
      s.total++;
      if ((u as any).isSuspended) { s.suspended++; }
      else if (isActive(u)) { s.active++; }
      else { s.expired++; }
      if (u.plan) s.plans[u.plan] = (s.plans[u.plan] || 0) + 1;
    });

    // Revenue from receipts this month
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    receipts.forEach(r => {
      if (r.status !== 'Success' && r.status !== 'success') return;
      const paidAt = new Date(r.paidAt || r.createdAt || '');
      if (paidAt < thisMonthStart) return;
      const user = users.find(u => u.id === r.userId);
      if (!user) return;
      const area = (user.area || noArea).trim() || noArea;
      if (map[area]) map[area].revenue += r.paidAmount || 0;
    });

    // Pending = expired users * their plan price
    Object.values(map).forEach(s => {
      const areaUsers = users.filter(u => (u.area||noArea).trim() === s.area && u.status !== 'deleted' && !isActive(u) && !(u as any).isSuspended);
      s.pending = areaUsers.reduce((sum, u) => sum + getPlanPrice(u), 0);
    });

    return Object.values(map).sort((a, b) => b[sortBy] - a[sortBy]);
  }, [users, receipts, settings, sortBy]);

  const filtered = useMemo(() => {
    if (!search.trim()) return areaStats;
    const q = search.toLowerCase();
    return areaStats.filter(a => a.area.toLowerCase().includes(q));
  }, [areaStats, search]);

  const totals = useMemo(() => ({
    total: areaStats.reduce((s,a) => s+a.total, 0),
    active: areaStats.reduce((s,a) => s+a.active, 0),
    expired: areaStats.reduce((s,a) => s+a.expired, 0),
    revenue: areaStats.reduce((s,a) => s+a.revenue, 0),
    pending: areaStats.reduce((s,a) => s+a.pending, 0),
  }), [areaStats]);

  const selectedAreaData = selectedArea ? areaStats.find(a => a.area === selectedArea) : null;
  const selectedAreaUsers = selectedArea ? users.filter(u => (u.area||'No Area').trim() === selectedArea && u.status !== 'deleted') : [];

  // ── AREA DETAIL ────────────────────────────────────────────
  if (selectedArea && selectedAreaData) return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      <button onClick={() => setSelectedArea(null)} className={`flex items-center gap-2 ${isDark ? 'text-white/50' : 'text-slate-500'} hover:${isDark ? 'text-white' : 'text-slate-900'} mb-6 text-sm`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-1">📍 {selectedArea}</h2>
      <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mb-5`}>{selectedAreaData.total} customers</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label:'Active',    val: selectedAreaData.active,    color:'text-emerald-400', bg:'bg-emerald-500/10 border-emerald-500/20' },
          { label:'Expired',   val: selectedAreaData.expired,   color:'text-red-400',     bg:'bg-red-500/10 border-red-500/20' },
          { label:'Revenue',   val: `Rs. ${selectedAreaData.revenue.toLocaleString()}`,   color:'text-blue-400',  bg:'bg-blue-500/10 border-blue-500/20' },
          { label:'Pending',   val: `Rs. ${selectedAreaData.pending.toLocaleString()}`,   color:'text-orange-400',bg:'bg-orange-500/10 border-orange-500/20' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 border ${s.bg}`}>
            <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Plans breakdown */}
      {Object.keys(selectedAreaData.plans).length > 0 && (
        <div className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl p-4 mb-5`}>
          <p className={`text-xs font-black ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider mb-3`}>Plans Breakdown</p>
          {Object.entries(selectedAreaData.plans).sort((a,b)=>b[1]-a[1]).map(([plan, count]) => (
            <div key={plan} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm font-semibold">{plan}</span>
              <div className="flex items-center gap-3">
                <div className={`w-24 ${isDark ? 'bg-white/10' : 'bg-slate-100'} rounded-full h-1.5`}>
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{width:`${(count/selectedAreaData.total)*100}%`}}/>
                </div>
                <span className="text-sm font-black text-indigo-400 w-6 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer list */}
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-black ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>Customers</p>
        <p className={`text-[10px] ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Area badalne ke liye dropdown use karein</p>
      </div>
      <div className="space-y-2">
        {selectedAreaUsers.map(u => {
          const active = isActive(u);
          return (
            <div key={u.id} className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-4 py-3 flex items-center justify-between gap-2`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{u.name}</p>
                <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs truncate`}>{u.phone} • {u.plan}</p>
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-black border shrink-0 ${
                (u as any).isSuspended ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' :
                active ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                'bg-red-500/15 border-red-500/30 text-red-400'
              }`}>
                {(u as any).isSuspended ? 'Suspended' : active ? 'Active' : 'Expired'}
              </span>
              {onAssignUserArea && (
                <select
                  value={u.area || ''}
                  onChange={e => { onAssignUserArea(u.id, e.target.value); showToast(`${u.name} → ${e.target.value || 'No Area'}`); }}
                  className={`shrink-0 text-[10px] font-bold ${isDark ? 'bg-white/10 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'} border rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500`}
                >
                  <option value="">No Area</option>
                  {Array.from(new Set([...definedAreas, ...users.map(x => x.area).filter(Boolean) as string[], selectedArea as string])).filter(Boolean).map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold">{toast}</div>
        </div>
      )}
    </div>
  );

  // ── MAIN VIEW ──────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black">Area Dashboard</h1>
          <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>Har area ka alag breakdown</p>
        </div>
        {onUpdateAreas && (
          <button onClick={() => setShowManageAreas(v => !v)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
            Areas
          </button>
        )}
      </div>

      {/* Manage Areas panel */}
      {showManageAreas && onUpdateAreas && (
        <div className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl p-4 mb-5`}>
          <p className={`text-xs font-black ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider mb-3`}>Naya Area Banao</p>
          <div className="flex gap-2 mb-4">
            <input value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddArea(); }}
              placeholder="e.g. Gulshan Block 5, DHA Phase 2..."
              className={`flex-1 ${isDark ? 'bg-white/5' : 'bg-slate-50'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'}`} />
            <button onClick={handleAddArea} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              Add
            </button>
          </div>
          {definedAreas.length === 0 ? (
            <p className={`text-xs ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Abhi koi area define nahi. Upar naam likh kar "Add" dabayein — phir Customer Directory ke form mein yeh area select ho sakega.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {definedAreas.map(a => (
                <span key={a} className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'bg-white/10' : 'bg-slate-100'} px-3 py-1.5 rounded-full`}>
                  📍 {a}
                  <button onClick={() => handleRemoveArea(a)} className="text-rose-400 hover:text-rose-300 font-black ml-1">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overall totals */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="col-span-2 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <p className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>This Month Revenue</p>
            <p className="text-2xl font-black text-indigo-300">Rs. {totals.revenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>Pending Recovery</p>
            <p className="text-xl font-black text-orange-400">Rs. {totals.pending.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-400">{totals.active}</p>
          <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>Total Active</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-red-400">{totals.expired}</p>
          <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>Total Expired</p>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search area..."
          className={`flex-1 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'}`}/>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-xs focus:outline-none`}>
          <option value="total">By Total</option>
          <option value="revenue">By Revenue</option>
          <option value="expired">By Expired</option>
        </select>
      </div>

      {/* Area cards */}
      {filtered.length === 0 ? (
        <div className={`text-center py-20 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          <div className="text-5xl mb-4">📍</div>
          <p className="font-bold">Koi area nahi mila</p>
          <p className="text-sm mt-1">Customers mein area set karo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(area => {
            const activeRate = area.total > 0 ? Math.round((area.active / area.total) * 100) : 0;
            return (
              <button key={area.area} onClick={() => setSelectedArea(area.area)}
                className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} hover:${isDark ? 'bg-white/8' : 'bg-slate-50'} rounded-2xl p-4 text-left transition-all active:scale-[0.98]`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-base">📍 {area.area}</p>
                    <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>{area.total} customers</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-400 font-black text-sm">Rs. {area.revenue.toLocaleString()}</p>
                    <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-xs`}>this month</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-2">
                  <div className={`flex justify-between text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} mb-1`}>
                    <span>{area.active} active</span>
                    <span>{activeRate}%</span>
                  </div>
                  <div className={`w-full ${isDark ? 'bg-white/10' : 'bg-slate-100'} rounded-full h-2`}>
                    <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                      style={{ width: `${activeRate}%` }}/>
                  </div>
                </div>

                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400 font-bold">✅ {area.active}</span>
                  <span className="text-red-400 font-bold">❌ {area.expired}</span>
                  {area.suspended > 0 && <span className="text-orange-400 font-bold">⏸ {area.suspended}</span>}
                  {area.pending > 0 && <span className="text-orange-300 font-bold ml-auto">Pending: Rs. {area.pending.toLocaleString()}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold">{toast}</div>
        </div>
      )}
    </div>
  );
};

export default AreaDashboard;
