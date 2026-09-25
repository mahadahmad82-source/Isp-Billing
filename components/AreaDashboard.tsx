import React, { useMemo, useState } from 'react';
import { useIsDark } from '../hooks/useIsDark';
import { UserRecord, Receipt, AppSettings } from '../types';
import {
  AreaStats,
  buildAreaStats,
  currentMonthLabel,
  isUserActive,
  isUserSuspended,
  userAreaLabel,
  yearOptions,
} from '../utils/areaDashboardStats';

interface Props {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings & { availablePlans?: { name: string; price: number }[]; monthlyFee?: number };
  onUpdateAreas?: (areas: string[]) => void;
  onAssignUserArea?: (userId: string, area: string) => void;
  onBulkAssignUserArea?: (userIds: string[], area: string) => void;
}

type AreaSort = 'total' | 'revenue' | 'expired';
type UserSort = 'name' | 'username' | 'address' | 'status' | 'plan';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function RecoveryRing({ percent, isDark, gradId }: { percent: number; isDark: boolean; gradId: string }) {
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black">
        {clamped}%
      </span>
    </div>
  );
}

function statusLabel(user: UserRecord, today: Date, monthLabel: string): 'Suspended' | 'Active' | 'Expired' {
  if (isUserSuspended(user)) return 'Suspended';
  if (isUserActive(user, today, monthLabel)) return 'Active';
  return 'Expired';
}

