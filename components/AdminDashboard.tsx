import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAccounts, saveAccount, removeAccount } from '../utils/storage';
import { Users, UserCheck, CheckCircle2, XCircle, Banknote, AlertTriangle, Search, Inbox, ClipboardList, Server, RefreshCcw, Trash2, Key, ChevronUp, ChevronDown, Download, Upload, ShieldCheck } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
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

interface Receipt {
  id: string;
  userId: string;
  paidAmount: number;
  totalAmount: number;
  date: string;
  period: string;
}

// ─── Helper Components ─────────────────────────────────────────────────────────
const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${color}`}>
    {children}
  </span>
);

const KpiCard = ({ icon, label, value, sub, bgClass, valColor }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; bgClass: string; valColor?: string }) => (
  <div className={`rounded-xl p-5 ${bgClass} flex flex-col justify-between shadow-sm border border-white/5 h-32`}>
    <div className="flex flex-col mb-2">
      <span className="text-2xl mb-1 text-white block">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</span>
    </div>
    <div>
      <span className={`text-[2rem] font-bold leading-none ${valColor || 'text-white'}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500 font-bold block mt-1">{sub}</span>}
    </div>
  </div>
);

const TabBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick}
    className={`px-5 py-2 rounded-xl text-[11px] uppercase tracking-wide font-bold whitespace-nowrap transition-all ${active
      ? 'bg-[#5a4ff0] text-white shadow-lg'
      : 'text-slate-400 hover:text-slate-200'}`}>
    {children}
  </button>
);

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

