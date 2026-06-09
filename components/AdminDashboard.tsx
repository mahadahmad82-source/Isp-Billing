import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAccounts, saveAccount, removeAccount } from '../utils/storage';
import {
  Users, UserCheck, CheckCircle2, XCircle, Banknote, AlertTriangle,
  Search, Inbox, ClipboardList, Server, RefreshCcw, Trash2, Key,
  ChevronUp, ChevronDown, Activity, LogIn, Shield, TrendingUp,
  Download, Upload, Eye, Clock, BarChart2, Wifi
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManagerStat {
  username: string; business_name: string; email: string; phone: string | null;
  role: string; joined_at: string; last_login: string; user_count: number;
  receipt_count: number; active_count: number; expired_count: number;
  total_revenue: number; total_balance: number; data_updated_at: string | null;
}
interface Customer {
  id: string; name: string; username: string; phone?: string; plan: string;
  monthlyFee: number; balance: number; expiryDate: string;
  status: 'active' | 'expired' | 'pending' | 'deleted';
  createdAt?: string; managerUsername?: string; managerBusiness?: string;
}
interface ActivityEntry {
  managerUsername: string; managerBusiness: string; action: string;
  details?: string; timestamp: string;
  type: 'login' | 'receipt' | 'customer' | 'update' | 'system' | 'other';
}
interface Props {
  activeTab?: string;
  setActiveTab?: (t: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-PK'); }
  catch { return iso; }
};
const timeAgo = (iso: string | null) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return m <= 0 ? 'just now' : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${color}`}>
    {children}
  </span>
);
const StatChip = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
  <span className="text-slate-400 bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-lg text-[11px]">
    <strong className={color}>{value}</strong> {label}
  </span>
);

// ─── KPI Card — styled exactly like Dashboard cards ───────────────────────────
const KpiCard = ({ icon, label, value, sub, gradient, valColor, accent, pct }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; gradient: string; valColor?: string; accent: string; pct?: number;
}) => (
  <div className={`rounded-3xl p-5 ${gradient} flex flex-col justify-between shadow-lg relative overflow-hidden`}>
    {/* Decorative circle */}
    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/5" />
    <div className="flex items-start justify-between mb-3 relative z-10">
      <span className="text-white/70">{icon}</span>
      {pct !== undefined && (
        <span className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-0.5 rounded-full">{pct}%</span>
      )}
    </div>
    <div className="relative z-10">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50 block mb-1">{label}</span>
      <span className={`text-[2rem] font-black leading-none ${valColor || 'text-white'}`}>{value}</span>
      {sub && <span className="text-[11px] text-white/40 font-semibold block mt-1">{sub}</span>}
    </div>
  </div>
);

const activityTypeConfig: Record<ActivityEntry['type'], { icon: React.ReactNode; color: string; bg: string }> = {
  login:    { icon: <LogIn className="w-3.5 h-3.5" />,    color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  receipt:  { icon: <Banknote className="w-3.5 h-3.5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  customer: { icon: <UserCheck className="w-3.5 h-3.5" />,color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  update:   { icon: <RefreshCcw className="w-3.5 h-3.5" />,color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  system:   { icon: <Shield className="w-3.5 h-3.5" />,   color: 'text-slate-400',   bg: 'bg-slate-500/10' },
  other:    { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-slate-400',   bg: 'bg-slate-500/10' },
};

type OnlineStatus = 'online' | 'recent' | 'offline';
const getOnlineStatus = (updatedAt: string | null): OnlineStatus => {
  if (!updatedAt) return 'offline';
  const diff = Date.now() - new Date(updatedAt).getTime();
  if (diff < 5 * 60 * 1000) return 'online';
  if (diff < 30 * 60 * 1000) return 'recent';
  return 'offline';
};
const OnlineDot = ({ status, showLabel = false }: { status: OnlineStatus; showLabel?: boolean }) => {
  const cfg = {
    online:  { dot: 'bg-emerald-400', pulse: 'bg-emerald-400', label: 'Online',  text: 'text-emerald-400' },
    recent:  { dot: 'bg-amber-400',   pulse: '',               label: 'Recent',  text: 'text-amber-400' },
    offline: { dot: 'bg-slate-600',   pulse: '',               label: 'Offline', text: 'text-slate-500' },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {cfg.pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.pulse} opacity-60`} />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
      </span>
      {showLabel && <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminDashboard: React.FC<Props> = ({ activeTab = 'admin-overview', setActiveTab }) => {
  // Derive current tab from activeTab prop
  const tab = activeTab.replace('admin-', '') || 'overview';

  const [managers, setManagers] = useState<ManagerStat[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subToast, setSubToast] = useState<string | null>(null);
  const showSubToast = (m: string) => { setSubToast(m); setTimeout(() => setSubToast(null), 3000); };
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlineMap, setOnlineMap] = useState<Record<string, { status: OnlineStatus; updatedAt: string | null }>>({});
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [custLoading, setCustLoading] = useState(false);
  const [actLoading, setActLoading] = useState(false);
  const [expandedMgr, setExpandedMgr] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, Customer[]>>({});
  const [searchMgr, setSearchMgr] = useState('');
  const [searchCust, setSearchCust] = useState('');
  const [searchAct, setSearchAct] = useState('');
  const [custFilter, setCustFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [actFilter, setActFilter] = useState<ActivityEntry['type'] | 'all'>('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [mgrSort, setMgrSort] = useState<{ key: keyof ManagerStat; dir: 1 | -1 }>({ key: 'user_count', dir: -1 });

  // ── Subscriptions ───────────────────────────────────────────────────────────
  const loadSubscriptions = useCallback(async () => {
    setSubLoading(true);
    const { data } = await supabase.from('manager_subscriptions').select('*').order('created_at', { ascending: false });
    if (data) setSubscriptions(data);
    setSubLoading(false);
  }, []);
  useEffect(() => { if (tab === 'subscriptions') loadSubscriptions(); }, [tab, loadSubscriptions]);

  const updateSubscription = async (managerId: string, updates: any) => {
    const { error } = await supabase.from('manager_subscriptions').upsert({ manager_id: managerId, ...updates }, { onConflict: 'manager_id' });
    if (!error) { await loadSubscriptions(); showSubToast('✅ Updated: ' + managerId); }
    else showSubToast('❌ Error: ' + error.message);
  };

  // ── Managers ────────────────────────────────────────────────────────────────
  const loadManagers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_manager_stats');
      if (error) throw error;
      setManagers(data || []);
      setLastRefresh(new Date());
    } catch (err) { console.error('Admin stats load error:', err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadManagers(); }, [loadManagers]);
  useEffect(() => {
    const map: Record<string, { status: OnlineStatus; updatedAt: string | null }> = {};
    for (const m of managers) map[m.username] = { status: getOnlineStatus(m.data_updated_at), updatedAt: m.data_updated_at };
    setOnlineMap(map);
  }, [managers]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('admin-manager-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manager_data' }, (payload) => {
        const row = payload.new as any;
        if (!row?.manager_id) return;
        const username = row.manager_id; const updatedAt = row.updated_at || null;
        setOnlineMap(prev => ({ ...prev, [username]: { status: getOnlineStatus(updatedAt), updatedAt } }));
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')
          setManagers(prev => prev.map(m => m.username !== username ? m : { ...m, data_updated_at: updatedAt }));
        if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as any)?.manager_id;
          if (deletedId) setManagers(prev => prev.filter(m => m.username !== deletedId));
        }
      })
      .subscribe((status) => setRealtimeActive(status === 'SUBSCRIBED'));
    const ticker = setInterval(() => {
      setOnlineMap(prev => {
        const u = { ...prev };
        for (const k of Object.keys(u)) u[k] = { ...u[k], status: getOnlineStatus(u[k].updatedAt) };
        return u;
      });
    }, 60_000);
    return () => { supabase.removeChannel(channel); clearInterval(ticker); };
  }, []);

  // ── Load All Customers ──────────────────────────────────────────────────────
  const loadAllCustomers = useCallback(async () => {
    setCustLoading(true);
    try {
      const all: Customer[] = [];
      for (const mgr of managers) {
        const { data } = await supabase.rpc('get_manager_customers', { p_username: mgr.username });
        if (data && Array.isArray(data)) all.push(...data.map((c: Customer) => ({ ...c, managerUsername: mgr.username, managerBusiness: mgr.business_name })));
      }
      setAllCustomers(all);
    } catch (err) { console.error(err); }
    finally { setCustLoading(false); }
  }, [managers]);
  useEffect(() => { if (tab === 'customers' && allCustomers.length === 0 && managers.length > 0) loadAllCustomers(); }, [tab, managers, allCustomers.length, loadAllCustomers]);

  // ── Load Activity ───────────────────────────────────────────────────────────
  const loadActivityLogs = useCallback(async () => {
    setActLoading(true);
    try {
      const logs: ActivityEntry[] = [];
      const { data: rows } = await supabase.from('manager_data').select('manager_id, data, updated_at');
      if (rows) {
        for (const row of rows) {
          const mgr = managers.find(m => m.username === row.manager_id);
          const bizName = mgr?.business_name || row.manager_id;
          const d = row.data as any;
          if (d?.activityLog && Array.isArray(d.activityLog))
            for (const e of d.activityLog) logs.push({ managerUsername: row.manager_id, managerBusiness: bizName, action: e.action || e.description || 'Activity', details: e.details || e.info, timestamp: e.timestamp || e.time || e.date || '', type: detectType(e.action || '') });
          const mgrStat = managers.find(m => m.username === row.manager_id);
          if (mgrStat?.last_login) logs.push({ managerUsername: row.manager_id, managerBusiness: bizName, action: 'Manager Login', timestamp: mgrStat.last_login, type: 'login' });
          if (row.updated_at) logs.push({ managerUsername: row.manager_id, managerBusiness: bizName, action: 'Data Synced to Cloud', timestamp: row.updated_at, type: 'update' });
        }
      }
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivityLogs(logs);
    } catch (err) { console.error(err); }
    finally { setActLoading(false); }
  }, [managers]);
  useEffect(() => { if (tab === 'activity' && activityLogs.length === 0 && managers.length > 0) loadActivityLogs(); }, [tab, managers, activityLogs.length, loadActivityLogs]);

  function detectType(action: string): ActivityEntry['type'] {
    const a = action.toLowerCase();
    if (a.includes('login') || a.includes('sign')) return 'login';
    if (a.includes('receipt') || a.includes('payment') || a.includes('paid')) return 'receipt';
    if (a.includes('customer') || a.includes('user') || a.includes('add') || a.includes('delete')) return 'customer';
    if (a.includes('update') || a.includes('edit') || a.includes('sync')) return 'update';
    if (a.includes('system') || a.includes('backup') || a.includes('restore')) return 'system';
    return 'other';
  }

  const toggleExpand = async (username: string) => {
    if (expandedMgr === username) { setExpandedMgr(null); return; }
    setExpandedMgr(username);
    if (!expandedCustomers[username]) {
      try { const { data } = await supabase.rpc('get_manager_customers', { p_username: username }); setExpandedCustomers(prev => ({ ...prev, [username]: data || [] })); }
      catch (err) { console.error(err); }
    }
  };

  const handleDelete = async (username: string) => {
    setManagers(prev => prev.filter(m => m.username !== username));
    setShowDeleteConfirm(null); setDeleteConfirmText('');
    try { await supabase.rpc('admin_delete_manager', { p_username: username }); } catch { }
    const { error: delError } = await supabase.from('manager_data').delete().eq('manager_id', username);
    if (delError) { console.error('Delete error:', delError.message); }
    try { await supabase.from('manager_subscriptions').delete().eq('manager_id', username); } catch { }
    removeAccount(username);
    localStorage.removeItem(`myisp_data_${username}`);
    await loadManagers();
  };

  const handleReset = async () => {
    if (!showResetModal || !newPassword.trim() || newPassword.length < 6) return;
    setResetMsg(null);
    try {
      const { data, error } = await supabase.rpc('admin_reset_manager_password', { p_username: showResetModal, p_new_password: newPassword.trim() });
      if (error || (data && !data.success)) { setResetMsg({ ok: false, text: error?.message || data?.error || 'Failed' }); return; }
    } catch (e: any) { setResetMsg({ ok: false, text: e.message }); return; }
    const accs = getAccounts();
    const existing = accs.find((a: any) => a.username === showResetModal);
    if (existing) saveAccount({ ...existing, password: newPassword.trim() });
    setResetMsg({ ok: true, text: 'Password updated successfully!' });
    setTimeout(() => { setShowResetModal(null); setNewPassword(''); setResetMsg(null); }, 1500);
  };

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    managers: managers.length,
    customers: managers.reduce((s, m) => s + m.user_count, 0),
    active: managers.reduce((s, m) => s + m.active_count, 0),
    revenue: managers.reduce((s, m) => s + Number(m.total_revenue), 0),
    balance: managers.reduce((s, m) => s + Number(m.total_balance), 0),
    receipts: managers.reduce((s, m) => s + m.receipt_count, 0),
  }), [managers]);

  const activePct = totals.customers > 0 ? Math.round(totals.active / totals.customers * 100) : 0;
  const onlineCount = Object.values(onlineMap).filter(v => v.status === 'online').length;

  const sortedManagers = useMemo(() => {
    if (!searchMgr.trim()) return [...managers].sort((a, b) => {
      const av = a[mgrSort.key] as any; const bv = b[mgrSort.key] as any;
      return (typeof av === 'number' ? (av - bv) : String(av).localeCompare(String(bv))) * mgrSort.dir;
    });
    const q = searchMgr.toLowerCase();
    return managers.filter(m => m.username.toLowerCase().includes(q) || m.business_name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q));
  }, [managers, searchMgr, mgrSort]);

  const filteredCusts = useMemo(() => {
    let l = custFilter !== 'all' ? allCustomers.filter(c => c.status === custFilter) : allCustomers;
    if (searchCust.trim()) { const q = searchCust.toLowerCase(); l = l.filter(c => c.name?.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q) || (c.phone || '').includes(q) || c.plan?.toLowerCase().includes(q) || c.managerBusiness?.toLowerCase().includes(q)); }
    return l;
  }, [allCustomers, custFilter, searchCust]);

  const filteredAct = useMemo(() => {
    let l = actFilter !== 'all' ? activityLogs.filter(a => a.type === actFilter) : activityLogs;
    if (searchAct.trim()) { const q = searchAct.toLowerCase(); l = l.filter(a => a.managerBusiness.toLowerCase().includes(q) || a.managerUsername.toLowerCase().includes(q) || a.action.toLowerCase().includes(q)); }
    return l;
  }, [activityLogs, actFilter, searchAct]);

  const sortCol = (key: keyof ManagerStat) => setMgrSort(prev => prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: -1 });
  const doRefresh = () => { loadManagers(); setAllCustomers([]); setActivityLogs([]); };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER — No custom sidebar, just content area (Layout sidebar handles nav)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Refresh + Live status row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <span className={`w-2 h-2 rounded-full ${realtimeActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{realtimeActive ? 'Live' : 'Connecting'}</span>
            <span className="text-[10px] font-bold text-slate-600 ml-1">· {onlineCount} online · synced {lastRefresh.toLocaleTimeString('en-PK', { timeStyle: 'short' })}</span>
          </div>
        </div>
        <button onClick={doRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
          <RefreshCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex items-center justify-center py-24 gap-3">
          <div className="w-7 h-7 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 font-bold text-sm">Supabase se live data load ho raha hai...</span>
        </div>
      )}

      {/* ══════════ OVERVIEW ══════════ */}
      {!loading && tab === 'overview' && (
        <div className="space-y-5">
          {/* KPI Cards — same style as manager Dashboard */}
          <div className="grid grid-cols-1 gap-4">
            <KpiCard icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
              label="Managers" value={totals.managers}
              gradient="bg-gradient-to-br from-indigo-600 to-indigo-800" accent="text-indigo-300" />
            <KpiCard icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
              label="Total Customers" value={totals.customers} valColor="text-blue-200"
              gradient="bg-gradient-to-br from-blue-700 to-blue-900" accent="text-blue-300" />
            <KpiCard icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              label="Active" value={totals.active} sub={`${activePct}% of total`}
              gradient="bg-gradient-to-br from-emerald-600 to-green-800" valColor="text-emerald-200"
              accent="text-emerald-300" pct={activePct} />
            <KpiCard icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              label="Expired" value={totals.customers - totals.active}
              gradient="bg-gradient-to-br from-rose-700 to-rose-900" valColor="text-rose-200"
              accent="text-rose-300" />
            <KpiCard icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
              label="Total Revenue" value={`Rs.${(totals.revenue / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.revenue.toLocaleString()}`}
              gradient="bg-gradient-to-br from-amber-600 to-orange-800" valColor="text-amber-200"
              accent="text-amber-300" />
            <KpiCard icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              label="Pending Dues" value={`Rs.${(totals.balance / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.balance.toLocaleString()}`}
              gradient="bg-gradient-to-br from-orange-600 to-red-800" valColor="text-orange-200"
              accent="text-orange-300" />
          </div>

          {/* Health bar */}
          <div className="bg-slate-800/60 backdrop-blur-sm rounded-3xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Wifi className="w-4 h-4 text-indigo-400" /> Network Health
              </span>
              <span className="text-sm font-black text-white">{activePct}% Active</span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-emerald-500 to-emerald-400 rounded-full transition-all duration-1000"
                style={{ width: `${activePct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11px] font-bold text-slate-500">
              <span className="text-emerald-400">{totals.active} active</span>
              <span>·</span>
              <span className="flex items-center gap-1"><OnlineDot status="online" /> {onlineCount} online</span>
              <span>·</span>
              <span>{totals.receipts} receipts</span>
              <span>·</span>
              <span>{totals.managers} managers</span>
            </div>
          </div>

          {/* Summary Table */}
          <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.05]">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2"><ClipboardList className="w-4 h-4 text-indigo-400" /> All Managers</h3>
              <button onClick={() => setActiveTab?.('admin-managers')} className="text-[11px] text-indigo-400 font-bold hover:text-indigo-300">View All →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-slate-900/50">
                  {['Manager','Customers','Active','Revenue','Dues','Last Login'].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>{managers.map(m => (
                  <tr key={m.username} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-indigo-300 font-black text-xs bg-gradient-to-br from-indigo-900 to-indigo-800">
                            {m.business_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5"><OnlineDot status={onlineMap[m.username]?.status || 'offline'} /></span>
                        </div>
                        <div>
                          <p className="font-black text-white text-[12px]">{m.business_name}</p>
                          <p className="text-[10px] text-slate-500">@{m.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-black text-slate-200">{m.user_count}</td>
                    <td className="px-5 py-3.5 font-black text-emerald-400">{m.active_count}</td>
                    <td className="px-5 py-3.5 font-black text-amber-400">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-black">{Number(m.total_balance) > 0 ? <span className="text-rose-400">Rs. {Number(m.total_balance).toLocaleString()}</span> : <span className="text-slate-700">—</span>}</td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500 whitespace-nowrap">{timeAgo(m.last_login)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {managers.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">Koi manager nahi</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MANAGERS ══════════ */}
      {!loading && tab === 'managers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" placeholder="Search manager..." value={searchMgr} onChange={e => setSearchMgr(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/[0.06] bg-slate-800/60 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-sm" />
            </div>
            <div className="flex gap-1 bg-slate-800/60 border border-white/[0.06] rounded-2xl p-1">
              {[{ key: 'user_count', label: 'Customers' }, { key: 'total_revenue', label: 'Revenue' }, { key: 'last_login', label: 'Login' }].map(s => (
                <button key={s.key} onClick={() => sortCol(s.key as keyof ManagerStat)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${mgrSort.key === s.key ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {s.label} {mgrSort.key === s.key ? (mgrSort.dir === -1 ? '↓' : '↑') : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {sortedManagers.map(m => (
              <div key={m.username} className="bg-slate-800/60 backdrop-blur-sm rounded-3xl border border-white/[0.06] overflow-hidden hover:border-indigo-500/30 transition-all">
                <div className="flex items-center gap-3 p-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-indigo-300 text-lg bg-gradient-to-br from-indigo-900 to-indigo-800">
                      {m.business_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5"><OnlineDot status={onlineMap[m.username]?.status || 'offline'} /></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <p className="font-black text-white text-[15px]">{m.business_name}</p>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                      <span className="font-black text-indigo-400">@{m.username}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(m.last_login)}</span>
                      <OnlineDot status={onlineMap[m.username]?.status || 'offline'} showLabel />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setShowResetModal(m.username); setNewPassword(''); setResetMsg(null); }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-indigo-500/15 hover:text-indigo-400 transition-all">
                      <Key className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setShowDeleteConfirm(m.username); setDeleteConfirmText(''); }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleExpand(m.username)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-white transition-all">
                      {expandedMgr === m.username ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 px-4 pb-3">
                  <StatChip label="customers" value={m.user_count} color="text-blue-300" />
                  <StatChip label="active" value={m.active_count} color="text-emerald-400" />
                  <StatChip label="revenue" value={`${(Number(m.total_revenue)/1000).toFixed(0)}K`} color="text-amber-400" />
                  {Number(m.total_balance) > 0 && <StatChip label="due" value={`${(Number(m.total_balance)/1000).toFixed(0)}K`} color="text-rose-400" />}
                </div>
                {expandedMgr === m.username && (
                  <div className="border-t border-white/[0.04]">
                    <div className="px-5 py-3 flex items-center gap-2 border-b border-white/[0.04]">
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{m.user_count} Customers</span>
                    </div>
                    {!expandedCustomers[m.username] ? (
                      <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-500 text-xs">Loading...</span></div>
                    ) : expandedCustomers[m.username].length === 0 ? (
                      <p className="px-5 py-8 text-center text-slate-600 text-xs">Koi customer nahi</p>
                    ) : (
                      <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-900 z-10 border-b border-white/[0.04]">
                            <tr>{['#','Name','Plan','Monthly','Balance','Expiry','Status'].map(h => (
                              <th key={h} className="text-left px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>{expandedCustomers[m.username].map((c, idx) => (
                            <tr key={c.id || idx} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                              <td className="px-4 py-2.5 text-slate-600 font-bold">{idx+1}</td>
                              <td className="px-4 py-2.5"><p className="font-bold text-slate-200 whitespace-nowrap">{c.name}</p><p className="text-[10px] text-slate-500">@{c.username}</p></td>
                              <td className="px-4 py-2.5 text-slate-400">{c.plan}</td>
                              <td className="px-4 py-2.5 font-bold text-amber-400 whitespace-nowrap">Rs. {(c.monthlyFee||0).toLocaleString()}</td>
                              <td className="px-4 py-2.5 font-bold whitespace-nowrap">{c.balance>0 ? <span className="text-rose-400">Rs. {c.balance.toLocaleString()}</span> : <span className="text-slate-700">—</span>}</td>
                              <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                              <td className="px-4 py-2.5"><Badge color={c.status==='active' ? 'bg-emerald-500/10 text-emerald-400' : c.status==='expired' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-500'}>{c.status}</Badge></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sortedManagers.length === 0 && <div className="text-center py-16 flex flex-col items-center text-slate-600"><Inbox className="w-12 h-12 mb-3" /><p className="font-bold text-sm">Koi manager nahi mila</p></div>}
          </div>
        </div>
      )}

      {/* ══════════ ALL CUSTOMERS ══════════ */}
      {!loading && tab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" placeholder="Name, username, phone, plan, manager..." value={searchCust} onChange={e => setSearchCust(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/[0.06] bg-slate-800/60 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-1 bg-slate-800/60 border border-white/[0.06] rounded-2xl p-1">
              {(['all','active','expired'] as const).map(f => (
                <button key={f} onClick={() => setCustFilter(f)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${custFilter===f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {f} ({f==='all' ? allCustomers.length : allCustomers.filter(c=>c.status===f).length})
                </button>
              ))}
            </div>
            {allCustomers.length === 0 && !custLoading && (
              <button onClick={loadAllCustomers} className="px-5 py-3 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95">Load Customers</button>
            )}
          </div>
          {custLoading ? (
            <div className="flex items-center justify-center py-24 gap-3"><div className="w-6 h-6 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho rahe hain...</span></div>
          ) : (
            <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <h3 className="font-black text-white text-[13px] flex items-center gap-2"><Users className="w-4 h-4 text-indigo-400" /> Customer Directory</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase">{filteredCusts.length} shown</p>
              </div>
              <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900 z-10 border-b border-white/[0.04]">
                    <tr>{['#','Customer','Manager','Plan','Monthly','Balance','Expiry','Status'].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 font-black text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filteredCusts.length === 0 ? (
                      <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-600">{allCustomers.length === 0 ? 'Click "Load Customers"' : 'Koi result nahi'}</td></tr>
                    ) : filteredCusts.map((c, i) => (
                      <tr key={`${c.id}-${i}`} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 text-slate-700 font-black">{i+1}</td>
                        <td className="px-5 py-3"><p className="font-black text-slate-200 whitespace-nowrap">{c.name}</p><p className="text-[10px] text-slate-500">@{c.username}{c.phone ? ` · ${c.phone}` : ''}</p></td>
                        <td className="px-5 py-3"><p className="font-bold text-slate-300">{c.managerBusiness}</p><p className="text-[10px] text-slate-600">@{c.managerUsername}</p></td>
                        <td className="px-5 py-3 text-slate-400">{c.plan}</td>
                        <td className="px-5 py-3 font-black text-amber-400 whitespace-nowrap">Rs. {(c.monthlyFee||0).toLocaleString()}</td>
                        <td className="px-5 py-3 font-black whitespace-nowrap">{c.balance>0?<span className="text-rose-400">Rs. {c.balance.toLocaleString()}</span>:<span className="text-slate-700">—</span>}</td>
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                        <td className="px-5 py-3"><Badge color={c.status==='active' ? 'bg-emerald-500/10 text-emerald-400' : c.status==='expired' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-500'}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ ACTIVITY ══════════ */}
      {!loading && tab === 'activity' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" placeholder="Manager ya action..." value={searchAct} onChange={e => setSearchAct(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/[0.06] bg-slate-800/60 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-1 bg-slate-800/60 border border-white/[0.06] rounded-2xl p-1 flex-wrap">
              {(['all','login','receipt','customer','update','system'] as const).map(f => (
                <button key={f} onClick={() => setActFilter(f)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${actFilter===f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {f === 'all' ? `All (${activityLogs.length})` : f}
                </button>
              ))}
            </div>
            {activityLogs.length === 0 && !actLoading && (
              <button onClick={loadActivityLogs} className="px-5 py-3 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95">Load Logs</button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2">
            {([{ type:'login',color:'text-blue-400' },{ type:'receipt',color:'text-emerald-400' },{ type:'customer',color:'text-purple-400' },{ type:'update',color:'text-amber-400' },{ type:'system',color:'text-slate-400' },{ type:'other',color:'text-slate-500' }] as const).map(s=>(
              <div key={s.type} onClick={() => setActFilter(s.type)}
                className="bg-slate-800/60 rounded-2xl border border-white/[0.06] p-3 text-center cursor-pointer hover:border-indigo-500/30 transition-all">
                <p className={`text-xl font-black ${s.color}`}>{activityLogs.filter(a=>a.type===s.type).length}</p>
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-wider">{s.type}</p>
              </div>
            ))}
          </div>
          {actLoading ? (
            <div className="flex items-center justify-center py-24 gap-3"><div className="w-6 h-6 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho rahe hain...</span></div>
          ) : (
            <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <h3 className="font-black text-white text-[13px] flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-400" /> Activity Timeline</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase">{filteredAct.length} events</p>
              </div>
              <div className="max-h-[65vh] overflow-y-auto divide-y divide-white/[0.03]">
                {filteredAct.length === 0 ? (
                  <div className="text-center py-16 text-slate-600 flex flex-col items-center gap-3"><Activity className="w-12 h-12" /><p className="font-bold text-sm">{activityLogs.length === 0 ? 'Click "Load Logs"' : 'Koi activity nahi'}</p></div>
                ) : filteredAct.map((log, i) => {
                  const cfg = activityTypeConfig[log.type];
                  return (
                    <div key={i} className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className={`w-7 h-7 rounded-xl ${cfg.bg} ${cfg.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>{cfg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-bold text-slate-200">{log.action}</p>
                          <p className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(log.timestamp)}</p>
                        </div>
                        <span className="text-[11px] text-indigo-400 font-bold">@{log.managerUsername}</span>
                        <span className="text-[11px] text-slate-600"> · {log.managerBusiness}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ SYSTEM ══════════ */}
      {!loading && tab === 'system' && (
        <div className="space-y-4 max-w-3xl">
          <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] p-5 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2"><Server className="w-4 h-4 text-indigo-400" /> Database Stats</h3>
              <div className="flex gap-2">
                <button onClick={async () => {
                  try {
                    const { data } = await supabase.from('manager_data').select('*');
                    const blob = new Blob([JSON.stringify({ databaseDump: data, timestamp: new Date().toISOString() }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href=url; a.download=`MYISP_Backup_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                  } catch(e:any) { alert('Backup failed: '+e?.message); }
                }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-black text-[11px] uppercase tracking-wider transition-all active:scale-95">
                  <Download className="w-3.5 h-3.5" /> Backup
                </button>
                <label className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 cursor-pointer rounded-xl text-slate-300 font-black text-[11px] uppercase tracking-wider transition-all border border-white/[0.06]">
                  <Upload className="w-3.5 h-3.5" /> Restore
                  <input type="file" className="hidden" accept=".json" onChange={async(e)=>{
                    const file = e.target.files?.[0]; if(!file) return;
                    const reader = new FileReader();
                    reader.onload = async(ev)=>{
                      try {
                        const json = JSON.parse(ev.target?.result as string);
                        if(json.databaseDump&&Array.isArray(json.databaseDump)){
                          const{error}=await supabase.from('manager_data').upsert(json.databaseDump,{onConflict:'manager_id'});
                          if(error) throw error;
                          alert('✅ Restored!'); window.location.reload();
                        } else alert('Invalid backup file.');
                      } catch(e:any) { alert('Restore failed: '+e?.message); }
                    };
                    reader.readAsText(file);
                  }} />
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label:'Managers', value:totals.managers, color:'text-indigo-300' },
                { label:'Customers', value:totals.customers, color:'text-blue-300' },
                { label:'Active', value:totals.active, color:'text-emerald-400' },
                { label:'Receipts', value:totals.receipts, color:'text-purple-300' },
                { label:'Revenue', value:`Rs. ${totals.revenue.toLocaleString()}`, color:'text-amber-400' },
                { label:'Pending Dues', value:`Rs. ${totals.balance.toLocaleString()}`, color:'text-rose-400' },
              ].map(item => (
                <div key={item.label} className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4">
                  <p className="text-slate-500 font-black uppercase tracking-wider text-[10px] mb-2">{item.label}</p>
                  <p className={`font-black text-xl ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-400" /> Manager Accounts</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-900/50">
                  {['Username','Business','Joined','Last Login','Customers','Revenue'].map(h=>(
                    <th key={h} className="text-left px-5 py-3.5 font-black text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>{managers.map(m=>(
                  <tr key={m.username} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-black text-indigo-400">@{m.username}</td>
                    <td className="px-5 py-3.5 font-black text-slate-200">{m.business_name}</td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{fmtDate(m.joined_at)}</td>
                    <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">{fmtTime(m.last_login)}</td>
                    <td className="px-5 py-3.5 font-bold text-blue-300">{m.user_count}</td>
                    <td className="px-5 py-3.5 font-bold text-amber-400">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ SUBSCRIPTIONS ══════════ */}
      {tab === 'subscriptions' && (
        <div className="space-y-4">
          {subToast && <div className="fixed top-20 right-4 z-50 px-5 py-3 rounded-2xl bg-slate-800 border border-white/10 shadow-2xl text-sm font-black text-white">{subToast}</div>}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-[11px] text-slate-500">Har manager ka plan, status aur access control karein</p>
            <button onClick={loadSubscriptions}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95">
              <RefreshCcw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:'Trial',   color:'text-amber-400',   grad:'from-amber-900/40 to-amber-800/20', count: subscriptions.filter(s=>s.status==='trial').length },
              { label:'Active',  color:'text-emerald-400', grad:'from-emerald-900/40 to-emerald-800/20', count: subscriptions.filter(s=>s.status==='active').length },
              { label:'Locked',  color:'text-rose-400',    grad:'from-rose-900/40 to-rose-800/20', count: subscriptions.filter(s=>s.status==='locked').length },
              { label:'Expired', color:'text-slate-500',   grad:'from-slate-800/40 to-slate-700/20', count: subscriptions.filter(s=>s.status==='expired').length },
            ].map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-3xl border border-white/[0.06] p-4 text-center`}>
                <p className={`text-3xl font-black ${s.color}`}>{s.count}</p>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          {managers.filter(m => !subscriptions.find(s => s.manager_id === m.username)).length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-4">
              <p className="text-amber-400 text-[12px] font-black mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> These managers are not in subscription table:</p>
              <div className="flex flex-wrap gap-2">
                {managers.filter(m => !subscriptions.find(s => s.manager_id === m.username)).map(m => (
                  <button key={m.username}
                    onClick={() => updateSubscription(m.username, { plan:'starter', status:'trial', trial_ends_at: new Date(Date.now()+30*86400000).toISOString() })}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-black hover:bg-amber-500/20 transition-all active:scale-95">
                    + Add @{m.username}
                  </button>
                ))}
              </div>
            </div>
          )}
          {subLoading ? (
            <div className="flex items-center justify-center py-20 gap-3"><div className="w-5 h-5 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho raha hai...</span></div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-20 text-slate-600 flex flex-col items-center gap-3"><Shield className="w-12 h-12" /><p className="font-bold text-sm">Koi record nahi. Upar se add karein.</p></div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => {
                const mgr = managers.find(m => m.username === sub.manager_id);
                const statusCfg: Record<string, { color: string; bg: string; label: string }> = {
                  trial:   { color:'text-amber-400',   bg:'bg-amber-500/10 border-amber-500/30',   label:'TRIAL' },
                  active:  { color:'text-emerald-400', bg:'bg-emerald-500/10 border-emerald-500/30', label:'ACTIVE' },
                  locked:  { color:'text-rose-400',    bg:'bg-rose-500/10 border-rose-500/30',     label:'LOCKED' },
                  expired: { color:'text-slate-500',   bg:'bg-slate-500/10 border-slate-500/30',   label:'EXPIRED' },
                };
                const sc = statusCfg[sub.status] || statusCfg.trial;
                const planColors: Record<string,string> = { starter:'text-indigo-400', business:'text-purple-400', enterprise:'text-cyan-400' };
                return (
                  <div key={sub.manager_id} className="bg-slate-800/60 rounded-3xl border border-white/[0.06] p-5 hover:border-indigo-500/30 transition-all">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-indigo-300 font-black text-sm flex-shrink-0 bg-gradient-to-br from-indigo-900 to-indigo-800">
                          {(mgr?.business_name || sub.manager_id).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-indigo-400 text-sm">@{sub.manager_id}</p>
                          {mgr && <p className="text-[11px] text-slate-400">{mgr.business_name}</p>}
                          {sub.trial_ends_at && sub.status==='trial' && <p className="text-[10px] text-amber-500 font-black mt-0.5">Trial ends: {fmtDate(sub.trial_ends_at)}</p>}
                          {sub.notes && <p className="text-[10px] text-slate-600 mt-0.5 italic">"{sub.notes}"</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 ${planColors[sub.plan]||'text-slate-400'}`}>{sub.plan}</span>
                        {sub.amount_pkr > 0 && <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">Rs. {sub.amount_pkr.toLocaleString()}/mo</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.04]">
                      <select value={sub.plan} onChange={e => updateSubscription(sub.manager_id, { plan: e.target.value })}
                        className="px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[11px] font-black text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                        <option value="starter">Starter</option>
                        <option value="business">Business</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                      {sub.status!=='active' && <button onClick={()=>updateSubscription(sub.manager_id,{status:'active'})}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black hover:bg-emerald-500/20 transition-all flex items-center gap-1 active:scale-95">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>}
                      {sub.status!=='trial' && <button onClick={()=>updateSubscription(sub.manager_id,{status:'trial',trial_ends_at:new Date(Date.now()+30*86400000).toISOString()})}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-black hover:bg-amber-500/20 transition-all flex items-center gap-1 active:scale-95">
                        <Clock className="w-3.5 h-3.5" /> Trial Reset
                      </button>}
                      {sub.status!=='locked' ? <button onClick={()=>updateSubscription(sub.manager_id,{status:'locked'})}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] font-black hover:bg-rose-500/20 transition-all flex items-center gap-1 active:scale-95">
                        <XCircle className="w-3.5 h-3.5" /> Lock
                      </button> : <button onClick={()=>updateSubscription(sub.manager_id,{status:'active'})}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black hover:bg-emerald-500/20 transition-all flex items-center gap-1 active:scale-95">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Unlock
                      </button>}
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px] text-slate-600 font-bold">Rs.</span>
                        <input type="number" placeholder="Amount/mo" defaultValue={sub.amount_pkr||''}
                          onBlur={e=>{const val=parseInt(e.target.value)||0; if(val!==sub.amount_pkr) updateSubscription(sub.manager_id,{amount_pkr:val});}}
                          className="w-24 px-2 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[11px] font-black text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                    <input type="text" placeholder="Notes — Enter se save hoga" defaultValue={sub.notes||''}
                      onKeyDown={e=>{if(e.key==='Enter'){updateSubscription(sub.manager_id,{notes:(e.target as HTMLInputElement).value});(e.target as HTMLInputElement).blur();}}}
                      className="w-full mt-2 px-3 py-2 rounded-xl bg-black/20 border border-white/[0.05] text-[11px] text-slate-500 placeholder-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ RESET PASSWORD MODAL ══════════ */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={()=>{setShowResetModal(null);setResetMsg(null);}} />
          <div className="relative z-10 w-full max-w-sm bg-slate-900 rounded-3xl shadow-2xl border border-white/[0.08] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 flex items-center justify-center"><Key className="w-5 h-5 text-indigo-400" /></div>
              <div><h2 className="text-lg font-black text-white">Reset Password</h2><p className="text-[11px] text-slate-500">@{showResetModal}</p></div>
            </div>
            <input type="text" placeholder="Naya password (min 6 chars)" value={newPassword} onChange={e=>setNewPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleReset()}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 mb-3" />
            {newPassword.length>0&&newPassword.length<6&&<p className="text-[11px] text-amber-400 font-bold flex items-center gap-1 mb-3"><AlertTriangle className="w-3.5 h-3.5" /> Min 6 chars</p>}
            {resetMsg&&<p className={`text-[11px] font-bold flex items-center gap-1 mb-3 ${resetMsg.ok?'text-emerald-400':'text-rose-400'}`}>{resetMsg.ok?<CheckCircle2 className="w-3.5 h-3.5" />:<XCircle className="w-3.5 h-3.5" />}{resetMsg.text}</p>}
            <div className="flex gap-2">
              <button onClick={()=>{setShowResetModal(null);setNewPassword('');setResetMsg(null);}} className="flex-1 py-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={handleReset} disabled={!newPassword.trim()||newPassword.length<6}
                className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 disabled:opacity-30 active:scale-95 transition-all">Update Password</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ DELETE MODAL ══════════ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={()=>setShowDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm bg-slate-900 rounded-3xl shadow-2xl border border-rose-500/20 p-6 text-center">
            <div className="w-14 h-14 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4"><Trash2 className="w-7 h-7 text-rose-400" /></div>
            <h2 className="text-lg font-black text-white mb-1">Manager Delete Karein?</h2>
            <p className="inline-block text-sm font-black text-rose-400 border border-rose-500/20 bg-rose-500/5 px-3 py-1 rounded-xl mb-3">@{showDeleteConfirm}</p>
            <p className="text-xs text-slate-500 mb-4">Yeh action <span className="font-black text-rose-400">permanent</span> hai.</p>
            <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-widest font-bold">"DELETE" likhein:</p>
            <input type="text" placeholder="DELETE" value={deleteConfirmText} onChange={e=>setDeleteConfirmText(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-center font-black text-white outline-none focus:ring-2 focus:ring-rose-500 mb-5 uppercase tracking-widest" />
            <div className="flex gap-2">
              <button onClick={()=>{setShowDeleteConfirm(null);setDeleteConfirmText('');}} className="flex-1 py-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={()=>deleteConfirmText==='DELETE'&&handleDelete(showDeleteConfirm)} disabled={deleteConfirmText!=='DELETE'}
                className="flex-1 py-3 rounded-2xl bg-rose-500 text-white text-xs font-black hover:bg-rose-600 disabled:opacity-30 active:scale-95 transition-all">Confirm Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