const AreaDashboard: React.FC<Props> = ({ users, receipts, settings, onUpdateAreas, onAssignUserArea, onBulkAssignUserArea }) => {
  const isDark = useIsDark();
  const now = useMemo(() => new Date(), []);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<AreaSort>('total');
  const [showManageAreas, setShowManageAreas] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [userSort, setUserSort] = useState<UserSort>('name');
  const [userSortDir, setUserSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkArea, setBulkArea] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const definedAreas = settings.areas || [];
  const years = useMemo(() => yearOptions(receipts, now), [receipts, now]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const monthLabel = currentMonthLabel(today);

  const handleAddArea = () => {
    const name = newAreaName.trim();
    if (!name) return;
    if (definedAreas.some(a => a.toLowerCase() === name.toLowerCase())) {
      showToast('This area already exists.');
      return;
    }
    onUpdateAreas?.([...definedAreas, name]);
    setNewAreaName('');
    showToast(`"${name}" was added.`);
  };

  const handleRemoveArea = (name: string) => {
    onUpdateAreas?.(definedAreas.filter(a => a !== name));
    showToast(`"${name}" was removed from the area list. Customer data is safe.`);
  };

  const areaStats = useMemo((): AreaStats[] => {
    const list = buildAreaStats(users, receipts, settings, selectedYear, selectedMonth, today);
    return list.sort((a, b) => b[sortBy] - a[sortBy]);
  }, [users, receipts, settings, selectedYear, selectedMonth, today, sortBy]);

  const filtered = useMemo(() => {
    if (!search.trim()) return areaStats;
    const q = search.toLowerCase();
    return areaStats.filter(a => a.area.toLowerCase().includes(q));
  }, [areaStats, search]);

  const totals = useMemo(() => ({
    total: areaStats.reduce((s, a) => s + a.total, 0),
    active: areaStats.reduce((s, a) => s + a.active, 0),
    expired: areaStats.reduce((s, a) => s + a.expired, 0),
    revenue: areaStats.reduce((s, a) => s + a.revenue, 0),
    yearRevenue: areaStats.reduce((s, a) => s + a.yearRevenue, 0),
    expected: areaStats.reduce((s, a) => s + a.expected, 0),
    pending: areaStats.reduce((s, a) => s + a.pending, 0),
  }), [areaStats]);

  const selectedAreaData = selectedArea ? areaStats.find(a => a.area === selectedArea) : null;
  const areaChoices = useMemo(
    () => Array.from(new Set([...definedAreas, ...users.map(x => x.area).filter(Boolean) as string[]])).filter(Boolean),
    [definedAreas, users],
  );

  const selectedAreaUsers = useMemo(() => {
    if (!selectedArea) return [];
    const list = users.filter(u => userAreaLabel(u) === selectedArea && u.status !== 'deleted');
    const dir = userSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (userSort === 'status') {
        return statusLabel(a, today, monthLabel).localeCompare(statusLabel(b, today, monthLabel)) * dir;
      }
      const av = String(a[userSort] || '').toLowerCase();
      const bv = String(b[userSort] || '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [selectedArea, users, userSort, userSortDir, today, monthLabel]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const allSelected = selectedAreaUsers.length > 0 && selectedAreaUsers.every(u => selectedIds.includes(u.id));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(selectedAreaUsers.map(u => u.id));
  };

  const applyBulkArea = () => {
    if (selectedIds.length === 0) return;
    if (onBulkAssignUserArea) {
      // Single batched save — avoids firing N simultaneous Supabase upserts.
      onBulkAssignUserArea(selectedIds, bulkArea);
    } else if (onAssignUserArea) {
      selectedIds.forEach(id => onAssignUserArea(id, bulkArea));
    } else {
      return;
    }
    showToast(`${selectedIds.length} customer(s) → ${bulkArea || 'No Area'}`);
    setSelectedIds([]);
  };

  const Toast = toast ? (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold">{toast}</div>
    </div>
  ) : null;

  if (selectedArea && selectedAreaData) return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      <button onClick={() => { setSelectedArea(null); setSelectedIds([]); }} className={`flex items-center gap-2 ${isDark ? 'text-white/50' : 'text-slate-500'} hover:${isDark ? 'text-white' : 'text-slate-900'} mb-6 text-sm`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-1">📍 {selectedArea}</h2>
      <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mb-5`}>{selectedAreaData.total} customers</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: 'Active', val: selectedAreaData.active, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Expired', val: selectedAreaData.expired, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
          { label: `${MONTHS[selectedMonth]} collected`, val: `Rs. ${selectedAreaData.revenue.toLocaleString()}`, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Pending', val: `Rs. ${selectedAreaData.pending.toLocaleString()}`, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
          { label: `${selectedYear} total`, val: `Rs. ${selectedAreaData.yearRevenue.toLocaleString()}`, color: 'text-indigo-300', bg: 'bg-indigo-500/10 border-indigo-500/20' },
          { label: 'Expected', val: `Rs. ${selectedAreaData.expected.toLocaleString()}`, color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 border ${s.bg}`}>
            <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} font-bold uppercase tracking-wider mt-1`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl p-4 mb-5 flex items-center gap-4`}>
        <RecoveryRing percent={selectedAreaData.recovery} isDark={isDark} gradId="area-recovery-detail" />
        <div>
          <p className="font-black text-sm">Recovery {selectedAreaData.recovery}%</p>
          <p className={`text-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}>Collected / (collected + pending)</p>
        </div>
      </div>

      {Object.keys(selectedAreaData.plans).length > 0 && (
        <div className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl p-4 mb-5`}>
          <p className={`text-xs font-black ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider mb-3`}>Plans Breakdown</p>
          {Object.entries(selectedAreaData.plans).sort((a, b) => b[1] - a[1]).map(([plan, count]) => (
            <div key={plan} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm font-semibold">{plan}</span>
              <div className="flex items-center gap-3">
                <div className={`w-24 ${isDark ? 'bg-white/10' : 'bg-slate-100'} rounded-full h-1.5`}>
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(count / selectedAreaData.total) * 100}%` }} />
                </div>
                <span className="text-sm font-black text-indigo-400 w-6 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className={`text-xs font-black ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>Customers</p>
        <div className="flex items-center gap-2">
          <select
            value={userSort}
            onChange={e => { setUserSort(e.target.value as UserSort); setUserSortDir('asc'); }}
            className={`text-[10px] font-bold ${isDark ? 'bg-white/10 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-700'} border rounded-lg px-2 py-1.5`}
          >
            <option value="name">Sort: Name</option>
            <option value="username">Sort: Username</option>
            <option value="address">Sort: Address</option>
            <option value="status">Sort: Status</option>
            <option value="plan">Sort: Plan</option>
          </select>
          <button
            onClick={() => setUserSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className={`text-[10px] font-black ${isDark ? 'bg-white/10' : 'bg-slate-100'} px-2 py-1.5 rounded-lg`}
          >
            {userSortDir === 'asc' ? 'A-Z' : 'Z-A'}
          </button>
          <button
            onClick={toggleSelectAll}
            className={`text-[10px] font-black ${isDark ? 'bg-white/10' : 'bg-slate-100'} px-2 py-1.5 rounded-lg`}
          >
            {allSelected ? 'Clear' : 'Select all'}
          </button>
        </div>
      </div>

      <div className="space-y-2 pb-24">
        {selectedAreaUsers.map(u => {
          const active = isUserActive(u, today, monthLabel);
          const checked = selectedIds.includes(u.id);
          return (
            <div key={u.id} className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${checked ? 'border-indigo-500' : isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-4 py-3 flex items-center gap-3`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSelected(u.id)}
                className="shrink-0 accent-indigo-500"
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{u.name}</p>
                <p className={`${isDark ? 'text-white/50' : 'text-slate-500'} text-xs truncate`}>@{u.username || '—'}</p>
                <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs truncate`} title={u.address}>{u.address || 'No address'}</p>
                <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs truncate`}>{u.phone} • {u.plan}</p>
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-black border shrink-0 ${
                isUserSuspended(u) ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' :
                active ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                'bg-red-500/15 border-red-500/30 text-red-400'
              }`}>
                {isUserSuspended(u) ? 'Suspended' : active ? 'Active' : 'Expired'}
              </span>
              {onAssignUserArea && (
                <select
                  value={u.area || ''}
                  onChange={e => { onAssignUserArea(u.id, e.target.value); showToast(`${u.name} → ${e.target.value || 'No Area'}`); }}
                  className={`shrink-0 text-[10px] font-bold ${isDark ? 'bg-white/10 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'} border rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500`}
                >
                  <option value="">No Area</option>
                  {Array.from(new Set([...areaChoices, selectedArea])).filter(Boolean).map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {selectedIds.length > 0 && (onBulkAssignUserArea || onAssignUserArea) && (
        <div className={`fixed bottom-4 left-4 right-4 z-40 ${isDark ? 'bg-[#151a2c] border-white/10' : 'bg-white border-slate-200'} border rounded-2xl shadow-2xl p-3 flex flex-wrap items-center gap-2`}>
          <p className="text-xs font-black">{selectedIds.length} selected</p>
          <select
            value={bulkArea}
            onChange={e => setBulkArea(e.target.value)}
            className={`flex-1 min-w-[140px] text-xs font-bold ${isDark ? 'bg-white/10 border-white/10 text-white' : 'bg-slate-50 border-slate-200'} border rounded-lg px-2 py-2`}
          >
            <option value="">No Area</option>
            {areaChoices.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button onClick={applyBulkArea} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest">
            Apply
          </button>
        </div>
      )}

      {Toast}
    </div>
  );

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
            <p className={`text-xs ${isDark ? 'text-white/30' : 'text-slate-400'}`}>No areas defined yet. Enter a name above and press "Add" — it will then be available in the Customer Directory form.</p>
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

      <div className="flex gap-2 mb-4">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(Number(e.target.value))}
          className={`flex-1 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-xs focus:outline-none`}
        >
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-xs focus:outline-none`}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="col-span-2 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 rounded-2xl p-4 flex justify-between items-center gap-3">
          <div>
            <p className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>{MONTHS[selectedMonth]} {selectedYear} Collected</p>
            <p className="text-2xl font-black text-indigo-300">Rs. {totals.revenue.toLocaleString()}</p>
            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} mt-1`}>{selectedYear} total: Rs. {totals.yearRevenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>Expected</p>
            <p className="text-lg font-black text-emerald-300">Rs. {totals.expected.toLocaleString()}</p>
            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-500'} mt-1`}>Pending: Rs. {totals.pending.toLocaleString()}</p>
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

      <div className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search area..."
          className={`flex-1 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'}`}/>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as AreaSort)}
          className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-xs focus:outline-none`}>
          <option value="total">By Total</option>
          <option value="revenue">By Revenue</option>
          <option value="expired">By Expired</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className={`text-center py-20 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          <div className="text-5xl mb-4">📍</div>
          <p className="font-bold">No areas found.</p>
          <p className="text-sm mt-1">Set an area for customers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((area, idx) => (
            <button key={area.area} onClick={() => setSelectedArea(area.area)}
              className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} hover:${isDark ? 'bg-white/8' : 'bg-slate-50'} rounded-2xl p-4 text-left transition-all active:scale-[0.98]`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="font-black text-base">📍 {area.area}</p>
                  <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>{area.total} customers</p>
                </div>
                <RecoveryRing percent={area.recovery} isDark={isDark} gradId={`area-recovery-${idx}`} />
              </div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-blue-400 font-black text-sm">Rs. {area.revenue.toLocaleString()}</p>
                  <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-xs`}>{MONTHS[selectedMonth]} collected</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-bold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Rs. {area.yearRevenue.toLocaleString()}</p>
                  <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-xs`}>{selectedYear} total</p>
                </div>
              </div>
              <div className={`flex justify-between text-[10px] ${isDark ? 'text-white/50' : 'text-slate-500'} mb-2`}>
                <span>Expected Rs. {area.expected.toLocaleString()}</span>
                {area.pending > 0 && <span className="text-orange-300 font-bold">Pending Rs. {area.pending.toLocaleString()}</span>}
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400 font-bold">{area.active} active</span>
                <span className="text-red-400 font-bold">{area.expired} expired</span>
                {area.suspended > 0 && <span className="text-orange-400 font-bold">{area.suspended} paused</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {Toast}
    </div>
  );
};

export default AreaDashboard;