// ─── Main Component ─────────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState<'overview' | 'managers' | 'customers' | 'system'>('overview');
  const [managers, setManagers] = useState<ManagerStat[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [custLoading, setCustLoading] = useState(false);
  const [expandedMgr, setExpandedMgr] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, Customer[]>>({});
  const [searchMgr, setSearchMgr] = useState('');
  const [searchCust, setSearchCust] = useState('');
  const [custFilter, setCustFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  // ── Load all managers from Supabase ──────────────────────────────────────────
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

  // ── Load all customers (for All Customers tab) ───────────────────────────────
  const loadAllCustomers = useCallback(async () => {
    setCustLoading(true);
    try {
      const allCusts: Customer[] = [];
      for (const mgr of managers) {
        const { data } = await supabase.rpc('get_manager_customers', { p_username: mgr.username });
        if (data && Array.isArray(data)) {
          const withMgr = data.map((c: Customer) => ({
            ...c,
            managerUsername: mgr.username,
            managerBusiness: mgr.business_name,
          }));
          allCusts.push(...withMgr);
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
    if (tab === 'customers' && allCustomers.length === 0 && managers.length > 0) {
      loadAllCustomers();
    }
  }, [tab, managers, allCustomers.length, loadAllCustomers]);

  // ── Expand manager → load their customers ───────────────────────────────────
  const toggleExpand = async (username: string) => {
    if (expandedMgr === username) { setExpandedMgr(null); return; }
    setExpandedMgr(username);
    if (!expandedCustomers[username]) {
      try {
        const { data } = await supabase.rpc('get_manager_customers', { p_username: username });
        setExpandedCustomers(prev => ({ ...prev, [username]: data || [] }));
      } catch (err) {
        console.error('Load customers error:', err);
      }
    }
  };

  // ── Totals ────────────────────────────────────────────────────────────────────
  const handleDelete = async (username: string) => {
    try {
      await supabase.rpc('admin_delete_manager', { p_username: username });
    } catch {}
    const accs = getAccounts().filter((a: any) => a.username !== username);
    accs.forEach(acc => saveAccount(acc)); 
    removeAccount(username);
    localStorage.removeItem(`myisp_data_${username}`);
    setShowDeleteConfirm(null);
    loadManagers();
  };

  const handleReset = async () => {
    if (!showResetModal || !newPassword.trim()) return;
    try {
      const { data, error } = await supabase.rpc('admin_reset_manager_password', {
        p_username: showResetModal,
        p_new_password: newPassword.trim()
      });
      if (error || (data && !data.success)) {
        alert('Error: ' + (error?.message || data?.error || 'Failed'));
        return;
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
      return;
    }
    const accs = getAccounts();
    const existing = accs.find((a: any) => a.username === showResetModal);
    if (existing) {
       saveAccount({ ...existing, password: newPassword.trim() });
    }

    setShowResetModal(null);
    setNewPassword('');
    loadManagers();
  };

  const totals = useMemo(() => ({
    managers: managers.length,
    customers: managers.reduce((s, m) => s + m.user_count, 0),
    active: managers.reduce((s, m) => s + m.active_count, 0),
    revenue: managers.reduce((s, m) => s + Number(m.total_revenue), 0),
    balance: managers.reduce((s, m) => s + Number(m.total_balance), 0),
    receipts: managers.reduce((s, m) => s + m.receipt_count, 0),
  }), [managers]);

  // ── Filtered ──────────────────────────────────────────────────────────────────
  const filteredMgrs = useMemo(() => {
    if (!searchMgr.trim()) return managers;
    const q = searchMgr.toLowerCase();
    return managers.filter(m =>
      m.username.toLowerCase().includes(q) ||
      m.business_name.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  }, [managers, searchMgr]);

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

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Backup State ──────────────────────────────────────────────────────────
  const [backupLoading, setBackupLoading]   = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [backupMsg, setBackupMsg]           = useState<string | null>(null);

  // ─── Download Full Backup ──────────────────────────────────────────────────
  const handleDownloadBackup = async () => {
    setBackupLoading(true); setBackupMsg(null);
    try {
      const { data, error } = await supabase.from('manager_data').select('manager_id, data, updated_at');
      if (error) throw error;
      const blob = new Blob([JSON.stringify({ version:'1.0', exported_at: new Date().toISOString(), total_managers: data?.length||0, managers: data }, null, 2)], { type:'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ledgerzo_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setBackupMsg(`✅ Backup downloaded! ${data?.length||0} managers ka data saved.`);
    } catch(err:any) { setBackupMsg('❌ Backup failed: ' + err.message); }
    finally { setBackupLoading(false); }
  };

  // ─── Restore From File ─────────────────────────────────────────────────────
  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setRestoreLoading(true); setBackupMsg(null);
    try {
      const backup = JSON.parse(await file.text());
      if (!backup.managers || !Array.isArray(backup.managers)) throw new Error('Invalid backup file');
      let restored = 0;
      for (const m of backup.managers) {
        if (!m.manager_id || !m.data) continue;
        const { error } = await supabase.from('manager_data').upsert({ manager_id: m.manager_id, data: m.data, updated_at: new Date().toISOString() }, { onConflict: 'manager_id' });
        if (!error) restored++;
      }
      setBackupMsg(`✅ Restore complete! ${restored}/${backup.managers.length} managers restored.`);
      setTimeout(() => window.location.reload(), 2000);
    } catch(err:any) { setBackupMsg('❌ Restore failed: ' + err.message); }
    finally { setRestoreLoading(false); e.target.value = ''; }
  };

  // ─── Restore From Auto-Backup ──────────────────────────────────────────────
  const handleRestoreFromAutoBackup = async () => {
    setRestoreLoading(true); setBackupMsg(null);
    try {
      // Get latest backup per manager from last 24 hours
      const { data: backups, error } = await supabase
        .from('manager_data_backups')
        .select('manager_id, data, backed_up_at, receipts_count')
        .gte('backed_up_at', new Date(Date.now() - 24*60*60*1000).toISOString())
        .order('backed_up_at', { ascending: false });
      if (error) throw error;
      if (!backups || backups.length === 0) { setBackupMsg('❌ Last 24 hours mein koi backup nahi mila.'); return; }
      // Latest per manager
      const latest: Record<string, any> = {};
      for (const b of backups) { if (!latest[b.manager_id]) latest[b.manager_id] = b; }
      let restored = 0;
      for (const [managerId, backup] of Object.entries(latest)) {
        const { error: e } = await supabase.from('manager_data').upsert({ manager_id: managerId, data: backup.data, updated_at: new Date().toISOString() }, { onConflict: 'manager_id' });
        if (!e) restored++;
      }
      setBackupMsg(`✅ Auto-backup se ${restored} managers ka data restore ho gaya!`);
      setTimeout(() => window.location.reload(), 2000);
    } catch(err:any) { setBackupMsg('❌ Auto-restore failed: ' + err.message); }
    finally { setRestoreLoading(false); }
  };


      {/* ═══ Backup & Restore ════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🛡️</span>
          <h3 className="font-bold text-slate-800 dark:text-white text-base">Backup & Restore</h3>
          <span className="ml-auto text-xs text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">Auto-Backup ON ✓</span>
        </div>
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"/>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Har 30 minute mein automatic snapshot — last 24 hours ka data always safe hai</p>
        </div>
        {backupMsg && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${backupMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {backupMsg}
          </div>
        )}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleDownloadBackup} disabled={backupLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-xs transition-all active:scale-95">
              <span>📥</span>{backupLoading ? 'Downloading...' : 'Download Backup'}
            </button>
            <label className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-95 cursor-pointer ${restoreLoading ? 'bg-orange-300 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
              <span>📤</span>{restoreLoading ? 'Restoring...' : 'Restore From File'}
              <input type="file" accept=".json" className="hidden" onChange={handleRestoreBackup} disabled={restoreLoading}/>
            </label>
          </div>
          <button onClick={handleRestoreFromAutoBackup} disabled={restoreLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl font-semibold text-xs transition-all active:scale-95">
            <span>🔄</span>{restoreLoading ? 'Restoring...' : 'Restore From Auto-Backup (Last 24 Hours)'}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400 text-center">48 snapshots stored — last 24 hours ka har change safe hai</p>
      </div>


  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1400px] mx-auto bg-[#0b0f1a] min-h-screen text-slate-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Admin Control Center</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-medium">
            LIVE SUPABASE DATA • SYNCED: {lastRefresh.toLocaleTimeString()} • {totals.managers} MANAGERS • {totals.customers} CUSTOMERS
          </p>
        </div>
        <button onClick={loadManagers}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5a4ff0] text-white text-[11px] uppercase tracking-wider font-bold hover:bg-indigo-600 transition-colors shadow-lg active:scale-95">
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 overflow-x-auto pb-1 mt-6">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabBtn>
        <TabBtn active={tab === 'managers'} onClick={() => setTab('managers')}>Managers ({totals.managers})</TabBtn>
        <TabBtn active={tab === 'customers'} onClick={() => setTab('customers')}>All Customers ({totals.customers})</TabBtn>
        <TabBtn active={tab === 'system'} onClick={() => setTab('system')}>System</TabBtn>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 border-4 border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 font-bold text-sm">Supabase se data load ho raha hai...</span>
        </div>
      )}

      {/* ════════ OVERVIEW ════════ */}
      {!loading && tab === 'overview' && (
        <div className="space-y-8">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <KpiCard icon={<UserCheck className="w-6 h-6" />} label="Managers" value={totals.managers} bgClass="bg-[#12162a]" valColor="text-white" />
            <KpiCard icon={<Users className="w-6 h-6" />} label="Total Customers" value={totals.customers} bgClass="bg-[#182035]" valColor="text-blue-100" />
            <KpiCard icon={<CheckCircle2 className="w-6 h-6" />} label="Active" value={totals.active}
              sub={`${totals.customers ? Math.round(totals.active / totals.customers * 100) : 0}%`}
              bgClass="bg-[#0c241c]" valColor="text-[#2bd076]" />
            <KpiCard icon={<XCircle className="w-6 h-6" />} label="Expired" value={totals.customers - totals.active} bgClass="bg-[#2d121b]" valColor="text-[#f16775]" />
            <KpiCard icon={<Banknote className="w-6 h-6" />} label="Total Revenue"
              value={`Rs.${(totals.revenue / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.revenue.toLocaleString()}`}
              bgClass="bg-[#2d1e15]" valColor="text-[#ffb752]" />
            <KpiCard icon={<AlertTriangle className="w-6 h-6" />} label="Pending Dues"
              value={`Rs.${(totals.balance / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.balance.toLocaleString()}`}
              bgClass="bg-[#2d1b15]" valColor="text-[#ff9852]" />
          </div>

          {/* All Managers Table */}
          <div className="bg-[#181d2f] rounded-[1.25rem] border border-white/5 overflow-hidden">
            <div className="px-6 py-[1.1rem] flex items-center justify-between border-b border-white/[0.04]">
              <h3 className="font-bold text-white text-[13px] flex items-center gap-2 tracking-wide">
                <ClipboardList className="w-4 h-4 text-slate-400" /> All Managers — Live Data
              </h3>
              <button onClick={() => setTab('managers')} className="text-[11px] text-[#5a4ff0] font-bold hover:text-indigo-300">Details →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#1b2237]">
                    {['#', 'Manager', 'Email', 'Customers', 'Active', 'Revenue', 'Dues', 'Last Login'].map(h => (
                      <th key={h} className="text-left px-6 py-4 font-bold text-[#8695b0] uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m, i) => (
                    <tr key={m.username} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-slate-500 font-bold">{i + 1}</td>
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#5a4ff0]/20 flex items-center justify-center text-[#867bfb] font-bold text-xs flex-shrink-0">
                          {m.business_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-100">{m.business_name}</p>
                          <p className="text-[11px] text-slate-500">@{m.username}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{m.email.replace('@myisp.local', '')}</td>
                      <td className="px-6 py-4 font-bold text-slate-200">{m.user_count}</td>
                      <td className="px-6 py-4 font-bold text-[#2bd076]">{m.active_count}</td>
                      <td className="px-6 py-4 font-bold text-[#ffb752]">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                      <td className="px-6 py-4 font-bold text-[#f16775]">{Number(m.total_balance) > 0 ? `Rs. ${Number(m.total_balance).toLocaleString()}` : '—'}</td>
                      <td className="px-6 py-4 text-[11px] text-slate-500 whitespace-nowrap">{fmtTime(m.last_login)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {managers.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-500 text-sm font-medium">Koi manager nahi mila Supabase mein</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ MANAGERS ════════ */}
      {!loading && tab === 'managers' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input type="text" placeholder="Manager name, username, email search..."
              value={searchMgr} onChange={e => setSearchMgr(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/5 bg-[#181d2f] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-[#5a4ff0]" />
          </div>

          <div className="space-y-4">
            {filteredMgrs.map(m => (
              <div key={m.username} className="bg-[#181d2f] rounded-[1.25rem] border border-white/5 overflow-hidden">
                {/* Manager Header Row */}
                <div className="flex items-center gap-4 p-5">
                  <div className="w-12 h-12 rounded-xl bg-[#5a4ff0]/20 flex items-center justify-center font-bold text-[#857cfb] text-xl flex-shrink-0">
                    {m.business_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-bold text-white text-base">{m.business_name}</p>
                      <Badge color={m.user_count > 0
                        ? 'bg-[#0c241c] text-[#2bd076]'
                        : 'bg-slate-800 text-slate-400'}>
                        {m.user_count > 0 ? 'Active' : 'Empty'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span className="font-bold text-[#867bfb]">@{m.username}</span>
                      <span>{m.email.replace('@myisp.local', '')}</span>
                      <span>Joined {fmtDate(m.joined_at)}</span>
                      <span>Last login {fmtTime(m.last_login)}</span>
                    </div>
                  </div>
                  {/* Stats Pills */}
                  <div className="hidden lg:flex items-center gap-3 text-[11px] flex-wrap justify-end mr-4">
                    <span className="text-slate-400 bg-white/5 px-2.5 py-1 rounded-md"><strong className="text-blue-300">{m.user_count}</strong> customers</span>
                    <span className="text-slate-400 bg-white/5 px-2.5 py-1 rounded-md"><strong className="text-[#2bd076]">{m.active_count}</strong> active</span>
                    <span className="text-slate-400 bg-white/5 px-2.5 py-1 rounded-md"><strong className="text-[#ffb752]">{(Number(m.total_revenue) / 1000).toFixed(0)}K</strong> rev</span>
                    <span className="text-slate-400 bg-white/5 px-2.5 py-1 rounded-md"><strong className="text-[#f16775]">{(Number(m.total_balance) / 1000).toFixed(0)}K</strong> due</span>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setShowResetModal(m.username); setNewPassword(''); }} title="Reset Password"
                      className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-[#867bfb] transition-all">
                      <Key className="w-5 h-5" />
                    </button>
                    <button onClick={() => setShowDeleteConfirm(m.username)} title="Delete Manager"
                      className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-all">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Expand button */}
                  <button onClick={() => toggleExpand(m.username)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors flex-shrink-0">
                    {expandedMgr === m.username ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Expanded Customer List */}
                {expandedMgr === m.username && (
                  <div className="border-t border-white/5 bg-[#0b0f1a]">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
                      <p className="text-[10px] font-bold text-[#8695b0] uppercase tracking-widest">
                        Customer List ({m.user_count})
                      </p>
                    </div>

                    {!expandedCustomers[m.username] ? (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <div className="w-5 h-5 border-3 border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
                        <span className="text-slate-400 text-xs">Loading customers...</span>
                      </div>
                    ) : expandedCustomers[m.username].length === 0 ? (
                      <p className="px-6 py-8 text-center text-slate-500 text-xs">Is manager ke abhi koi customers nahi hain</p>
                    ) : (
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-[#0b0f1a] z-10 border-b border-white/5">
                            <tr>
                              {['#', 'Name', 'Username', 'Phone', 'Plan', 'Monthly', 'Balance', 'Expiry', 'Status'].map(h => (
                                <th key={h} className="text-left px-6 py-3 font-bold text-[#8695b0] uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {expandedCustomers[m.username].map((c, idx) => (
                              <tr key={c.id || idx} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                <td className="px-6 py-3 text-slate-500 font-bold">{idx + 1}</td>
                                <td className="px-6 py-3 font-bold text-slate-200 whitespace-nowrap">{c.name}</td>
                                <td className="px-6 py-3 text-slate-400">@{c.username}</td>
                                <td className="px-6 py-3 text-slate-400">{c.phone || '—'}</td>
                                <td className="px-6 py-3 text-slate-300 whitespace-nowrap">{c.plan}</td>
                                <td className="px-6 py-3 font-bold text-[#ffb752] whitespace-nowrap">Rs. {(c.monthlyFee || 0).toLocaleString()}</td>
                                <td className="px-6 py-3 font-bold whitespace-nowrap">{c.balance > 0 ? <span className="text-[#f16775]">Rs. {c.balance.toLocaleString()}</span> : <span className="text-slate-500">—</span>}</td>
                                <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                                <td className="px-6 py-3">
                                  <Badge color={c.status === 'active'
                                    ? 'bg-[#0c241c] text-[#2bd076]'
                                    : c.status === 'expired'
                                    ? 'bg-[#2d121b] text-[#f16775]'
                                    : 'bg-slate-800 text-slate-400'}>
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
            {filteredMgrs.length === 0 && (
              <div className="text-center py-16 text-slate-500 flex flex-col items-center">
                <Inbox className="w-12 h-12 mb-3 text-slate-600" />
                <p className="font-medium">Koi manager nahi mila</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ ALL CUSTOMERS ════════ */}
      {!loading && tab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-48 max-w-md">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input type="text" placeholder="Name, username, phone, plan ya manager search..."
                value={searchCust} onChange={e => setSearchCust(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/5 bg-[#181d2f] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-[#5a4ff0]" />
            </div>
            <div className="flex gap-1 bg-[#181d2f] border border-white/5 rounded-xl p-1">
              {(['all', 'active', 'expired'] as const).map(f => (
                <button key={f} onClick={() => setCustFilter(f)}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${custFilter === f ? 'bg-[#5a4ff0] text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                  {f} ({f === 'all' ? allCustomers.length : allCustomers.filter(c => c.status === f).length})
                </button>
              ))}
            </div>
            {allCustomers.length === 0 && !custLoading && (
              <button onClick={loadAllCustomers}
                className="px-5 py-3 rounded-xl bg-[#5a4ff0] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-indigo-600 transition-colors">
                Load All Customers
              </button>
            )}
          </div>

          {custLoading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <div className="w-6 h-6 border-4 border-[#5a4ff0] border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400 font-bold text-sm">Tamam managers ke customers load ho rahe hain...</span>
            </div>
          ) : (
            <div className="bg-[#181d2f] rounded-[1.25rem] border border-white/5 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
                <h3 className="font-bold text-white text-[13px] flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  Customer Directory
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{filteredCusts.length} shown</p>
              </div>
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#1b2237] z-10 border-b border-white/5 shadow-sm">
                    <tr>
                      {['#', 'Customer', 'Manager', 'Plan', 'Monthly', 'Balance', 'Expiry', 'Status'].map(h => (
                        <th key={h} className="text-left px-6 py-4 font-bold text-[#8695b0] uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCusts.length === 0 ? (
                      <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                        {allCustomers.length === 0 ? 'Click "Load All Customers" button uppar' : 'Koi customer nahi mila is filter ke liye'}
                      </td></tr>
                    ) : filteredCusts.map((c, i) => (
                      <tr key={`${c.id}-${i}`} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-slate-500 font-bold">{i + 1}</td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-200 whitespace-nowrap">{c.name}</p>
                          <p className="text-[11px] text-slate-400">@{c.username}{c.phone ? ` · ${c.phone}` : ''}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-300 whitespace-nowrap">{c.managerBusiness}</p>
                          <p className="text-[11px] text-slate-400">@{c.managerUsername}</p>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-300 whitespace-nowrap">{c.plan}</td>
                        <td className="px-6 py-4 font-bold text-[#ffb752] whitespace-nowrap">Rs. {(c.monthlyFee || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 font-bold whitespace-nowrap">{c.balance > 0 ? <span className="text-[#f16775]">Rs. {c.balance.toLocaleString()}</span> : <span className="text-slate-500">—</span>}</td>
                        <td className="px-6 py-4 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                        <td className="px-6 py-4">
                          <Badge color={c.status === 'active'
                            ? 'bg-[#0c241c] text-[#2bd076]'
                            : c.status === 'expired'
                            ? 'bg-[#2d121b] text-[#f16775]'
                            : 'bg-slate-800 text-slate-400'}>
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

      {/* ════════ SYSTEM ════════ */}
      {!loading && tab === 'system' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-[#181d2f] rounded-[1.25rem] border border-white/5 p-6 space-y-6">
            <h3 className="font-bold text-white text-[13px] flex items-center gap-2 tracking-wide">
              <Server className="w-4 h-4 text-slate-400" />
              Live Database Stats
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Managers', value: totals.managers },
                { label: 'Total Customers', value: totals.customers },
                { label: 'Active Customers', value: totals.active },
                { label: 'Total Receipts', value: totals.receipts },
                { label: 'Total Revenue', value: `Rs. ${totals.revenue.toLocaleString()}` },
                { label: 'Pending Dues', value: `Rs. ${totals.balance.toLocaleString()}` },
              ].map(item => (
                <div key={item.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <p className="text-[#8695b0] font-bold uppercase tracking-wider text-[10px] mb-2">{item.label}</p>
                  <p className="font-bold text-white text-xl">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* All Managers Detail Table */}
          <div className="bg-[#181d2f] rounded-[1.25rem] border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.04]">
              <h3 className="font-bold text-white text-[13px] tracking-wide">Manager Accounts Log</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1b2237]">
                    {['Username', 'Business', 'Email', 'Joined', 'Last Login'].map(h => (
                      <th key={h} className="text-left px-6 py-4 font-bold text-[#8695b0] uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map(m => (
                    <tr key={m.username} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-6 py-4 font-bold text-[#867bfb]">@{m.username}</td>
                      <td className="px-6 py-4 text-slate-300 font-bold">{m.business_name}</td>
                      <td className="px-6 py-4 text-slate-400">{m.email.replace('@myisp.local', '')}</td>
                      <td className="px-6 py-4 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(m.joined_at)}</td>
                      <td className="px-6 py-4 text-[11px] text-slate-500 whitespace-nowrap">{fmtTime(m.last_login)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0f1c]/80 backdrop-blur-sm" onClick={() => setShowResetModal(null)} />
          <div className="relative z-10 w-full max-w-sm bg-[#12162a] rounded-[1.5rem] shadow-2xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-1">Reset Password</h2>
            <p className="text-xs text-slate-400 mb-6 font-medium">@{showResetModal} ka naya password set karein</p>
            <input type="text" placeholder="Naya password likhein" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-[#5a4ff0] mb-4" />
            {newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider mb-4 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Password kam az kam 6 characters ka hona chahiye
              </p>
            )}
            <div className="flex gap-3 mt-2">
              <button onClick={() => { setShowResetModal(null); setNewPassword(''); }} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={handleReset} disabled={!newPassword.trim() || newPassword.length < 6}
                className="flex-1 py-3 rounded-xl bg-[#5a4ff0] text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-40 active:scale-95 transition-all">
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a0f1c]/80 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm bg-[#12162a] rounded-[1.5rem] shadow-2xl border border-rose-500/20 p-6 text-center">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-rose-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Manager Delete Karein?</h2>
            <p className="text-sm font-bold text-[#f16775] mb-2 border border-rose-500/20 bg-rose-500/5 inline-block px-3 py-1 rounded-lg">@{showDeleteConfirm}</p>
            <p className="text-xs text-slate-400 mb-6">Yeh action <span className="font-bold text-[#f16775]">permanent</span> hai aur undo nahi ho sakti.</p>
            
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-widest font-bold">Type "DELETE" to confirm:</p>
            <input
              id="delete-confirm-input"
              type="text"
              placeholder="DELETE"
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-sm text-center font-bold text-white outline-none focus:ring-2 focus:ring-[#f16775] mb-6 uppercase tracking-wider"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 hover:text-white text-xs font-bold transition-colors">Cancel</button>
              <button onClick={() => {
                const inp = document.getElementById('delete-confirm-input') as HTMLInputElement;
                if (inp?.value?.toUpperCase() === 'DELETE') {
                  handleDelete(showDeleteConfirm);
                } else {
                  inp.classList.add('ring-2', 'ring-rose-500');
                  setTimeout(() => inp.classList.remove('ring-2', 'ring-rose-500'), 1500);
                }
              }} className="flex-1 py-3 rounded-xl bg-[#f16775] text-white text-xs font-bold hover:bg-rose-600 active:scale-95 transition-all">
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
