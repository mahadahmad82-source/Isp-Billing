import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAccounts, saveAccount, removeAccount } from '../utils/storage';
import { mergeById } from '../utils/supabaseSync';
import WABotAdminClients from './WABotAdminClients';
import {
  Users, UserCheck, CheckCircle2, XCircle, Banknote, AlertTriangle,
  Search, Inbox, ClipboardList, Server, RefreshCcw, Trash2, Key,
  ChevronUp, ChevronDown, Activity, LogIn, Shield, TrendingUp,
  Download, Upload, Eye, Clock, BarChart2, Wifi, Plus, Save, Star
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManagerStat {
  username: string; business_name: string; email: string; phone: string | null;
  role: string; joined_at: string; last_login: string; last_seen: string | null; user_count: number;
  receipt_count: number; active_count: number; expired_count: number;
  total_revenue: number; total_balance: number; data_updated_at: string | null;
  is_active: boolean;
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
interface PricingPlan {
  name: string; price: string; period: string; color: string;
  features: string[]; cta: string; highlight: boolean;
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
  const [paymentModal, setPaymentModal] = useState<string | null>(null); // manager_id
  const [payAmount, setPayAmount] = useState('');
  const [payMonths, setPayMonths] = useState('1');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [ledgerModal, setLedgerModal] = useState<string | null>(null); // manager_id
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [receiptView, setReceiptView] = useState<any | null>(null); // payment row
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
  const [suspendBusy, setSuspendBusy] = useState<string | null>(null);
  const [adminLogs, setAdminLogs] = useState<{ id: string; admin_username: string; action: string; target_username: string | null; details: any; created_at: string }[]>([]);
  const [adminLogsLoading, setAdminLogsLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, Customer[]>>({});
  const [searchMgr, setSearchMgr] = useState('');
  const [searchCust, setSearchCust] = useState('');
  const [searchAct, setSearchAct] = useState('');
  const [custFilter, setCustFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [actFilter, setActFilter] = useState<ActivityEntry['type'] | 'all'>('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [mgrSort, setMgrSort] = useState<{ key: keyof ManagerStat; dir: 1 | -1 }>({ key: 'user_count', dir: -1 });
  const [storageInfo, setStorageInfo] = useState<{
    db_size_bytes: number; db_size_pretty: string;
    table_size_bytes: number; table_size_pretty: string;
    row_count: number; avg_row_size_bytes: number;
  } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // ── Pricing Plans (landing page, admin-editable) ─────────────────────────────
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[] | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingMsg, setPricingMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const storageComputed = useMemo(() => {
    if (!storageInfo) return null;
    const FREE_LIMIT_BYTES = 500 * 1024 * 1024;
    const usedPct = Math.min(100, Math.round((storageInfo.db_size_bytes / FREE_LIMIT_BYTES) * 100));
    const barColor = usedPct >= 90 ? '#f43f5e' : usedPct >= 70 ? '#f97316' : '#10b981';
    const statusLabel = usedPct >= 90 ? '🔴 Critical' : usedPct >= 70 ? '🟡 Warning' : '🟢 Healthy';
    const remainingMB = Math.max(0, Math.round((FREE_LIMIT_BYTES - storageInfo.db_size_bytes) / 1024 / 1024));
    const usedMB = Math.round(storageInfo.db_size_bytes / 1024 / 1024);
    return { usedPct, barColor, statusLabel, remainingMB, usedMB };
  }, [storageInfo]);

  // ── Storage Info ─────────────────────────────────────────────────────────────
  const loadStorageInfo = useCallback(async () => {
    setStorageLoading(true);
    const { data, error } = await supabase.rpc('get_db_storage_info');
    if (data && data.length > 0) setStorageInfo(data[0]);
    if (error) console.error('Storage info error:', error.message);
    setStorageLoading(false);
  }, []);
  useEffect(() => { if (tab === 'system') loadStorageInfo(); }, [tab, loadStorageInfo]);

  // ── Pricing Plans ────────────────────────────────────────────────────────────
  const loadPricingPlans = useCallback(async () => {
    setPricingLoading(true);
    setPricingMsg(null);
    const { data, error } = await supabase.from('site_settings').select('pricing_plans').eq('id', 'default').maybeSingle();
    if (!error && Array.isArray(data?.pricing_plans)) {
      setPricingPlans(data.pricing_plans as PricingPlan[]);
    } else if (error) {
      setPricingMsg({ ok: false, text: 'Load error: ' + error.message });
      setPricingPlans([]);
    } else {
      setPricingPlans([]);
    }
    setPricingLoading(false);
  }, []);
  useEffect(() => { if (tab === 'pricing' && pricingPlans === null) loadPricingPlans(); }, [tab, pricingPlans, loadPricingPlans]);

  const savePricingPlans = async () => {
    if (!pricingPlans) return;
    setPricingSaving(true);
    setPricingMsg(null);
    const { error } = await supabase.from('site_settings').upsert(
      { id: 'default', pricing_plans: pricingPlans, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    setPricingSaving(false);
    if (error) setPricingMsg({ ok: false, text: 'Save error: ' + error.message });
    else setPricingMsg({ ok: true, text: '✅ Pricing plans updated — live on landing page.' });
  };

  const updatePlan = (idx: number, patch: Partial<PricingPlan>) => {
    setPricingPlans(prev => prev ? prev.map((p, i) => i === idx ? { ...p, ...patch } : p) : prev);
  };
  const updatePlanFeatures = (idx: number, raw: string) => {
    const features = raw.split('\n').map(f => f.trim()).filter(Boolean);
    updatePlan(idx, { features });
  };
  const addPlan = () => {
    setPricingPlans(prev => [...(prev || []), {
      name: 'New Plan', price: 'PKR 0', period: 'per month', color: '#6366f1',
      features: ['Feature one', 'Feature two'], cta: 'Get Started', highlight: false,
    }]);
  };
  const removePlan = (idx: number) => {
    setPricingPlans(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  };
  const movePlan = (idx: number, dir: -1 | 1) => {
    setPricingPlans(prev => {
      if (!prev) return prev;
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };
  const PLAN_COLOR_PRESETS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'];

  // ── Subscriptions ───────────────────────────────────────────────────────────
  const loadSubscriptions = useCallback(async () => {
    setSubLoading(true);
    const { data } = await supabase.from('manager_subscriptions').select('*').order('created_at', { ascending: false });
    if (data) setSubscriptions(data);
    setSubLoading(false);
  }, []);
  useEffect(() => { if (tab === 'subscriptions') loadSubscriptions(); }, [tab, loadSubscriptions]);

  const openPaymentModal = (managerId: string, currentPlan: string, currentAmount: number) => {
    setPaymentModal(managerId);
    setPayAmount(currentAmount ? String(currentAmount) : '');
    setPayMonths('1');
    setPayMethod('cash');
    setPayNotes('');
  };

  const submitPayment = async () => {
    if (!paymentModal) return;
    const amount = parseInt(payAmount) || 0;
    const months = parseInt(payMonths) || 0;
    if (amount <= 0) { alert('Amount se zyada bara number likhein.'); return; }
    if (months <= 0) { alert('Period (months) 1 ya zyada hona chahiye.'); return; }
    const sub = subscriptions.find(s => s.manager_id === paymentModal);
    setPayBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_record_subscription_payment', {
        p_manager_id: paymentModal, p_amount_pkr: amount, p_plan: sub?.plan || 'starter',
        p_period_months: months, p_method: payMethod, p_notes: payNotes || null,
      });
      if (error || (data && !data.success)) { alert(error?.message || data?.error || 'Payment record nahi hui'); return; }
      setSubToast(`✅ Payment recorded — receipt ${data.receipt_number}`);
      setTimeout(() => setSubToast(null), 3000);
      setPaymentModal(null);
      loadSubscriptions();
    } finally { setPayBusy(false); }
  };

  const openLedger = async (managerId: string) => {
    setLedgerModal(managerId);
    setLedgerLoading(true);
    try {
      const { data } = await supabase.rpc('admin_get_subscription_ledger', { p_manager_id: managerId });
      setLedgerRows(data || []);
    } finally { setLedgerLoading(false); }
  };

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
      setStatsError(null);
    } catch (err) {
      console.error('Admin stats load error:', err);
      // #1 cause of this is a stale/expired auth session (auth.uid() no
      // longer resolves for the SECURITY DEFINER RPC) — try one silent
      // refresh + retry before telling the user something's wrong.
      try {
        await supabase.auth.refreshSession();
        const { data: retryData, error: retryErr } = await supabase.rpc('get_admin_manager_stats');
        if (!retryErr) {
          setManagers(retryData || []);
          setLastRefresh(new Date());
          setStatsError(null);
          setLoading(false);
          return;
        }
      } catch { /* fall through to error banner below */ }
      setStatsError('Session expire ho gaya — ye "0" real data nahi hai. Logout karke dobara login karein.');
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadManagers(); }, [loadManagers]);
  useEffect(() => {
    const map: Record<string, { status: OnlineStatus; updatedAt: string | null }> = {};
    for (const m of managers) map[m.username] = { status: getOnlineStatus(m.last_seen), updatedAt: m.last_seen };
    setOnlineMap(map);
  }, [managers]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('admin-manager-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manager_data' }, (payload) => {
        const row = payload.new as any;
        if (!row?.manager_id) return;
        const username = row.manager_id;
        const updatedAt = row.updated_at || null;
        const seenAt = row.last_seen_at || null;
        setOnlineMap(prev => ({ ...prev, [username]: { status: getOnlineStatus(seenAt), updatedAt: seenAt } }));
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')
          setManagers(prev => prev.map(m => m.username !== username ? m : { ...m, data_updated_at: updatedAt, last_seen: seenAt }));
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
    setDeleteMsg(null);
    // admin_delete_manager requires a live Supabase Auth session (auth.uid()) —
    // catch a stale/expired session here with a clear, actionable message instead
    // of a confusing "Delete failed — try again" that retrying can't fix.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setDeleteMsg({ ok: false, text: 'Admin session expired. Log out and log back in, then try again.' });
      return;
    }
    try {
      // RPC handles: manager_data + manager_subscriptions + auth.users cleanup (SECURITY DEFINER — bypasses RLS by design)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_delete_manager', { p_username: username });
      if (rpcError || !rpcResult?.success) {
        setDeleteMsg({ ok: false, text: rpcError?.message || rpcResult?.error || 'Delete failed — manager still exists. Try again.' });
        return; // modal stays open, nothing removed from UI — matches server state
      }
    } catch (e: any) {
      setDeleteMsg({ ok: false, text: e?.message || 'Delete failed — manager still exists.' });
      return;
    }
    // Only clean up local state after confirmed server-side success
    removeAccount(username);
    localStorage.removeItem(`myisp_data_${username}`);
    setManagers(prev => prev.filter(m => m.username !== username));
    setShowDeleteConfirm(null); setDeleteConfirmText(''); setDeleteMsg(null);
  };

  const handleReset = async () => {
    if (!showResetModal || !newPassword.trim() || newPassword.length < 6) return;
    setResetMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setResetMsg({ ok: false, text: 'Admin session expired. Log out and log back in, then try again.' });
      return;
    }
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

  // ── Suspend / Reactivate — non-destructive admin override (unlike Delete,
  // this keeps all data intact and can be reversed with one tap) ───────────
  const handleToggleActive = async (username: string, nextActive: boolean) => {
    setSuspendBusy(username);
    try {
      const { data, error } = await supabase.rpc('admin_set_manager_active', { p_username: username, p_active: nextActive });
      if (error || (data && !data.success)) {
        alert(error?.message || data?.error || 'Action failed');
        return;
      }
      setManagers(prev => prev.map(m => m.username !== username ? m : { ...m, is_active: nextActive }));
    } catch (e: any) {
      alert(e?.message || 'Action failed');
    } finally {
      setSuspendBusy(null);
    }
  };

  const loadAdminLogs = useCallback(async () => {
    setAdminLogsLoading(true);
    try {
      const { data, error } = await supabase.from('admin_action_logs').select('*').order('created_at', { ascending: false }).limit(100);
      if (!error) setAdminLogs(data || []);
    } finally {
      setAdminLogsLoading(false);
    }
  }, []);

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

      {/* Session error banner — makes a broken session visible instead of a silent "0" */}
      {statsError && !loading && (
        <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
          <div className="flex-1">
            <p className="text-rose-300 font-black text-[12px]">{statsError}</p>
          </div>
          <button onClick={loadManagers} className="flex-shrink-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-lg text-[11px] font-black uppercase tracking-wider">
            Retry
          </button>
        </div>
      )}

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
                      {!m.is_active && <Badge color="bg-amber-500/15 text-amber-400">SUSPENDED</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                      <span className="font-black text-indigo-400">@{m.username}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(m.last_login)}</span>
                      <OnlineDot status={onlineMap[m.username]?.status || 'offline'} showLabel />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleToggleActive(m.username, !m.is_active)} disabled={suspendBusy === m.username}
                      title={m.is_active ? 'Suspend account' : 'Reactivate account'}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${m.is_active ? 'text-slate-500 hover:bg-amber-500/15 hover:text-amber-400' : 'text-amber-400 bg-amber-500/10'}`}>
                      {suspendBusy === m.username ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : m.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setShowResetModal(m.username); setNewPassword(''); setResetMsg(null); }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-indigo-500/15 hover:text-indigo-400 transition-all">
                      <Key className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setShowDeleteConfirm(m.username); setDeleteConfirmText(''); setDeleteMsg(null); }}
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

          {/* ── Admin Actions Log — WHO in the admin panel deleted/reset/suspended
               a manager and WHEN. This is a separate, tamper-evident trail from the
               manager activity above — only written by SECURITY DEFINER RPCs, never
               directly writable, so it can't be edited after the fact. ── */}
          <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2"><Shield className="w-4 h-4 text-amber-400" /> Admin Actions Log</h3>
              {adminLogs.length === 0 && !adminLogsLoading ? (
                <button onClick={loadAdminLogs} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-amber-500 transition-all active:scale-95">Load Logs</button>
              ) : (
                <p className="text-[10px] text-slate-500 font-black uppercase">{adminLogs.length} actions</p>
              )}
            </div>
            {adminLogsLoading ? (
              <div className="flex items-center justify-center py-12 gap-3"><div className="w-5 h-5 border-[3px] border-amber-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho raha hai...</span></div>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto divide-y divide-white/[0.03]">
                {adminLogs.length === 0 ? (
                  <div className="text-center py-10 text-slate-600 flex flex-col items-center gap-2"><Shield className="w-8 h-8" /><p className="font-bold text-xs">Click "Load Logs"</p></div>
                ) : adminLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5"><Shield className="w-3.5 h-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-bold text-slate-200">
                          <span className="text-amber-400">@{log.admin_username}</span> {log.action.replace(/_/g, ' ')}
                          {log.target_username && <> — <span className="text-indigo-400">@{log.target_username}</span></>}
                        </p>
                        <p className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(log.created_at)}</p>
                      </div>
                      <span className="text-[10px] text-slate-600">{fmtTime(log.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ SYSTEM ══════════ */}
      {!loading && tab === 'system' && (
        <div className="space-y-4 max-w-3xl">

          {/* ── Storage Usage Card ── */}
          <div className="bg-slate-800/60 rounded-3xl border border-white/[0.06] p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-black text-white text-[13px] flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" /> Supabase Storage Usage
              </h3>
              <button onClick={loadStorageInfo} disabled={storageLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 font-black text-[11px] uppercase tracking-wider transition-all border border-white/[0.06] disabled:opacity-50">
                <RefreshCcw className={`w-3 h-3 ${storageLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            {storageLoading && !storageInfo ? (
              <div className="text-center py-6 text-slate-500 text-sm">Loading storage info…</div>
            ) : storageComputed ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Database Usage</span>
                      <span className="font-black text-white text-lg">{storageComputed.usedPct}%</span>
                    </div>
                    <div className="w-full bg-slate-700/60 rounded-full h-4 overflow-hidden">
                      <div className="h-4 rounded-full transition-all duration-700"
                        style={{ width: `${storageComputed.usedPct}%`, background: storageComputed.barColor, boxShadow: `0 0 10px ${storageComputed.barColor}60` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-slate-500 font-bold">{storageInfo!.db_size_pretty} used</span>
                      <span className="text-[10px] text-slate-500 font-bold">500 MB limit (Free tier)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Used', value: `${storageComputed.usedMB} MB`, color: 'text-indigo-300', icon: '💾' },
                      { label: 'Remaining', value: `${storageComputed.remainingMB} MB`, color: 'text-emerald-400', icon: '✅' },
                      { label: 'Status', value: storageComputed.statusLabel, color: storageComputed.usedPct >= 90 ? 'text-rose-400' : storageComputed.usedPct >= 70 ? 'text-amber-400' : 'text-emerald-400', icon: '' },
                      { label: 'Managers (rows)', value: storageInfo!.row_count.toString(), color: 'text-blue-300', icon: '👥' },
                      { label: 'Table Size', value: storageInfo!.table_size_pretty, color: 'text-purple-300', icon: '📊' },
                      { label: 'Avg Row Size', value: `${Math.round(storageInfo!.avg_row_size_bytes / 1024)} KB`, color: 'text-amber-300', icon: '📦' },
                    ].map(item => (
                      <div key={item.label} className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-3">
                        <p className="text-slate-500 font-black uppercase tracking-wider text-[10px] mb-1">{item.icon} {item.label}</p>
                        <p className={`font-black text-base ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {storageComputed.usedPct >= 70 && (
                    <div className={`rounded-2xl border p-3 flex items-start gap-3 ${storageComputed.usedPct >= 90 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                      <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${storageComputed.usedPct >= 90 ? 'text-rose-400' : 'text-amber-400'}`} />
                      <div>
                        <p className={`font-black text-[12px] ${storageComputed.usedPct >= 90 ? 'text-rose-300' : 'text-amber-300'}`}>
                          {storageComputed.usedPct >= 90 ? 'Storage critical! Supabase Pro plan upgrade karein.' : 'Storage 70% se zyada. Monitor karte rahein.'}
                        </p>
                        <p className="text-slate-500 text-[11px] mt-0.5">Supabase Pro: $25/mo — 8 GB database included</p>
                      </div>
                    </div>
                  )}
                </div>
            ) : (
              <div className="text-center py-4 text-slate-500 text-sm">Storage info load nahi ho saka.</div>
            )}
          </div>

          {/* ── Database Stats + Backup ── */}
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
                        if(!json.databaseDump || !Array.isArray(json.databaseDump)) { alert('Invalid backup file.'); return; }
                        const ts = json.timestamp ? new Date(json.timestamp).toLocaleString('en-PK') : 'unknown time';
                        const confirmed = confirm(
                          `Restore backup from ${ts}?\n\n${json.databaseDump.length} manager(s) in this file.\n\n` +
                          `This will MERGE the backup into current live data (no records will be deleted — ` +
                          `both old and new users/receipts are kept for every manager). Continue?`
                        );
                        if (!confirmed) return;
                        let restored = 0;
                        for (const row of json.databaseDump) {
                          if (!row?.manager_id) continue;
                          const { data: liveRow } = await supabase.from('manager_data').select('data').eq('manager_id', row.manager_id).maybeSingle();
                          const backupData = row.data || {};
                          const liveData = liveRow?.data || {};
                          const mergedData = {
                            ...backupData, ...liveData,
                            users:            mergeById(backupData.users,            liveData.users),
                            receipts:         mergeById(backupData.receipts,         liveData.receipts),
                            archives:         mergeById(backupData.archives,         liveData.archives),
                            companies:        mergeById(backupData.companies,        liveData.companies),
                            subManagers:      mergeById(backupData.subManagers,      liveData.subManagers),
                            attendanceLogs:   mergeById(backupData.attendanceLogs,   liveData.attendanceLogs),
                            complaintTickets: mergeById(backupData.complaintTickets, liveData.complaintTickets),
                            businessExpenses: mergeById(backupData.businessExpenses, liveData.businessExpenses),
                          };
                          const { error } = await supabase.from('manager_data').upsert(
                            { manager_id: row.manager_id, data: mergedData },
                            { onConflict: 'manager_id' }
                          );
                          if (!error) restored++;
                        }
                        alert(`✅ Restored (merged): ${restored}/${json.databaseDump.length} manager(s). No existing data was deleted.`);
                        window.location.reload();
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
                      {sub.status==='pending_payment' && sub.payment_proof_url && (
                        <a href={sub.payment_proof_url} target="_blank" rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-black hover:bg-amber-500/20 transition-all flex items-center gap-1 active:scale-95">
                          <Eye className="w-3.5 h-3.5" /> View Proof
                        </a>
                      )}
                      {sub.status==='pending_payment' && !sub.payment_proof_url && (
                        <span className="px-3 py-1.5 rounded-xl bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-wider">No proof yet</span>
                      )}
                      <button onClick={()=>openPaymentModal(sub.manager_id, sub.plan, sub.amount_pkr)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[11px] font-black hover:bg-indigo-500/20 transition-all flex items-center gap-1 active:scale-95">
                        <Banknote className="w-3.5 h-3.5" /> Record Payment
                      </button>
                      <button onClick={()=>openLedger(sub.manager_id)}
                        className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-black hover:bg-white/10 transition-all flex items-center gap-1 active:scale-95">
                        <ClipboardList className="w-3.5 h-3.5" /> Ledger
                      </button>
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

      {/* ══════════ PRICING PLANS (landing page, admin-editable) ══════════ */}
      {tab === 'pricing' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2"><Banknote className="w-5 h-5 text-indigo-400" />Pricing Plans</h2>
              <p className="text-[11px] text-slate-500">Landing page ke pricing cards yahan se edit/add/delete honge — code touch karne ki zaroorat nahi.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadPricingPlans} disabled={pricingLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-slate-300 hover:text-white text-[11px] font-bold transition-colors disabled:opacity-40">
                <RefreshCcw className={`w-3.5 h-3.5 ${pricingLoading ? 'animate-spin' : ''}`} /> Reload
              </button>
              <button onClick={addPlan}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black transition-all active:scale-95">
                <Plus className="w-3.5 h-3.5" /> New Plan
              </button>
            </div>
          </div>

          {pricingMsg && (
            <p className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl ${pricingMsg.ok ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
              {pricingMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{pricingMsg.text}
            </p>
          )}

          {pricingLoading && !pricingPlans?.length && (
            <p className="text-center text-slate-500 text-xs py-10">Loading pricing plans…</p>
          )}

          {pricingPlans && pricingPlans.length === 0 && !pricingLoading && (
            <p className="text-center text-slate-500 text-xs py-10">Koi pricing plan nahi mila. "New Plan" se shuru karein.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(pricingPlans || []).map((plan, idx) => (
              <div key={idx} className="rounded-3xl border border-white/[0.08] bg-slate-900/60 p-5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plan #{idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => movePlan(idx, -1)} disabled={idx === 0} className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white disabled:opacity-20 transition-colors"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => movePlan(idx, 1)} disabled={idx === (pricingPlans?.length || 0) - 1} className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white disabled:opacity-20 transition-colors"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removePlan(idx)} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Name</label>
                    <input type="text" value={plan.name} onChange={e => updatePlan(idx, { name: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">CTA Button Text</label>
                    <input type="text" value={plan.cta} onChange={e => updatePlan(idx, { cta: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Price</label>
                    <input type="text" value={plan.price} onChange={e => updatePlan(idx, { price: e.target.value })}
                      placeholder="Free / Contact / PKR 999"
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Period (optional)</label>
                    <input type="text" value={plan.period} onChange={e => updatePlan(idx, { period: e.target.value })}
                      placeholder="per month"
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Accent Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    {PLAN_COLOR_PRESETS.map(c => (
                      <button key={c} onClick={() => updatePlan(idx, { color: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${plan.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ background: c }} />
                    ))}
                    <input type="text" value={plan.color} onChange={e => updatePlan(idx, { color: e.target.value })}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-[11px] text-slate-300 font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Features (ek line mein ek feature)</label>
                  <textarea value={plan.features.join('\n')} onChange={e => updatePlanFeatures(idx, e.target.value)} rows={5}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={plan.highlight} onChange={e => updatePlan(idx, { highlight: e.target.checked })}
                    className="w-4 h-4 rounded accent-indigo-500" />
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" /> "Most Popular" highlight</span>
                </label>
              </div>
            ))}
          </div>

          {!!pricingPlans?.length && (
            <button onClick={savePricingPlans} disabled={pricingSaving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40">
              <Save className="w-4 h-4" /> {pricingSaving ? 'Saving…' : 'Save Pricing Plans'}
            </button>
          )}
        </div>
      )}

      {/* ══════════ WABOT SAAS (Ayesha clients) ══════════ */}
      {tab === 'wabot-saas' && (
        <WABotAdminClients managers={managers.map(m => ({ username: m.username, business_name: m.business_name }))} />
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={()=>{setShowDeleteConfirm(null);setDeleteMsg(null);}} />
          <div className="relative z-10 w-full max-w-sm bg-slate-900 rounded-3xl shadow-2xl border border-rose-500/20 p-6 text-center">
            <div className="w-14 h-14 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4"><Trash2 className="w-7 h-7 text-rose-400" /></div>
            <h2 className="text-lg font-black text-white mb-1">Manager Delete Karein?</h2>
            <p className="inline-block text-sm font-black text-rose-400 border border-rose-500/20 bg-rose-500/5 px-3 py-1 rounded-xl mb-3">@{showDeleteConfirm}</p>
            <p className="text-xs text-slate-500 mb-4">Yeh action <span className="font-black text-rose-400">permanent</span> hai.</p>
            <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-widest font-bold">"DELETE" likhein:</p>
            <input type="text" placeholder="DELETE" value={deleteConfirmText} onChange={e=>setDeleteConfirmText(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-center font-black text-white outline-none focus:ring-2 focus:ring-rose-500 mb-5 uppercase tracking-widest" />
            {deleteMsg && <p className="text-[11px] font-bold flex items-center gap-1 mb-3 justify-center text-rose-400"><XCircle className="w-3.5 h-3.5" />{deleteMsg.text}</p>}
            <div className="flex gap-2">
              <button onClick={()=>{setShowDeleteConfirm(null);setDeleteConfirmText('');setDeleteMsg(null);}} className="flex-1 py-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={()=>deleteConfirmText==='DELETE'&&handleDelete(showDeleteConfirm)} disabled={deleteConfirmText!=='DELETE'}
                className="flex-1 py-3 rounded-2xl bg-rose-500 text-white text-xs font-black hover:bg-rose-600 disabled:opacity-30 active:scale-95 transition-all">Confirm Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ RECORD PAYMENT MODAL ══════════ */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={()=>!payBusy && setPaymentModal(null)} />
          <div className="relative z-10 w-full max-w-sm bg-slate-900 rounded-3xl shadow-2xl border border-white/[0.08] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 flex items-center justify-center"><Banknote className="w-5 h-5 text-indigo-400" /></div>
              <div><h2 className="text-lg font-black text-white">Record Payment</h2><p className="text-[11px] text-slate-500">@{paymentModal}</p></div>
            </div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Amount (PKR)</label>
            <input type="number" placeholder="e.g. 5000" value={payAmount} onChange={e=>setPayAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 mb-3" />
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Period (months)</label>
            <input type="number" min="1" placeholder="1" value={payMonths} onChange={e=>setPayMonths(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 mb-3" />
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Method</label>
            <select value={payMethod} onChange={e=>setPayMethod(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 mb-3 cursor-pointer">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
              <option value="other">Other</option>
            </select>
            <input type="text" placeholder="Notes (optional)" value={payNotes} onChange={e=>setPayNotes(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 mb-4" />
            <div className="flex gap-2">
              <button onClick={()=>setPaymentModal(null)} disabled={payBusy} className="flex-1 py-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={submitPayment} disabled={payBusy}
                className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 disabled:opacity-50 active:scale-95 transition-all">
                {payBusy ? 'Saving...' : 'Record & Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ LEDGER MODAL — month-wise, same pattern as the manager-side
           Recovery Ledger (RecoverySummary.tsx): period cards first, tap one
           to drill into that month's detailed payment table. ══════════ */}
      {ledgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={()=>setLedgerModal(null)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-slate-900 rounded-3xl shadow-2xl border border-white/[0.08] p-6 overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              {selectedLedgerMonth && (
                <button onClick={()=>setSelectedLedgerMonth(null)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}
              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center flex-shrink-0"><ClipboardList className="w-5 h-5 text-slate-300" /></div>
              <div>
                <h2 className="text-lg font-black text-white">{selectedLedgerMonth || 'Payment Ledger'}</h2>
                <p className="text-[11px] text-slate-500">@{ledgerModal}{selectedLedgerMonth ? ' — month detail' : ''}</p>
              </div>
            </div>

            {ledgerLoading ? (
              <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : ledgerRows.length === 0 ? (
              <p className="text-center py-10 text-slate-600 text-xs font-bold">Koi payment record nahi hai abhi.</p>
            ) : selectedLedgerMonth === null ? (
              /* ── Period cards grid (collection-period-per-month), same visual
                   language as RecoverySummary's month cards ── */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {monthlyLedger.map((m) => (
                  <div key={m.period} onClick={()=>setSelectedLedgerMonth(m.period)}
                    className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-2xl p-4 cursor-pointer transition-all hover:-translate-y-0.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Collection Period</p>
                    <p className="text-lg font-black text-white mb-2">{m.period}</p>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Collected</p>
                        <p className="text-sm font-black text-emerald-400">Rs. {m.total.toLocaleString()}</p>
                      </div>
                      <div className="border-l border-white/10 pl-4">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Payments</p>
                        <p className="text-sm font-black text-slate-200">{m.rows.length}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Detailed table for the selected month ── */
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left min-w-[560px]">
                  <thead className="bg-white/[0.03] text-[10px] uppercase font-black text-slate-500 border-b border-white/[0.06]">
                    <tr>
                      <th className="px-3 py-3">Receipt #</th>
                      <th className="px-3 py-3">Plan</th>
                      <th className="px-3 py-3">Period</th>
                      <th className="px-3 py-3">Method</th>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {monthlyLedger.find(m => m.period === selectedLedgerMonth)?.rows.map((row) => (
                      <tr key={row.id} className="text-[12px] hover:bg-white/[0.02]">
                        <td className="px-3 py-3 font-black text-indigo-400">{row.receipt_number}</td>
                        <td className="px-3 py-3 text-slate-300 capitalize">{row.plan}</td>
                        <td className="px-3 py-3 text-slate-400">{row.period_months}mo</td>
                        <td className="px-3 py-3 text-slate-400 capitalize">{(row.method || 'N/A').replace('_',' ')}</td>
                        <td className="px-3 py-3 text-slate-400">{fmtDate(row.paid_at)}</td>
                        <td className="px-3 py-3 text-right font-black text-emerald-400">Rs. {Number(row.amount_pkr).toLocaleString()}</td>
                        <td className="px-3 py-3">
                          <button onClick={()=>setReceiptView(row)} className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-black hover:bg-indigo-500/20 transition-all">Receipt</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/[0.08]">
                      <td colSpan={5} className="px-3 py-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">Total</td>
                      <td className="px-3 py-3 text-right font-black text-white">Rs. {(monthlyLedger.find(m => m.period === selectedLedgerMonth)?.total || 0).toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ RECEIPT VIEW MODAL ══════════ */}
      {receiptView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={()=>setReceiptView(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 text-slate-900">
            <div className="text-center mb-5 pb-5 border-b border-dashed border-slate-300">
              <p className="font-black text-lg">Bill Collector</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Subscription Payment Receipt</p>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Receipt #</span><span className="font-black">{receiptView.receipt_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Manager</span><span className="font-black">@{receiptView.manager_id}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Plan</span><span className="font-black capitalize">{receiptView.plan}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Period</span><span className="font-black">{receiptView.period_months} month{receiptView.period_months>1?'s':''}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Covers</span><span className="font-black text-[11px]">{fmtDate(receiptView.period_start)} – {fmtDate(receiptView.period_end)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-black capitalize">{(receiptView.method||'').replace('_',' ')}</span></div>
              {receiptView.notes && <div className="flex justify-between"><span className="text-slate-500">Notes</span><span className="font-black text-right">{receiptView.notes}</span></div>}
              <div className="flex justify-between pt-3 mt-1 border-t border-dashed border-slate-300"><span className="text-slate-500 font-bold">Amount Paid</span><span className="font-black text-lg text-emerald-600">Rs. {Number(receiptView.amount_pkr).toLocaleString()}</span></div>
              <div className="flex justify-between text-[10px] text-slate-400"><span>Paid on</span><span>{fmtDate(receiptView.paid_at)}</span></div>
              <div className="flex justify-between text-[10px] text-slate-400"><span>Recorded by</span><span>@{receiptView.recorded_by_admin}</span></div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={()=>setReceiptView(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold">Close</button>
              <button onClick={()=>window.print()} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black active:scale-95 transition-all">Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
