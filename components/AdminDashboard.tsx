import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getLogs, clearLogs, writeLog, ActivityLog } from '../utils/storage';

interface ManagerAccount {
  username: string; password: string; businessName: string;
  email?: string; phone?: string; createdAt: string;
}
interface UserRecord {
  id: string; username: string; name: string; phone?: string;
  plan: string; monthlyFee: number; balance: number;
  expiryDate: string; status: 'active' | 'expired' | 'pending' | 'deleted';
  companyId?: string; createdAt?: string; activatedMonths?: string[];
}
interface Receipt {
  id: string; userId: string; totalAmount: number;
  paidAmount: number; date: string; period: string;
}
interface AppState {
  users: UserRecord[]; receipts: Receipt[];
  settings?: { businessName?: string };
  companies?: { id: string; name: string; settings?: { businessName?: string } }[];
}
interface ManagerStats {
  account?: ManagerAccount; username: string; businessName: string;
  totalCustomers: number; activeCustomers: number; expiredCustomers: number;
  totalRevenue: number; totalBalance: number; totalReceipts: number;
  users: UserRecord[]; receipts: Receipt[]; lastActivity?: string;
}

const DATA_PREFIX = 'mahadnet_data_';
const ACCOUNTS_KEY = 'mahadnet_accounts';
const MANAGERS_KEY = 'mahadnet_managers';

