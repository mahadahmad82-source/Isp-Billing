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
  username: string;
  business_name: string;
  email: string;
  phone: string | null;
  role: string;
  joined_at: string;
  last_login: string;
  user_count: number;
  receipt_count: number;
  active_count: number;
  expired_count: number;
  total_revenue: number;
  total_balance: number;
  data_updated_at: string | null;
}

interface Customer {
  id: string;
  name: string;
  username: string;
  phone?: string;
  plan: string;
  monthlyFee: number;
  balance: number;
  expiryDate: string;
  status: 'active' | 'expired' | 'pending' | 'deleted';
  createdAt?: string;
  managerUsername?: string;
  managerBusiness?: string;
}

interface ActivityEntry {
  managerUsername: string;
  managerBusiness: string;
  action: string;
  details?: string;
  timestamp: string;
  type: 'login' | 'receipt' | 'customer' | 'update' | 'system' | 'other';
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

const KpiCard = ({
  icon, label, value, sub, bgClass, valColor, accent, pct
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; bgClass: string; valColor?: string; accent: string; pct?: number;
}) => (
  <div className={`rounded-2xl p-5 ${bgClass} flex flex-col justify-between shadow-sm border border-white/[0.06] relative overflow-hidden group hover:border-white/10 transition-all`}>
    <div className={`absolute top-0 left-0 w-1 h-full ${accent} rounded-l-2xl`} />
    <div className="flex items-start justify-between mb-3">
      <span className={`${accent.replace('bg-', 'text-')} opacity-80`}>{icon}</span>
      {pct !== undefined && (
        <span className="text-[10px] font-bold text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
          {pct}%
        </span>
      )}
    </div>
    <div>
      <span className={`text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 block mb-1`}>{label}</span>
      <span className={`text-[1.85rem] font-black leading-none ${valColor || 'text-white'}`}>{value}</span>
      {sub && <span className="text-[11px] text-slate-600 font-semibold block mt-1">{sub}</span>}
    </div>
  </div>
);

const TabBtn = ({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) => (
  <button onClick={onClick}
    className={`px-4 py-2 rounded-xl text-[11px] uppercase tracking-wide font-bold whitespace-nowrap transition-all flex items-center gap-2 ${active
      ? 'bg-[#5a4ff0] text-white shadow-lg shadow-indigo-500/20'
      : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'}`}>
    {children}
    {count !== undefined && (
      <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/20' : 'bg-white/5'}`}>{count}</span>
    )}
  </button>
);

const activityTypeConfig: Record<ActivityEntry['type'], { icon: React.ReactNode; color: string; bg: string }> = {
  login: { icon: <LogIn className="w-3.5 h-3.5" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  receipt: { icon: <Banknote className="w-3.5 h-3.5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  customer: { icon: <UserCheck className="w-3.5 h-3.5" />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  update: { icon: <RefreshCcw className="w-3.5 h-3.5" />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  system: { icon: <Shield className="w-3.5 h-3.5" />, color: 'text-slate-400', bg: 'bg-slate-500/10' },
  other: { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

// ─── Online Status Helper ─────────────────────────────────────────────────────
type OnlineStatus = 'online' | 'recent' | 'offline';

const getOnlineStatus = (updatedAt: string | null): OnlineStatus => {
  if (!updatedAt) return 'offline';
  const diff = Date.now() - new Date(updatedAt).getTime();
  if (diff < 5 * 60 * 1000) return 'online';     // < 5 min
  if (diff < 30 * 60 * 1000) return 'recent';    // < 30 min
  return 'offline';
};

const OnlineDot = ({ status, showLabel = false }: { status: OnlineStatus; showLabel?: boolean }) => {
  const cfg = {
    online: { dot: 'bg-emerald-400 shadow-emerald-400/60', pulse: 'bg-emerald-400', label: 'Online', text: 'text-emerald-400' },
    recent: { dot: 'bg-amber-400 shadow-amber-400/40', pulse: '', label: 'Recent', text: 'text-amber-400' },
    offline: { dot: 'bg-slate-600', pulse: '', label: 'Offline', text: 'text-slate-500' },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.pulse} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot} shadow-sm`} />
      </span>
      {showLabel && <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState<'overview' | 'managers' | 'customers' | 'activity' | 'system'>('overview');
  const [managers, setManagers] = useState<ManagerStat[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityEntry[]>([]);
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

  // ── Load managers ────────────────────────────────────────────────────────────
  const loadManagers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_manager_stats');
      if (error) throw error;
      setManagers(data || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Admin stats load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadManagers(); }, [loadManagers]);

  // ── Build online map when managers change ────────────────────────────────────
  useEffect(() => {
    const map: Record<string, { status: OnlineStatus; updatedAt: string | null }> = {};
    for (const m of managers) {
      map[m.username] = {
        status: getOnlineStatus(m.data_updated_at),
        updatedAt: m.data_updated_at,
      };
    }
    setOnlineMap(map);
  }, [managers]);

  // ── Supabase Realtime subscription ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-manager-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'manager_data' },
        (payload) => {
          const row = payload.new as any;
          if (!row?.manager_id) return;
          const username = row.manager_id;
          const updatedAt = row.updated_at || null;
          const status = getOnlineStatus(updatedAt);
          // Update online map live
          setOnlineMap(prev => ({
            ...prev,
            [username]: { status, updatedAt },
          }));
          // Also update manager stats if we have them
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setManagers(prev => prev.map(m => {
              if (m.username !== username) return m;
              return { ...m, data_updated_at: updatedAt };
            }));
          }
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.manager_id;
            if (deletedId) setManagers(prev => prev.filter(m => m.username !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        setRealtimeActive(status === 'SUBSCRIBED');
      });

    // Refresh online statuses every minute
    const ticker = setInterval(() => {
      setOnlineMap(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = { ...updated[key], status: getOnlineStatus(updated[key].updatedAt) };
        }
        return updated;
      });
    }, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(ticker);
    };
  }, []);

  // ── Load all customers ───────────────────────────────────────────────────────
  const loadAllCustomers = useCallback(async () => {
    setCustLoading(true);
    try {
      const allCusts: Customer[] = [];
      for (const mgr of managers) {
        const { data } = await supabase.rpc('get_manager_customers', { p_username: mgr.username });
        if (data && Array.isArray(data)) {
          allCusts.push(...data.map((c: Customer) => ({
            ...c, managerUsername: mgr.username, managerBusiness: mgr.business_name,
          })));
        }
      }
      setAllCustomers(allCusts);
    } catch (err) {
      console.error('Load all customers error:', err);
    } finally {
      setCustLoading(false);
    }
  }, [managers]);

  useEffect(() => {
    if (tab === 'customers' && allCustomers.length === 0 && managers.length > 0) loadAllCustomers();
  }, [tab, managers, allCustomers.length, loadAllCustomers]);

  // ── Load activity logs ───────────────────────────────────────────────────────
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
          // From activityLog array in manager data
          if (d?.activityLog && Array.isArray(d.activityLog)) {
            for (const entry of d.activityLog) {
              logs.push({
                managerUsername: row.manager_id,
                managerBusiness: bizName,
                action: entry.action || entry.description || 'Activity',
                details: entry.details || entry.info,
                timestamp: entry.timestamp || entry.time || entry.date || '',
                type: detectType(entry.action || ''),
              });
            }
          }
          // From last_login of the manager stat
          const mgrStat = managers.find(m => m.username === row.manager_id);
          if (mgrStat?.last_login) {
            logs.push({
              managerUsername: row.manager_id,
              managerBusiness: bizName,
              action: 'Manager Login',
              timestamp: mgrStat.last_login,
              type: 'login',
            });
          }
          // From data_updated_at
          if (row.updated_at) {
            logs.push({
              managerUsername: row.manager_id,
              managerBusiness: bizName,
              action: 'Data Synced to Cloud',
              timestamp: row.updated_at,
              type: 'update',
            });
          }
        }
      }
      // Sort newest first, deduplicate
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivityLogs(logs);
    } catch (err) {
      console.error('Load activity error:', err);
    } finally {
      setActLoading(false);
    }
  }, [managers]);

  useEffect(() => {
    if (tab === 'activity' && activityLogs.length === 0 && managers.length > 0) loadActivityLogs();
  }, [tab, managers, activityLogs.length, loadActivityLogs]);

  function detectType(action: string): ActivityEntry['type'] {
    const a = action.toLowerCase();
    if (a.includes('login') || a.includes('sign')) return 'login';
    if (a.includes('receipt') || a.includes('payment') || a.includes('paid')) return 'receipt';
    if (a.includes('customer') || a.includes('user') || a.includes('add') || a.includes('delete')) return 'customer';
    if (a.includes('update') || a.includes('edit') || a.includes('sync')) return 'update';
    if (a.includes('system') || a.includes('backup') || a.includes('restore')) return 'system';
    return 'other';
  }

  // ── Expand manager ───────────────────────────────────────────────────────────
  const toggleExpand = async (username: string) => {
    if (expandedMgr === username) { setExpandedMgr(null); return; }
    setExpandedMgr(username);
    if (!expandedCustomers[username]) {
      try {
        const { data } = await supabase.rpc('get_manager_customers', { p_username: username });
        setExpandedCustomers(prev => ({ ...prev, [username]: data || [] }));
      } catch (err) { console.error(err); }
    }
  };

  // ── Delete manager ───────────────────────────────────────────────────────────
  const handleDelete = async (username: string) => {
    // Optimistic: remove from state immediately
    setManagers(prev => prev.filter(m => m.username !== username));
    setShowDeleteConfirm(null);
    setDeleteConfirmText('');
    try {
      await supabase.rpc('admin_delete_manager', { p_username: username });
    } catch { /* ignore */ }
    // Fallback: direct delete from manager_data table
    try {
      await supabase.from('manager_data').delete().eq('manager_id', username);
    } catch { /* ignore */ }
    // localStorage cleanup
    removeAccount(username);
    localStorage.removeItem(`myisp_data_${username}`);
  };

  // ── Reset password ───────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!showResetModal || !newPassword.trim() || newPassword.length < 6) return;
    setResetMsg(null);
    try {
      const { data, error } = await supabase.rpc('admin_reset_manager_password', {
        p_username: showResetModal,
        p_new_password: newPassword.trim(),
      });
      if (error || (data && !data.success)) {
        setResetMsg({ ok: false, text: error?.message || data?.error || 'Failed' });
        return;
      }
    } catch (e: any) {
      setResetMsg({ ok: false, text: e.message });
      return;
    }
    const accs = getAccounts();
    const existing = accs.find((a: any) => a.username === showResetModal);
    if (existing) saveAccount({ ...existing, password: newPassword.trim() });
    setResetMsg({ ok: true, text: 'Password updated successfully!' });
    setTimeout(() => { setShowResetModal(null); setNewPassword(''); setResetMsg(null); }, 1500);
  };

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    managers: managers.length,
    customers: managers.reduce((s, m) => s + m.user_count, 0),
    active: managers.reduce((s, m) => s + m.active_count, 0),
    expired: managers.reduce((s, m) => s + m.expired_count, 0),
    revenue: managers.reduce((s, m) => s + Number(m.total_revenue), 0),
    balance: managers.reduce((s, m) => s + Number(m.total_balance), 0),
    receipts: managers.reduce((s, m) => s + m.receipt_count, 0),
  }), [managers]);

  // ── Sorted managers ───────────────────────────────────────────────────────────
  const sortedManagers = useMemo(() => {
    if (!searchMgr.trim()) {
      return [...managers].sort((a, b) => {
        const av = a[mgrSort.key] as any;
        const bv = b[mgrSort.key] as any;
        if (typeof av === 'number') return (av - bv) * mgrSort.dir;
        return String(av).localeCompare(String(bv)) * mgrSort.dir;
      });
    }
    const q = searchMgr.toLowerCase();
    return managers.filter(m =>
      m.username.toLowerCase().includes(q) ||
      m.business_name.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  }, [managers, searchMgr, mgrSort]);

  const filteredCusts = useMemo(() => {
    let list = allCustomers;
    if (custFilter !== 'all') list = list.filter(c => c.status === custFilter);
    if (searchCust.trim()) {
      const q = searchCust.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        c.plan?.toLowerCase().includes(q) ||
        c.managerBusiness?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allCustomers, custFilter, searchCust]);

  const filteredAct = useMemo(() => {
    let list = activityLogs;
    if (actFilter !== 'all') list = list.filter(a => a.type === actFilter);
    if (searchAct.trim()) {
      const q = searchAct.toLowerCase();
      list = list.filter(a =>
        a.managerBusiness.toLowerCase().includes(q) ||
        a.managerUsername.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activityLogs, actFilter, searchAct]);

  const sortCol = (key: keyof ManagerStat) => {
    setMgrSort(prev => prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: -1 });
  };

  // ── Active pct for progress bar ───────────────────────────────────────────────
  const activePct = totals.customers > 0 ? Math.round(totals.active / totals.customers * 100) : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1400px] mx-auto min-h-screen text-slate-300"
      style={{ background: 'linear-gradient(160deg, #08091a 0%, #0b0f1f 50%, #07091a 100%)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#5a4ff0]/20 border border-[#5a4ff0]/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#867bfb]" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Admin Control Center</h1>
          </div>
          <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-bold pl-12 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${realtimeActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {realtimeActive ? 'LIVE' : 'CONNECTING'}
            </span>
            <span>• SYNCED {lastRefresh.toLocaleTimeString()}</span>
            <span>• {totals.managers} MANAGERS</span>
            <span>• {Object.values(onlineMap).filter(v => v.status === 'online').length} ONLINE NOW</span>
          </p>
        </div>
        <button onClick={() => { loadManagers(); setAllCustomers([]); setActivityLogs([]); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5a4ff0] text-white text-[11px] uppercase tracking-widest font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
          <RefreshCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 bg-[#181d2f]/60 p-1.5 rounded-2xl border border-white/[0.05]">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>
          <BarChart2 className="w-3.5 h-3.5" /> Overview
        </TabBtn>
        <TabBtn active={tab === 'managers'} onClick={() => setTab('managers')} count={totals.managers}>
          <Users className="w-3.5 h-3.5" /> Managers
        </TabBtn>
        <TabBtn active={tab === 'customers'} onClick={() => setTab('customers')} count={totals.customers}>
          <UserCheck className="w-3.5 h-3.5" /> All Customers
        </TabBtn>
        <TabBtn active={tab === 'activity'} onClick={() => setTab('activity')}>
          <Activity className="w-3.5 h-3.5" /> Activity Logs
        </TabBtn>
        <TabBtn active={tab === 'system'} onClick={() => setTab('system')}>
          <Server className="w-3.5 h-3.5" /> System
        </TabBtn>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24 gap-3">
          <div className="w-7 h-7 border-[3px] border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 font-bold text-sm">Supabase se live data load ho raha hai...</span>
        </div>
      )}

      {/* ══════════════════════════ OVERVIEW ══════════════════════════════════ */}
      {!loading && tab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard icon={<UserCheck className="w-5 h-5" />} label="Managers" value={totals.managers}
              bgClass="bg-[#12162a]" valColor="text-white"
              accent="bg-indigo-500" />
            <KpiCard icon={<Users className="w-5 h-5" />} label="Total Customers" value={totals.customers}
              bgClass="bg-[#12162a]" valColor="text-blue-300"
              accent="bg-blue-500" />
            <KpiCard icon={<CheckCircle2 className="w-5 h-5" />} label="Active" value={totals.active}
              sub={`${activePct}% of total`}
              bgClass="bg-[#0a1e17]" valColor="text-[#2bd076]"
              accent="bg-emerald-500" pct={activePct} />
            <KpiCard icon={<XCircle className="w-5 h-5" />} label="Expired" value={totals.customers - totals.active}
              bgClass="bg-[#1e0e14]" valColor="text-[#f16775]"
              accent="bg-rose-500" />
            <KpiCard icon={<Banknote className="w-5 h-5" />} label="Total Revenue"
              value={`Rs.${(totals.revenue / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.revenue.toLocaleString()}`}
              bgClass="bg-[#1e1508]" valColor="text-[#ffb752]"
              accent="bg-amber-500" />
            <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="Pending Dues"
              value={`Rs.${(totals.balance / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.balance.toLocaleString()}`}
              bgClass="bg-[#1e1008]" valColor="text-[#ff9852]"
              accent="bg-orange-500" />
          </div>

          {/* Active pct bar */}
          <div className="bg-[#181d2f] rounded-2xl border border-white/[0.05] p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Network Health</span>
              <span className="text-[11px] font-bold text-slate-300">{activePct}% Active</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#5a4ff0] to-[#2bd076] rounded-full transition-all duration-700"
                style={{ width: `${activePct}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-slate-600 font-bold">
              <span>{totals.active} active customers</span>
              <span className="flex items-center gap-1.5">
                <OnlineDot status="online" />
                {Object.values(onlineMap).filter(v => v.status === 'online').length} online now
              </span>
              <span className="flex items-center gap-1.5">
                <OnlineDot status="recent" />
                {Object.values(onlineMap).filter(v => v.status === 'recent').length} recently active
              </span>
              <span>{totals.receipts} receipts</span>
            </div>
          </div>

          {/* Overview managers table */}
          <div className="bg-[#181d2f] rounded-2xl border border-white/[0.05] overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/[0.04]">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#5a4ff0]" /> All Managers — Live Data
              </h3>
              <button onClick={() => setTab('managers')} className="text-[11px] text-[#5a4ff0] font-bold hover:text-indigo-300 flex items-center gap-1">
                View All <ChevronDown className="w-3 h-3 -rotate-90" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#1a1f33]">
                    {['#', 'Manager', 'Email', 'Customers', 'Active', 'Revenue', 'Dues', 'Last Login'].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 font-bold text-[#8695b0] uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m, i) => (
                    <tr key={m.username} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-4 text-slate-600 font-black">{i + 1}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[#867bfb] font-black text-xs flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg,#1e1c3a,#2a2460)' }}>
                              {m.business_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5">
                              <OnlineDot status={onlineMap[m.username]?.status || 'offline'} />
                            </span>
                          </div>
                          <div>
                            <p className="font-black text-slate-100 text-[13px]">{m.business_name}</p>
                            <p className="text-[11px] text-slate-600">@{m.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-500 text-[12px]">{m.email.replace('@myisp.local', '')}</td>
                      <td className="px-5 py-4 font-black text-slate-200">{m.user_count}</td>
                      <td className="px-5 py-4">
                        <span className="font-black text-[#2bd076]">{m.active_count}</span>
                        {m.user_count > 0 && (
                          <span className="text-[10px] text-slate-600 ml-1">
                            ({Math.round(m.active_count / m.user_count * 100)}%)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-black text-[#ffb752]">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                      <td className="px-5 py-4 font-black">{Number(m.total_balance) > 0
                        ? <span className="text-[#f16775]">Rs. {Number(m.total_balance).toLocaleString()}</span>
                        : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-5 py-4 text-[11px] text-slate-500 whitespace-nowrap">
                        <div>{fmtTime(m.last_login)}</div>
                        <div className="text-[10px] text-slate-700">{timeAgo(m.last_login)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {managers.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-600 text-sm font-medium">Koi manager nahi mila</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ MANAGERS ══════════════════════════════════ */}
      {!loading && tab === 'managers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
              <input type="text" placeholder="Search manager..."
                value={searchMgr} onChange={e => setSearchMgr(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/[0.06] bg-[#181d2f] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-[#5a4ff0]" />
            </div>
            <div className="flex gap-1 bg-[#181d2f] border border-white/[0.06] rounded-xl p-1 text-[10px]">
              {[
                { key: 'user_count', label: 'Customers' },
                { key: 'total_revenue', label: 'Revenue' },
                { key: 'last_login', label: 'Last Login' },
              ].map(s => (
                <button key={s.key} onClick={() => sortCol(s.key as keyof ManagerStat)}
                  className={`px-3 py-2 rounded-lg font-bold uppercase tracking-wider transition-all ${mgrSort.key === s.key ? 'bg-[#5a4ff0] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {s.label} {mgrSort.key === s.key ? (mgrSort.dir === -1 ? '↓' : '↑') : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {sortedManagers.map(m => (
              <div key={m.username} className="bg-[#181d2f] rounded-2xl border border-white/[0.05] overflow-hidden hover:border-white/10 transition-all">
                <div className="flex items-center gap-3 p-4">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-[#867bfb] text-lg"
                      style={{ background: 'linear-gradient(135deg,#1e1c3a,#2a2460)' }}>
                      {m.business_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <OnlineDot status={onlineMap[m.username]?.status || 'offline'} />
                    </span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <p className="font-black text-white text-[15px]">{m.business_name}</p>
                      <Badge color={m.user_count > 0 ? 'bg-[#0a1e17] text-[#2bd076] border border-emerald-500/20' : 'bg-slate-800/60 text-slate-500'}>
                        {m.user_count > 0 ? 'Active' : 'Empty'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span className="font-bold text-[#867bfb]">@{m.username}</span>
                      <span>{m.email.replace('@myisp.local', '')}</span>
                      {m.phone && <span>{m.phone}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(m.last_login)}</span>
                      <OnlineDot status={onlineMap[m.username]?.status || 'offline'} showLabel />
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="hidden md:flex flex-wrap gap-2 mr-3">
                    <StatChip label="customers" value={m.user_count} color="text-blue-300" />
                    <StatChip label="active" value={m.active_count} color="text-[#2bd076]" />
                    <StatChip label="revenue" value={`${(Number(m.total_revenue) / 1000).toFixed(0)}K`} color="text-[#ffb752]" />
                    {Number(m.total_balance) > 0 && (
                      <StatChip label="due" value={`${(Number(m.total_balance) / 1000).toFixed(0)}K`} color="text-[#f16775]" />
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setShowResetModal(m.username); setNewPassword(''); setResetMsg(null); }}
                      title="Reset Password"
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-[#5a4ff0]/15 hover:text-[#867bfb] transition-all">
                      <Key className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setShowDeleteConfirm(m.username); setDeleteConfirmText(''); }}
                      title="Delete Manager"
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleExpand(m.username)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-white transition-all">
                      {expandedMgr === m.username ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Mobile stats row */}
                <div className="flex md:hidden gap-2 px-4 pb-3 flex-wrap">
                  <StatChip label="customers" value={m.user_count} color="text-blue-300" />
                  <StatChip label="active" value={m.active_count} color="text-[#2bd076]" />
                  <StatChip label="revenue" value={`${(Number(m.total_revenue) / 1000).toFixed(0)}K`} color="text-[#ffb752]" />
                </div>

                {/* Expanded customer list */}
                {expandedMgr === m.username && (
                  <div className="border-t border-white/[0.04] bg-[#0c1020]">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span className="text-[10px] font-black text-[#8695b0] uppercase tracking-widest">
                        {m.user_count} Customers
                      </span>
                    </div>
                    {!expandedCustomers[m.username] ? (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <div className="w-4 h-4 border-2 border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
                        <span className="text-slate-500 text-xs">Loading...</span>
                      </div>
                    ) : expandedCustomers[m.username].length === 0 ? (
                      <p className="px-5 py-8 text-center text-slate-600 text-xs">Koi customer nahi</p>
                    ) : (
                      <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-[#0b0f1a] z-10 border-b border-white/[0.04]">
                            <tr>
                              {['#', 'Name', 'Username', 'Phone', 'Plan', 'Monthly', 'Balance', 'Expiry', 'Status'].map(h => (
                                <th key={h} className="text-left px-5 py-3 font-bold text-[#8695b0] uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {expandedCustomers[m.username].map((c, idx) => (
                              <tr key={c.id || idx} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                                <td className="px-5 py-2.5 text-slate-600 font-bold">{idx + 1}</td>
                                <td className="px-5 py-2.5 font-bold text-slate-200 whitespace-nowrap">{c.name}</td>
                                <td className="px-5 py-2.5 text-slate-500">@{c.username}</td>
                                <td className="px-5 py-2.5 text-slate-500">{c.phone || '—'}</td>
                                <td className="px-5 py-2.5 text-slate-400 whitespace-nowrap">{c.plan}</td>
                                <td className="px-5 py-2.5 font-bold text-[#ffb752] whitespace-nowrap">Rs. {(c.monthlyFee || 0).toLocaleString()}</td>
                                <td className="px-5 py-2.5 font-bold whitespace-nowrap">
                                  {c.balance > 0 ? <span className="text-[#f16775]">Rs. {c.balance.toLocaleString()}</span> : <span className="text-slate-700">—</span>}
                                </td>
                                <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                                <td className="px-5 py-2.5">
                                  <Badge color={c.status === 'active' ? 'bg-[#0a1e17] text-[#2bd076]' : c.status === 'expired' ? 'bg-[#1e0e14] text-[#f16775]' : 'bg-slate-800/60 text-slate-500'}>
                                    {c.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sortedManagers.length === 0 && (
              <div className="text-center py-16 flex flex-col items-center text-slate-600">
                <Inbox className="w-12 h-12 mb-3" />
                <p className="font-bold text-sm">Koi manager nahi mila</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════ ALL CUSTOMERS ════════════════════════════ */}
      {!loading && tab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48 max-w-md">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
              <input type="text" placeholder="Name, username, phone, plan, manager..."
                value={searchCust} onChange={e => setSearchCust(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/[0.06] bg-[#181d2f] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-[#5a4ff0]" />
            </div>
            <div className="flex gap-1 bg-[#181d2f] border border-white/[0.06] rounded-xl p-1">
              {(['all', 'active', 'expired'] as const).map(f => (
                <button key={f} onClick={() => setCustFilter(f)}
                  className={`px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${custFilter === f ? 'bg-[#5a4ff0] text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                  {f} ({f === 'all' ? allCustomers.length : allCustomers.filter(c => c.status === f).length})
                </button>
              ))}
            </div>
            {allCustomers.length === 0 && !custLoading && (
              <button onClick={loadAllCustomers}
                className="px-5 py-3 rounded-xl bg-[#5a4ff0] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95">
                Load Customers
              </button>
            )}
          </div>
          {custLoading ? (
            <div className="flex items-center justify-center py-24 gap-3">
              <div className="w-6 h-6 border-[3px] border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400 font-bold text-sm">Tamam customers load ho rahe hain...</span>
            </div>
          ) : (
            <div className="bg-[#181d2f] rounded-2xl border border-white/[0.05] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
                <h3 className="font-black text-white text-[13px] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#5a4ff0]" /> Customer Directory
                </h3>
                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{filteredCusts.length} shown</p>
              </div>
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#1a1f33] z-10 border-b border-white/[0.04]">
                    <tr>
                      {['#', 'Customer', 'Manager', 'Plan', 'Monthly', 'Balance', 'Expiry', 'Status'].map(h => (
                        <th key={h} className="text-left px-5 py-3.5 font-bold text-[#8695b0] uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCusts.length === 0 ? (
                      <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-600">
                        {allCustomers.length === 0 ? 'Click "Load Customers" to fetch data' : 'Koi result nahi mila'}
                      </td></tr>
                    ) : filteredCusts.map((c, i) => (
                      <tr key={`${c.id}-${i}`} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5 text-slate-700 font-black">{i + 1}</td>
                        <td className="px-5 py-3.5">
                          <p className="font-black text-slate-200 whitespace-nowrap">{c.name}</p>
                          <p className="text-[11px] text-slate-600">@{c.username}{c.phone ? ` · ${c.phone}` : ''}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-slate-300 whitespace-nowrap">{c.managerBusiness}</p>
                          <p className="text-[11px] text-slate-600">@{c.managerUsername}</p>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-400 whitespace-nowrap">{c.plan}</td>
                        <td className="px-5 py-3.5 font-black text-[#ffb752] whitespace-nowrap">Rs. {(c.monthlyFee || 0).toLocaleString()}</td>
                        <td className="px-5 py-3.5 font-black whitespace-nowrap">{c.balance > 0
                          ? <span className="text-[#f16775]">Rs. {c.balance.toLocaleString()}</span>
                          : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-[11px] text-slate-600 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                        <td className="px-5 py-3.5">
                          <Badge color={c.status === 'active' ? 'bg-[#0a1e17] text-[#2bd076]' : c.status === 'expired' ? 'bg-[#1e0e14] text-[#f16775]' : 'bg-slate-800/60 text-slate-500'}>
                            {c.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ ACTIVITY LOGS ════════════════════════════ */}
      {!loading && tab === 'activity' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
              <input type="text" placeholder="Manager ya action search..."
                value={searchAct} onChange={e => setSearchAct(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/[0.06] bg-[#181d2f] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-[#5a4ff0]" />
            </div>
            <div className="flex gap-1 bg-[#181d2f] border border-white/[0.06] rounded-xl p-1 flex-wrap">
              {(['all', 'login', 'receipt', 'customer', 'update', 'system'] as const).map(f => (
                <button key={f} onClick={() => setActFilter(f)}
                  className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${actFilter === f ? 'bg-[#5a4ff0] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {f === 'all' ? `All (${activityLogs.length})` : f}
                </button>
              ))}
            </div>
            {activityLogs.length === 0 && !actLoading && (
              <button onClick={loadActivityLogs}
                className="px-5 py-3 rounded-xl bg-[#5a4ff0] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95">
                Load Logs
              </button>
            )}
          </div>

          {actLoading ? (
            <div className="flex items-center justify-center py-24 gap-3">
              <div className="w-6 h-6 border-[3px] border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400 font-bold text-sm">Activity logs load ho rahe hain...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Stats row */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {([
                  { type: 'login', label: 'Logins', color: 'text-blue-400' },
                  { type: 'receipt', label: 'Receipts', color: 'text-emerald-400' },
                  { type: 'customer', label: 'Customers', color: 'text-purple-400' },
                  { type: 'update', label: 'Updates', color: 'text-amber-400' },
                  { type: 'system', label: 'System', color: 'text-slate-400' },
                  { type: 'other', label: 'Other', color: 'text-slate-500' },
                ] as const).map(s => (
                  <div key={s.type} className="bg-[#181d2f] rounded-xl border border-white/[0.05] p-3 text-center cursor-pointer hover:border-white/10 transition-all"
                    onClick={() => setActFilter(s.type)}>
                    <p className={`text-xl font-black ${s.color}`}>{activityLogs.filter(a => a.type === s.type).length}</p>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div className="bg-[#181d2f] rounded-2xl border border-white/[0.05] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
                  <h3 className="font-black text-white text-[13px] flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#5a4ff0]" /> Activity Timeline
                  </h3>
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{filteredAct.length} events</p>
                </div>
                <div className="max-h-[65vh] overflow-y-auto">
                  {filteredAct.length === 0 ? (
                    <div className="text-center py-16 text-slate-600 flex flex-col items-center gap-3">
                      <Activity className="w-12 h-12" />
                      <p className="font-bold text-sm">
                        {activityLogs.length === 0 ? 'Click "Load Logs" to fetch activity' : 'Koi activity nahi mili is filter ke liye'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.03]">
                      {filteredAct.map((log, i) => {
                        const cfg = activityTypeConfig[log.type];
                        return (
                          <div key={i} className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                            {/* Icon */}
                            <div className={`w-7 h-7 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                              {cfg.icon}
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-[13px] font-bold text-slate-200">{log.action}</p>
                                  {log.details && <p className="text-[11px] text-slate-600 mt-0.5">{log.details}</p>}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-[11px] text-slate-500 whitespace-nowrap">{fmtTime(log.timestamp)}</p>
                                  <p className="text-[10px] text-slate-700">{timeAgo(log.timestamp)}</p>
                                </div>
                              </div>
                              {/* Manager tag */}
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="w-4 h-4 rounded flex items-center justify-center text-[#867bfb] text-[9px] font-black"
                                  style={{ background: 'linear-gradient(135deg,#1e1c3a,#2a2460)' }}>
                                  {log.managerBusiness.charAt(0)}
                                </div>
                                <span className="text-[11px] text-slate-600">
                                  <span className="text-[#867bfb] font-bold">@{log.managerUsername}</span>
                                  {' · '}{log.managerBusiness}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ SYSTEM ════════════════════════════════════ */}
      {!loading && tab === 'system' && (
        <div className="space-y-4 max-w-3xl">
          {/* DB Stats */}
          <div className="bg-[#181d2f] rounded-2xl border border-white/[0.05] p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#5a4ff0]" /> Live Database Stats
              </h3>
              <div className="flex gap-2">
                <button onClick={async () => {
                  try {
                    const { data, error } = await supabase.from('manager_data').select('*');
                    if (error) throw error;
                    const blob = new Blob([JSON.stringify({ databaseDump: data, version: 'admin_1.0', timestamp: new Date().toISOString() }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `MYISP_Backup_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                  } catch (e: any) { alert('Backup failed: ' + e?.message); }
                }}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-[11px] uppercase tracking-widest transition-all active:scale-95">
                  <Download className="w-3.5 h-3.5" /> Backup
                </button>
                <label className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 cursor-pointer rounded-xl text-slate-300 font-bold text-[11px] uppercase tracking-widest transition-all border border-white/[0.06]">
                  <Upload className="w-3.5 h-3.5" /> Restore
                  <input type="file" className="hidden" accept=".json" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      try {
                        const json = JSON.parse(event.target?.result as string);
                        if (json.databaseDump && Array.isArray(json.databaseDump)) {
                          const { error } = await supabase.from('manager_data').upsert(json.databaseDump, { onConflict: 'manager_id' });
                          if (error) throw error;
                          alert('✅ Database restored successfully!');
                          window.location.reload();
                        } else { alert('Invalid backup file format.'); }
                      } catch (e: any) { alert('Restore failed: ' + e?.message); }
                    };
                    reader.readAsText(file);
                  }} />
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Total Managers', value: totals.managers, color: 'text-indigo-300' },
                { label: 'Total Customers', value: totals.customers, color: 'text-blue-300' },
                { label: 'Active Customers', value: totals.active, color: 'text-[#2bd076]' },
                { label: 'Total Receipts', value: totals.receipts, color: 'text-purple-300' },
                { label: 'Total Revenue', value: `Rs. ${totals.revenue.toLocaleString()}`, color: 'text-[#ffb752]' },
                { label: 'Pending Dues', value: `Rs. ${totals.balance.toLocaleString()}`, color: 'text-[#f16775]' },
              ].map(item => (
                <div key={item.label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 hover:border-white/10 transition-all">
                  <p className="text-[#8695b0] font-bold uppercase tracking-wider text-[10px] mb-2">{item.label}</p>
                  <p className={`font-black text-xl ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Manager Accounts Log */}
          <div className="bg-[#181d2f] rounded-2xl border border-white/[0.05] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04]">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#5a4ff0]" /> Manager Accounts Log
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1a1f33]">
                    {['Username', 'Business', 'Joined', 'Last Login', 'Customers', 'Revenue'].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 font-bold text-[#8695b0] uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map(m => (
                    <tr key={m.username} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 font-black text-[#867bfb]">@{m.username}</td>
                      <td className="px-5 py-3.5 font-black text-slate-200">{m.business_name}</td>
                      <td className="px-5 py-3.5 text-[11px] text-slate-600 whitespace-nowrap">{fmtDate(m.joined_at)}</td>
                      <td className="px-5 py-3.5 text-[11px] whitespace-nowrap">
                        <span className="text-slate-400">{fmtTime(m.last_login)}</span>
                        <span className="text-slate-700 ml-1">({timeAgo(m.last_login)})</span>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-blue-300">{m.user_count}</td>
                      <td className="px-5 py-3.5 font-bold text-[#ffb752]">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ RESET PASSWORD MODAL ═════════════════════ */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#050815]/85 backdrop-blur-md" onClick={() => { setShowResetModal(null); setResetMsg(null); }} />
          <div className="relative z-10 w-full max-w-sm bg-[#12162a] rounded-2xl shadow-2xl border border-white/[0.08] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#5a4ff0]/15 border border-[#5a4ff0]/20 flex items-center justify-center">
                <Key className="w-5 h-5 text-[#867bfb]" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Reset Password</h2>
                <p className="text-[11px] text-slate-500">@{showResetModal}</p>
              </div>
            </div>
            <input type="text" placeholder="Naya password (min 6 chars)" value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/30 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-[#5a4ff0] mb-3" />
            {newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-[11px] text-amber-500 font-bold flex items-center gap-1 mb-3">
                <AlertTriangle className="w-3.5 h-3.5" /> Kam az kam 6 characters chahiye
              </p>
            )}
            {resetMsg && (
              <p className={`text-[11px] font-bold flex items-center gap-1 mb-3 ${resetMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {resetMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {resetMsg.text}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowResetModal(null); setNewPassword(''); setResetMsg(null); }}
                className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={handleReset} disabled={!newPassword.trim() || newPassword.length < 6}
                className="flex-1 py-3 rounded-xl bg-[#5a4ff0] text-white text-xs font-black hover:bg-indigo-500 disabled:opacity-30 active:scale-95 transition-all">
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ DELETE MODAL ═════════════════════════════ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#050815]/85 backdrop-blur-md" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm bg-[#12162a] rounded-2xl shadow-2xl border border-rose-500/20 p-6 text-center">
            <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-rose-400" />
            </div>
            <h2 className="text-lg font-black text-white mb-1">Manager Delete Karein?</h2>
            <p className="inline-block text-sm font-black text-rose-400 border border-rose-500/20 bg-rose-500/5 px-3 py-1 rounded-xl mb-3">
              @{showDeleteConfirm}
            </p>
            <p className="text-xs text-slate-500 mb-4">Yeh action <span className="font-black text-rose-400">permanent</span> hai — undo nahi ho sakti.</p>
            <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-widest font-bold">Confirm karne ke liye "DELETE" likhein:</p>
            <input type="text" placeholder="DELETE"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/30 text-sm text-center font-black text-white outline-none focus:ring-2 focus:ring-rose-500 mb-5 uppercase tracking-widest" />
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteConfirm(null); setDeleteConfirmText(''); }}
                className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={() => deleteConfirmText === 'DELETE' && handleDelete(showDeleteConfirm)}
                disabled={deleteConfirmText !== 'DELETE'}
                className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-xs font-black hover:bg-rose-600 disabled:opacity-30 active:scale-95 transition-all">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
