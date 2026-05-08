import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${color}`}>
    {children}
  </span>
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
  <button onClick={onClick}
    className={`px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${active
      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
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
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">🛡️ Admin Control Center</h1>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">
            Live Supabase Data · Synced: {lastRefresh.toLocaleTimeString()} · {totals.managers} managers · {totals.customers} customers
          </p>
        </div>
        <button onClick={loadManagers}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">
          🔄 Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>📊 Overview</TabBtn>
        <TabBtn active={tab === 'managers'} onClick={() => setTab('managers')}>👥 Managers ({totals.managers})</TabBtn>
        <TabBtn active={tab === 'customers'} onClick={() => setTab('customers')}>🧑‍💼 All Customers ({totals.customers})</TabBtn>
        <TabBtn active={tab === 'system'} onClick={() => setTab('system')}>⚙️ System</TabBtn>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 font-bold text-sm">Supabase se data load ho raha hai...</span>
        </div>
      )}

      {/* ════════ OVERVIEW ════════ */}
      {!loading && tab === 'overview' && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon="👥" label="Managers" value={totals.managers} color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200" />
            <KpiCard icon="🧑‍💼" label="Total Customers" value={totals.customers} color="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200" />
            <KpiCard icon="✅" label="Active" value={totals.active}
              sub={`${totals.customers ? Math.round(totals.active / totals.customers * 100) : 0}%`}
              color="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200" />
            <KpiCard icon="❌" label="Expired" value={totals.customers - totals.active} color="bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200" />
            <KpiCard icon="💰" label="Total Revenue"
              value={`Rs.${(totals.revenue / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.revenue.toLocaleString()}`}
              color="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200" />
            <KpiCard icon="⚠️" label="Pending Dues"
              value={`Rs.${(totals.balance / 1000).toFixed(0)}K`}
              sub={`Rs. ${totals.balance.toLocaleString()}`}
              color="bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200" />
          </div>

          {/* All Managers Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-black text-slate-800 dark:text-white text-sm">📋 All Managers — Live Data</h3>
              <button onClick={() => setTab('managers')} className="text-xs text-indigo-500 font-bold">Details →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    {['#', 'Manager', 'Email', 'Customers', 'Active', 'Revenue', 'Dues', 'Last Login'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m, i) => (
                    <tr key={m.username} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-black">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xs flex-shrink-0">
                            {m.business_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 dark:text-white">{m.business_name}</p>
                            <p className="text-slate-400">@{m.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{m.email.replace('@myisp.local', '')}</td>
                      <td className="px-4 py-3 font-black text-slate-700 dark:text-slate-300">{m.user_count}</td>
                      <td className="px-4 py-3 font-black text-emerald-600 dark:text-emerald-400">{m.active_count}</td>
                      <td className="px-4 py-3 font-black text-amber-600">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-rose-500">{Number(m.total_balance) > 0 ? `Rs. ${Number(m.total_balance).toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtTime(m.last_login)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {managers.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-400 text-sm">Koi manager nahi mila Supabase mein</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ MANAGERS ════════ */}
      {!loading && tab === 'managers' && (
        <div className="space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input type="text" placeholder="Manager name, username, email search..."
              value={searchMgr} onChange={e => setSearchMgr(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div className="space-y-3">
            {filteredMgrs.map(m => (
              <div key={m.username} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Manager Header Row */}
                <div className="flex items-center gap-4 p-4">
                  <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center font-black text-indigo-600 dark:text-indigo-300 text-xl flex-shrink-0">
                    {m.business_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900 dark:text-white">{m.business_name}</p>
                      <Badge color={m.user_count > 0
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}>
                        {m.user_count > 0 ? '🟢 Active' : '⚪ Empty'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
                      <span>@{m.username}</span>
                      <span>📧 {m.email.replace('@myisp.local', '')}</span>
                      <span>📅 Joined {fmtDate(m.joined_at)}</span>
                      <span>🕐 Last login {fmtTime(m.last_login)}</span>
                    </div>
                  </div>
                  {/* Stats Pills */}
                  <div className="hidden sm:flex items-center gap-2 text-xs flex-wrap justify-end">
                    <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-lg font-black">{m.user_count} customers</span>
                    <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg font-black">{m.active_count} active</span>
                    <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg font-black">Rs.{(Number(m.total_revenue) / 1000).toFixed(0)}K rev</span>
                    <span className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg font-black">Rs.{(Number(m.total_balance) / 1000).toFixed(0)}K due</span>
                    <span className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg font-black">{m.receipt_count} receipts</span>
                  </div>
                  {/* Expand button */}
                  <button onClick={() => toggleExpand(m.username)}
                    className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg flex-shrink-0">
                    {expandedMgr === m.username ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded Customer List */}
                {expandedMgr === m.username && (
                  <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Customer List ({m.user_count})
                      </p>
                      <div className="flex gap-3 text-xs">
                        <span className="text-emerald-600 font-bold">{m.active_count} active</span>
                        <span className="text-rose-500 font-bold">{m.user_count - m.active_count} expired</span>
                        <span className="text-amber-600 font-bold">Rs. {Number(m.total_revenue).toLocaleString()} collected</span>
                      </div>
                    </div>

                    {!expandedCustomers[m.username] ? (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <div className="w-5 h-5 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-slate-400 text-xs">Loading customers...</span>
                      </div>
                    ) : expandedCustomers[m.username].length === 0 ? (
                      <p className="px-4 pb-4 text-center text-slate-400 text-xs">Is manager ke abhi koi customers nahi hain</p>
                    ) : (
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/90">
                            <tr>
                              {['#', 'Name', 'Username', 'Phone', 'Plan', 'Monthly', 'Balance', 'Expiry', 'Status'].map(h => (
                                <th key={h} className="text-left px-4 py-2 font-black text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {expandedCustomers[m.username].map((c, idx) => (
                              <tr key={c.id || idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                <td className="px-4 py-2 text-slate-400 font-bold">{idx + 1}</td>
                                <td className="px-4 py-2 font-bold text-slate-800 dark:text-white whitespace-nowrap">{c.name}</td>
                                <td className="px-4 py-2 text-slate-500">@{c.username}</td>
                                <td className="px-4 py-2 text-slate-500">{c.phone || '—'}</td>
                                <td className="px-4 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.plan}</td>
                                <td className="px-4 py-2 font-black text-amber-600 whitespace-nowrap">Rs. {(c.monthlyFee || 0).toLocaleString()}</td>
                                <td className="px-4 py-2 font-black whitespace-nowrap">{c.balance > 0 ? <span className="text-rose-500">Rs. {c.balance.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</td>
                                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                                <td className="px-4 py-2">
                                  <Badge color={c.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : c.status === 'expired'
                                    ? 'bg-rose-100 text-rose-600'
                                    : 'bg-slate-100 text-slate-500'}>
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
              <div className="text-center py-16 text-slate-400"><p className="text-4xl mb-3">📭</p><p className="font-bold">Koi manager nahi mila</p></div>
            )}
          </div>
        </div>
      )}

      {/* ════════ ALL CUSTOMERS ════════ */}
      {!loading && tab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Name, username, phone, plan ya manager search..."
                value={searchCust} onChange={e => setSearchCust(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              {(['all', 'active', 'expired'] as const).map(f => (
                <button key={f} onClick={() => setCustFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black capitalize transition-all ${custFilter === f ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                  {f} ({f === 'all' ? allCustomers.length : allCustomers.filter(c => c.status === f).length})
                </button>
              ))}
            </div>
            {allCustomers.length === 0 && !custLoading && (
              <button onClick={loadAllCustomers}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors">
                Load All Customers
              </button>
            )}
          </div>

          {custLoading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-500 font-bold text-sm">Tamam managers ke customers load ho rahe hain...</span>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400 font-bold">{filteredCusts.length} customers found (Total: {allCustomers.length})</p>
              </div>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700/90 z-10">
                    <tr>
                      {['#', 'Customer', 'Manager', 'Plan', 'Monthly', 'Balance', 'Expiry', 'Status'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCusts.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        {allCustomers.length === 0 ? 'Click "Load All Customers" button uppar' : 'Koi customer nahi mila is filter ke liye'}
                      </td></tr>
                    ) : filteredCusts.map((c, i) => (
                      <tr key={`${c.id}-${i}`} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2.5 text-slate-400 font-bold">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-black text-slate-800 dark:text-white whitespace-nowrap">{c.name}</p>
                          <p className="text-slate-400">@{c.username}{c.phone ? ` · ${c.phone}` : ''}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.managerBusiness}</p>
                          <p className="text-slate-400">@{c.managerUsername}</p>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.plan}</td>
                        <td className="px-4 py-2.5 font-black text-amber-600 whitespace-nowrap">Rs. {(c.monthlyFee || 0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 font-black whitespace-nowrap">{c.balance > 0 ? <span className="text-rose-500">Rs. {c.balance.toLocaleString()}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(c.expiryDate)}</td>
                        <td className="px-4 py-2.5">
                          <Badge color={c.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : c.status === 'expired'
                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}>
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
        <div className="space-y-4 max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="font-black text-slate-800 dark:text-white text-sm">📊 Live Database Stats</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'Total Managers', value: totals.managers },
                { label: 'Total Customers', value: totals.customers },
                { label: 'Active Customers', value: totals.active },
                { label: 'Total Receipts', value: totals.receipts },
                { label: 'Total Revenue', value: `Rs. ${totals.revenue.toLocaleString()}` },
                { label: 'Pending Dues', value: `Rs. ${totals.balance.toLocaleString()}` },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                  <p className="text-slate-400 uppercase tracking-wide text-[10px]">{item.label}</p>
                  <p className="font-black text-slate-800 dark:text-white text-base">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* All Managers Detail Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-black text-slate-800 dark:text-white text-sm">🔐 Manager Accounts (Supabase)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    {['Username', 'Business', 'Email', 'Joined', 'Last Login', 'Customers', 'Revenue'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map(m => (
                    <tr key={m.username} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-4 py-2.5 font-black text-slate-800 dark:text-white">@{m.username}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{m.business_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{m.email.replace('@myisp.local', '')}</td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(m.joined_at)}</td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{fmtTime(m.last_login)}</td>
                      <td className="px-4 py-2.5 font-black text-blue-600">{m.user_count}</td>
                      <td className="px-4 py-2.5 font-black text-amber-600">Rs. {Number(m.total_revenue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