function getRegisteredAccounts(): ManagerAccount[] {
  try {
    const a = localStorage.getItem(ACCOUNTS_KEY);
    const b = localStorage.getItem(MANAGERS_KEY);
    const fromA: ManagerAccount[] = a ? JSON.parse(a) : [];
    const fromB: ManagerAccount[] = b ? JSON.parse(b) : [];
    const map = new Map<string, ManagerAccount>();
    [...fromA, ...fromB].forEach(m => map.set(m.username, m));
    return Array.from(map.values());
  } catch { return []; }
}
function saveRegisteredAccounts(accounts: ManagerAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  localStorage.setItem(MANAGERS_KEY, JSON.stringify(accounts));
}
function loadManagerState(username: string): AppState | null {
  try {
    const raw = localStorage.getItem(`${DATA_PREFIX}${username}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function getAllDataUsernames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(DATA_PREFIX)) {
      const u = k.replace(DATA_PREFIX, '');
      if (u && u !== 'admin') names.push(u);
    }
  }
  return names;
}
function buildStats(username: string, account?: ManagerAccount): ManagerStats {
  const state = loadManagerState(username);
  const users: UserRecord[] = state?.users || [];
  const receipts: Receipt[] = state?.receipts || [];
  const businessName = account?.businessName || state?.settings?.businessName ||
    state?.companies?.[0]?.settings?.businessName || username;
  return {
    account, username, businessName,
    totalCustomers: users.length,
    activeCustomers: users.filter(u => u.status === 'active').length,
    expiredCustomers: users.filter(u => u.status === 'expired').length,
    totalRevenue: receipts.reduce((s, r) => s + (r.paidAmount || r.totalAmount || 0), 0),
    totalBalance: users.reduce((s, u) => s + (u.balance || 0), 0),
    totalReceipts: receipts.length, users, receipts,
    lastActivity: receipts.length > 0
      ? [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date
      : account?.createdAt,
  };
}

const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${color}`}>{children}</span>
);
const KpiCard = ({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) => (
  <div className={`rounded-2xl p-4 ${color} flex flex-col gap-1.5`}>
    <span className="text-xl">{icon}</span>
    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</span>
    <span className="text-xl font-black leading-tight">{value}</span>
    {sub && <span className="text-[10px] opacity-60">{sub}</span>}
  </div>
);
const TabBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
    {children}
  </button>
);

const actionColor: Record<string, string> = {
  LOGIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  LOGOUT: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  SIGNUP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DATA_SAVE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CUSTOMER_ADD: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  CUSTOMER_DELETE: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  RECEIPT_CREATE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  SETTINGS_UPDATE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState<'overview'|'managers'|'customers'|'logs'|'system'>('overview');
  const [managers, setManagers] = useState<ManagerStats[]>([]);
  const [accounts, setAccounts] = useState<ManagerAccount[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchMgr, setSearchMgr] = useState('');
  const [searchCust, setSearchCust] = useState('');
  const [searchLog, setSearchLog] = useState('');
  const [custFilter, setCustFilter] = useState<'all'|'active'|'expired'>('all');
  const [logFilter, setLogFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string|null>(null);
  const [showResetModal, setShowResetModal] = useState<string|null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newMgr, setNewMgr] = useState({ username:'', password:'', businessName:'', email:'', phone:'' });
  const [formError, setFormError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [expandedMgr, setExpandedMgr] = useState<string|null>(null);

  const loadAll = useCallback(() => {
    const accs = getRegisteredAccounts();
    setAccounts(accs);
    const allNames = Array.from(new Set([...accs.map(a => a.username), ...getAllDataUsernames()]));
    const stats = allNames.map(u => buildStats(u, accs.find(a => a.username === u)));
    stats.sort((a, b) => b.totalCustomers - a.totalCustomers);
    setManagers(stats);
    setLogs(getLogs());
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const allCustomers = useMemo(() =>
    managers.flatMap(m => m.users.map(u => ({ ...u, managerUsername: m.username, managerBusiness: m.businessName }))),
    [managers]);

  const filteredCusts = useMemo(() => {
    let list = allCustomers;
    if (custFilter !== 'all') list = list.filter(u => u.status === custFilter);
    if (searchCust.trim()) {
      const q = searchCust.toLowerCase();
      list = list.filter(u => u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || (u.phone||'').includes(q) || u.plan?.toLowerCase().includes(q) || u.managerBusiness?.toLowerCase().includes(q));
    }
    return list;
  }, [allCustomers, custFilter, searchCust]);

  const filteredMgrs = useMemo(() => {
    if (!searchMgr.trim()) return managers;
    const q = searchMgr.toLowerCase();
    return managers.filter(m => m.username.toLowerCase().includes(q) || m.businessName.toLowerCase().includes(q) || (m.account?.email||'').toLowerCase().includes(q) || (m.account?.phone||'').includes(q));
  }, [managers, searchMgr]);

  const filteredLogs = useMemo(() => {
    let list = logs;
    if (logFilter !== 'all') list = list.filter(l => l.action === logFilter);
    if (searchLog.trim()) {
      const q = searchLog.toLowerCase();
      list = list.filter(l => l.username.toLowerCase().includes(q) || (l.detail||'').toLowerCase().includes(q) || l.action.toLowerCase().includes(q));
    }
    return list;
  }, [logs, searchLog, logFilter]);

  const totals = useMemo(() => ({
    managers: managers.length,
    customers: managers.reduce((s, m) => s + m.totalCustomers, 0),
    active: managers.reduce((s, m) => s + m.activeCustomers, 0),
    revenue: managers.reduce((s, m) => s + m.totalRevenue, 0),
    balance: managers.reduce((s, m) => s + m.totalBalance, 0),
    receipts: managers.reduce((s, m) => s + m.totalReceipts, 0),
  }), [managers]);

  const handleAdd = () => {
    setFormError('');
    const { username, password, businessName } = newMgr;
    if (!username.trim() || !password.trim() || !businessName.trim()) { setFormError('Username, Password aur Business Name zaroori hain!'); return; }
    if (username.toLowerCase() === 'admin') { setFormError('"admin" reserved hai!'); return; }
    if (accounts.find(a => a.username.toLowerCase() === username.toLowerCase())) { setFormError('Yeh username already maujood hai!'); return; }
    const acc: ManagerAccount = { username: username.trim().toLowerCase(), password: password.trim(), businessName: businessName.trim(), email: newMgr.email.trim(), phone: newMgr.phone.trim(), createdAt: new Date().toISOString() };
    saveRegisteredAccounts([...accounts, acc]);
    localStorage.setItem(`${DATA_PREFIX}${acc.username}`, JSON.stringify({ users: [], receipts: [], settings: { businessName: acc.businessName }, companies: [{ id: 'COMP-DEFAULT', name: acc.businessName, settings: { businessName: acc.businessName } }] }));
    writeLog({ username: 'admin', action: 'SIGNUP', detail: `Admin created manager: ${acc.username} (${acc.businessName})` });
    setNewMgr({ username: '', password: '', businessName: '', email: '', phone: '' });
    setShowAddModal(false);
    loadAll();
  };

  const handleDelete = (username: string) => {
    saveRegisteredAccounts(accounts.filter(a => a.username !== username));
    localStorage.removeItem(`${DATA_PREFIX}${username}`);
    writeLog({ username: 'admin', action: 'DATA_SAVE', detail: `Admin deleted manager: ${username}` });
    setShowDeleteConfirm(null);
    loadAll();
  };

  const handleReset = () => {
    if (!showResetModal || !newPassword.trim()) return;
    saveRegisteredAccounts(accounts.map(a => a.username === showResetModal ? { ...a, password: newPassword.trim() } : a));
    writeLog({ username: 'admin', action: 'SETTINGS_UPDATE', detail: `Password reset for: ${showResetModal}` });
    setShowResetModal(null);
    setNewPassword('');
    loadAll();
  };

  const parseBrowser = (ua: string = '') => {
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    return 'Browser';
  };

  const parseDevice = (ua: string = '') => {
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad/i.test(ua)) return 'iOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac/i.test(ua)) return 'macOS';
    return 'Unknown';
  };

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">🛡️ Admin Control Center</h1>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">
            Synced: {lastRefresh.toLocaleTimeString()} · {managers.length} managers · {totals.customers} customers
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors">🔄 Refresh</button>
          <button onClick={() => setShowAddModal(true)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">＋ Add Manager</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <TabBtn active={tab==='overview'} onClick={()=>setTab('overview')}>📊 Overview</TabBtn>
        <TabBtn active={tab==='managers'} onClick={()=>setTab('managers')}>👥 Managers ({managers.length})</TabBtn>
        <TabBtn active={tab==='customers'} onClick={()=>setTab('customers')}>🧑‍💼 All Customers ({totals.customers})</TabBtn>
        <TabBtn active={tab==='logs'} onClick={()=>setTab('logs')}>📋 Activity Logs ({logs.length})</TabBtn>
        <TabBtn active={tab==='system'} onClick={()=>setTab('system')}>⚙️ System</TabBtn>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon="👥" label="Managers" value={totals.managers} color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200" />
            <KpiCard icon="🧑‍💼" label="Total Customers" value={totals.customers} color="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200" />
            <KpiCard icon="✅" label="Active" value={totals.active} sub={`${totals.customers ? Math.round(totals.active/totals.customers*100) : 0}%`} color="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200" />
            <KpiCard icon="❌" label="Expired" value={totals.customers - totals.active} color="bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200" />
            <KpiCard icon="💰" label="Total Revenue" value={`Rs.${(totals.revenue/1000).toFixed(0)}K`} sub={`Rs. ${totals.revenue.toLocaleString()}`} color="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200" />
            <KpiCard icon="⚠️" label="Pending Dues" value={`Rs.${(totals.balance/1000).toFixed(0)}K`} sub={`Rs. ${totals.balance.toLocaleString()}`} color="bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200" />
          </div>

          {/* Top Managers Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-black text-slate-800 dark:text-white text-sm">🏆 Top Managers by Revenue</h3>
              <button onClick={()=>setTab('managers')} className="text-xs text-indigo-500 font-bold">View all →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    {['#','Manager','Customers','Active','Revenue','Dues','Last Activity'].map(h=>(
                      <th key={h} className="text-left px-4 py-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...managers].sort((a,b)=>b.totalRevenue-a.totalRevenue).slice(0,10).map((m,i)=>(
                    <tr key={m.username} onClick={()=>{ setTab('managers'); }} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-black">{i+1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black">{m.businessName.charAt(0).toUpperCase()}</div>
                          <div>
                            <p className="font-black text-slate-800 dark:text-white">{m.businessName}</p>
                            <p className="text-slate-400">@{m.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-700 dark:text-slate-300">{m.totalCustomers}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">{m.activeCustomers}</td>
                      <td className="px-4 py-3 text-right font-black text-amber-600 dark:text-amber-400">Rs. {m.totalRevenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-black text-rose-500">{m.totalBalance > 0 ? `Rs. ${m.totalBalance.toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{m.lastActivity ? new Date(m.lastActivity).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {managers.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">Koi manager nahi — "Add Manager" se banayein</div>}
            </div>
          </div>

          {/* Recent Logs */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-black text-slate-800 dark:text-white text-sm">📋 Recent Activity</h3>
              <button onClick={()=>setTab('logs')} className="text-xs text-indigo-500 font-bold">View all →</button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {logs.slice(0,6).map(log=>(
                <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                  <Badge color={actionColor[log.action]||'bg-slate-100 text-slate-500'}>{log.action}</Badge>
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">@{log.username}</span>
                  <span className="text-slate-400 text-xs flex-1 truncate">{log.detail}</span>
                  <span className="text-slate-400 text-[10px] whitespace-nowrap">{fmtTime(log.timestamp)}</span>
                </div>
              ))}
              {logs.length===0 && <div className="px-5 py-8 text-center text-slate-400 text-xs">Managers login karne ke baad yahan activity nazar aayegi</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── MANAGERS ── */}
      {tab === 'managers' && (
        <div className="space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input type="text" placeholder="Manager name, username, email, phone search..." value={searchMgr} onChange={e=>setSearchMgr(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {filteredMgrs.length === 0
            ? <div className="text-center py-16 text-slate-400"><p className="text-4xl mb-3">📭</p><p className="font-bold">Koi manager nahi mila</p></div>
            : <div className="space-y-3">
                {filteredMgrs.map(m => (
                  <div key={m.username} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center font-black text-indigo-600 dark:text-indigo-300 text-lg flex-shrink-0">
                        {m.businessName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-slate-900 dark:text-white text-sm">{m.businessName}</p>
                          <Badge color={m.totalCustomers > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}>
                            {m.totalCustomers > 0 ? '🟢 Active' : '⚪ Empty'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                          <span>@{m.username}</span>
                          {m.account?.email && <span>📧 {m.account.email}</span>}
                          {m.account?.phone && <span>📱 {m.account.phone}</span>}
                          {m.account?.createdAt && <span>📅 Joined {new Date(m.account.createdAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-xs">
                        <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-lg font-black">{m.totalCustomers} total</span>
                        <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg font-black">{m.activeCustomers} active</span>
                        <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg font-black">Rs.{(m.totalRevenue/1000).toFixed(0)}K rev</span>
                        <span className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg font-black">{m.totalReceipts} receipts</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={()=>setExpandedMgr(expandedMgr===m.username ? null : m.username)}
                          className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-base">
                          {expandedMgr===m.username ? '▲' : '▼'}
                        </button>
                        <button onClick={()=>{ setShowResetModal(m.username); setNewPassword(''); }}
                          className="p-2 rounded-xl text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" title="Reset Password">🔑</button>
                        <button onClick={()=>setShowDeleteConfirm(m.username)}
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors" title="Delete">🗑️</button>
                      </div>
                    </div>

                    {/* Expanded Customer List */}
                    {expandedMgr === m.username && (
                      <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <div className="px-4 py-3 flex items-center justify-between">
                          <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            Full Customer List ({m.users.length})
                          </p>
                          <div className="flex gap-3 text-xs">
                            <span className="text-emerald-600 font-bold">{m.activeCustomers} active</span>
                            <span className="text-rose-500 font-bold">{m.expiredCustomers} expired</span>
                            <span className="text-amber-600 font-bold">Rs. {m.totalRevenue.toLocaleString()} collected</span>
                          </div>
                        </div>
                        {m.users.length === 0
                          ? <p className="px-4 pb-4 text-center text-slate-400 text-xs">Is manager ke abhi koi customers nahi hain</p>
                          : <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-t border-slate-200 dark:border-slate-700">
                                    {['Name','Username','Phone','Plan','Monthly Fee','Balance','Expiry','Status'].map(h=>(
                                      <th key={h} className="text-left px-4 py-2 font-black text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.users.map(u=>(
                                    <tr key={u.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                      <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-white whitespace-nowrap">{u.name}</td>
                                      <td className="px-4 py-2.5 text-slate-500">@{u.username}</td>
                                      <td className="px-4 py-2.5 text-slate-500">{u.phone||'—'}</td>
                                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{u.plan}</td>
                                      <td className="px-4 py-2.5 font-black text-amber-600 whitespace-nowrap">Rs. {(u.monthlyFee||0).toLocaleString()}</td>
                                      <td className="px-4 py-2.5 font-black text-rose-500 whitespace-nowrap">{u.balance>0 ? `Rs. ${u.balance.toLocaleString()}` : '—'}</td>
                                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{u.expiryDate ? new Date(u.expiryDate).toLocaleDateString() : '—'}</td>
                                      <td className="px-4 py-2.5">
                                        <Badge color={u.status==='active' ? 'bg-emerald-100 text-emerald-700' : u.status==='expired' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}>{u.status}</Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── ALL CUSTOMERS ── */}
      {tab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Name, username, phone, plan ya manager search..." value={searchCust} onChange={e=>setSearchCust(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              {(['all','active','expired'] as const).map(f=>(
                <button key={f} onClick={()=>setCustFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black capitalize transition-all ${custFilter===f ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                  {f} ({f==='all' ? allCustomers.length : f==='active' ? allCustomers.filter(u=>u.status==='active').length : allCustomers.filter(u=>u.status==='expired').length})
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-400 font-bold">{filteredCusts.length} customers found</p>
            </div>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700/90 z-10">
                  <tr>
                    {['Customer','Manager','Plan','Monthly Fee','Balance','Expiry','Status'].map(h=>(
                      <th key={h} className="text-left px-4 py-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCusts.length===0
                    ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Koi customer nahi mila</td></tr>
                    : filteredCusts.map((u,i)=>(
                        <tr key={`${u.id}-${i}`} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="font-black text-slate-800 dark:text-white whitespace-nowrap">{u.name}</p>
                            <p className="text-slate-400">@{u.username}{u.phone ? ` · ${u.phone}` : ''}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{u.managerBusiness}</p>
                            <p className="text-slate-400">@{u.managerUsername}</p>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{u.plan}</td>
                          <td className="px-4 py-2.5 font-black text-amber-600 whitespace-nowrap">Rs. {(u.monthlyFee||0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-black whitespace-nowrap">{u.balance>0 ? <span className="text-rose-500">Rs. {u.balance.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{u.expiryDate ? new Date(u.expiryDate).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-2.5">
                            <Badge color={u.status==='active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : u.status==='expired' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}>
                              {u.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVITY LOGS ── */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Username, action ya detail search..." value={searchLog} onChange={e=>setSearchLog(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex-wrap">
              {['all','LOGIN','SIGNUP','SETTINGS_UPDATE','DATA_SAVE'].map(f=>(
                <button key={f} onClick={()=>setLogFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${logFilter===f ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                  {f==='all' ? `All (${logs.length})` : f}
                </button>
              ))}
            </div>
          </div>

          {logs.length === 0 && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 text-xs text-indigo-700 dark:text-indigo-300">
              <p className="font-black mb-1">ℹ️ Logging System Active Hai</p>
              <p>Jab bhi koi manager login ya signup karega, woh activity yahan record hogi. Ab se tamam logins track hongay.</p>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <p className="text-xs text-slate-400 font-bold">{filteredLogs.length} records</p>
              {logs.length > 0 && (
                <button onClick={()=>{ clearLogs(); setLogs([]); }} className="text-xs text-rose-500 font-black hover:text-rose-600">🗑️ Clear All</button>
              )}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[65vh] overflow-y-auto">
              {filteredLogs.length === 0
                ? <div className="px-5 py-12 text-center text-slate-400 text-sm">Koi log nahi mila</div>
                : filteredLogs.map(log=>(
                    <div key={log.id} className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <Badge color={actionColor[log.action]||'bg-slate-100 text-slate-500'}>{log.action}</Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-800 dark:text-white text-xs">@{log.username}</span>
                            <span className="text-slate-500 dark:text-slate-400 text-xs truncate">{log.detail}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-slate-400">
                            <span>🕐 {fmtTime(log.timestamp)}</span>
                            {log.userAgent && <span>🌐 {parseBrowser(log.userAgent)} on {parseDevice(log.userAgent)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── SYSTEM ── */}
      {tab === 'system' && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="font-black text-slate-800 dark:text-white text-sm">📊 System Stats</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                {label:'Total Managers',value:managers.length},
                {label:'Total Customers',value:totals.customers},
                {label:'Total Receipts',value:totals.receipts},
                {label:'Activity Logs',value:logs.length},
                {label:'localStorage Keys',value:localStorage.length},
                {label:'App Version',value:'MYISP v2.0'},
              ].map(item=>(
                <div key={item.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                  <p className="text-slate-400 uppercase tracking-wide text-[10px]">{item.label}</p>
                  <p className="font-black text-slate-800 dark:text-white text-lg">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-black text-slate-800 dark:text-white text-sm">🔐 All Manager Accounts</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Sensitive — Admin only view</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    {['Username','Business Name','Email','Phone','Joined','Actions'].map(h=>(
                      <th key={h} className="text-left px-4 py-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc=>(
                    <tr key={acc.username} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-black text-slate-800 dark:text-white">@{acc.username}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{acc.businessName}</td>
                      <td className="px-4 py-2.5 text-slate-500">{acc.email||'—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{acc.phone||'—'}</td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{acc.createdAt ? new Date(acc.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <button onClick={()=>{ setShowResetModal(acc.username); setNewPassword(''); }} className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 font-black hover:bg-indigo-100 transition-colors text-xs">🔑 Reset</button>
                          <button onClick={()=>setShowDeleteConfirm(acc.username)} className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 font-black hover:bg-rose-100 transition-colors text-xs">🗑️ Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {accounts.length===0 && <div className="px-4 py-8 text-center text-slate-400 text-sm">Koi registered account nahi</div>}
            </div>
          </div>

          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-2xl p-5">
            <h3 className="font-black text-rose-700 dark:text-rose-400 text-sm mb-3">⚠️ Danger Zone</h3>
            <button onClick={()=>{ clearLogs(); setLogs([]); }} className="w-full py-3 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 text-rose-600 text-xs font-black hover:bg-rose-50 transition-colors text-left px-4">
              🗑️ Clear All Activity Logs ({logs.length} records)
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD MANAGER ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={()=>setShowAddModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">➕ New Manager Account</h2>
            <div className="space-y-3">
              {[
                {label:'Username *',key:'username',placeholder:'e.g. ali_isp',type:'text'},
                {label:'Password *',key:'password',placeholder:'Strong password',type:'password'},
                {label:'Business Name *',key:'businessName',placeholder:'e.g. Ali Networks',type:'text'},
                {label:'Email (optional)',key:'email',placeholder:'ali@example.com',type:'email'},
                {label:'Phone (optional)',key:'phone',placeholder:'03001234567',type:'tel'},
              ].map(field=>(
                <div key={field.key}>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1">{field.label}</label>
                  <input type={field.type} placeholder={field.placeholder}
                    value={newMgr[field.key as keyof typeof newMgr]}
                    onChange={e=>setNewMgr(prev=>({...prev,[field.key]:e.target.value}))}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              ))}
              {formError && <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/30 rounded-xl px-3 py-2">⚠️ {formError}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={()=>{setShowAddModal(false);setFormError('');}} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black">Cancel</button>
                <button onClick={handleAdd} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700">✅ Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RESET PASSWORD ── */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={()=>setShowResetModal(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">🔑 Reset Password</h2>
            <p className="text-xs text-slate-400 mb-4">@{showResetModal} ka naya password set karein</p>
            <input type="password" placeholder="Naya password likhein" value={newPassword} onChange={e=>setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={()=>setShowResetModal(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 text-xs font-black">Cancel</button>
              <button onClick={handleReset} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black">💾 Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DELETE CONFIRM ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={()=>setShowDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">Delete Manager?</h2>
            <p className="text-xs text-slate-500 mb-6"><span className="font-black text-rose-600">@{showDeleteConfirm}</span> ka account aur poora data permanently delete ho jayega!</p>
            <div className="flex gap-2">
              <button onClick={()=>setShowDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 text-xs font-black">Cancel</button>
              <button onClick={()=>handleDelete(showDeleteConfirm)} className="flex-1 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black">🗑️ Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
