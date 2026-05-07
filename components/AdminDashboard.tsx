import React, { useState, useEffect, useMemo } from 'react';

// ─── Types (inline for self-contained component) ─────────────────────────────
interface ManagerAccount {
  username: string;
  password: string;
  businessName: string;
  email?: string;
  phone?: string;
  createdAt: string;
  rememberPassword?: boolean;
}

interface UserRecord {
  id: string;
  username: string;
  name: string;
  plan: string;
  monthlyFee: number;
  balance: number;
  expiryDate: string;
  status: 'active' | 'expired' | 'pending' | 'deleted';
  companyId?: string;
}

interface Receipt {
  id: string;
  userId: string;
  totalAmount: number;
  paidAmount: number;
  date: string;
  period: string;
  companyId?: string;
}

interface AppState {
  users: UserRecord[];
  receipts: Receipt[];
  settings?: { businessName?: string };
  companies?: { id: string; name: string; settings?: { businessName?: string } }[];
}

interface ManagerStats {
  username: string;
  businessName: string;
  email?: string;
  phone?: string;
  createdAt: string;
  totalCustomers: number;
  activeCustomers: number;
  expiredCustomers: number;
  totalRevenue: number;
  totalBalance: number;
  totalReceipts: number;
  rawState: AppState | null;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
const DATA_PREFIX = 'mahadnet_data_';
const MANAGERS_KEY = 'mahadnet_managers';

function loadManagerState(username: string): AppState | null {
  try {
    const raw = localStorage.getItem(`${DATA_PREFIX}${username}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as AppState;
  } catch {
    return null;
  }
}

function getAllManagerUsernames(): string[] {
  const usernames: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DATA_PREFIX)) {
      const username = key.replace(DATA_PREFIX, '');
      if (username && username !== 'admin') {
        usernames.push(username);
      }
    }
  }
  return usernames;
}

function getRegisteredManagers(): ManagerAccount[] {
  try {
    const raw = localStorage.getItem(MANAGERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ManagerAccount[];
  } catch {
    return [];
  }
}

function saveRegisteredManagers(managers: ManagerAccount[]) {
  localStorage.setItem(MANAGERS_KEY, JSON.stringify(managers));
}

// ─── Helper: compute stats for one manager ───────────────────────────────────
function computeStats(username: string, account?: ManagerAccount): ManagerStats {
  const state = loadManagerState(username);
  const users: UserRecord[] = state?.users || [];
  const receipts: Receipt[] = state?.receipts || [];

  const businessName =
    account?.businessName ||
    state?.settings?.businessName ||
    state?.companies?.[0]?.settings?.businessName ||
    username;

  const activeCustomers = users.filter(u => u.status === 'active').length;
  const expiredCustomers = users.filter(u => u.status === 'expired').length;
  const totalRevenue = receipts.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
  const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);

  return {
    username,
    businessName,
    email: account?.email,
    phone: account?.phone,
    createdAt: account?.createdAt || '',
    totalCustomers: users.length,
    activeCustomers,
    expiredCustomers,
    totalRevenue,
    totalBalance,
    totalReceipts: receipts.length,
    rawState: state,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}) {
  return (
    <div className={`rounded-2xl p-4 ${color} flex flex-col gap-1`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-xl font-black">{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const [managers, setManagers] = useState<ManagerStats[]>([]);
  const [registeredAccounts, setRegisteredAccounts] = useState<ManagerAccount[]>([]);
  const [selectedManager, setSelectedManager] = useState<ManagerStats | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newManager, setNewManager] = useState({
    username: '',
    password: '',
    businessName: '',
    email: '',
    phone: '',
  });
  const [formError, setFormError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // ── Load all managers ─────────────────────────────────────────────────────
  const loadAllManagers = () => {
    const registered = getRegisteredManagers();
    setRegisteredAccounts(registered);

    // Merge: accounts from registry + any data-only entries in localStorage
    const usernamesFromStorage = getAllManagerUsernames();
    const usernamesFromRegistry = registered.map(m => m.username);
    const allUsernames = Array.from(new Set([...usernamesFromRegistry, ...usernamesFromStorage]));

    const stats = allUsernames.map(username => {
      const account = registered.find(m => m.username === username);
      return computeStats(username, account);
    });

    // Sort: most customers first
    stats.sort((a, b) => b.totalCustomers - a.totalCustomers);
    setManagers(stats);
    setLastRefresh(new Date());
  };

  useEffect(() => {
    loadAllManagers();
  }, []);

  // ── Global totals ─────────────────────────────────────────────────────────
  const totals = useMemo(
    () => ({
      managers: managers.length,
      customers: managers.reduce((s, m) => s + m.totalCustomers, 0),
      active: managers.reduce((s, m) => s + m.activeCustomers, 0),
      revenue: managers.reduce((s, m) => s + m.totalRevenue, 0),
      balance: managers.reduce((s, m) => s + m.totalBalance, 0),
    }),
    [managers]
  );

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return managers;
    const q = searchQuery.toLowerCase();
    return managers.filter(
      m =>
        m.username.toLowerCase().includes(q) ||
        m.businessName.toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.phone || '').includes(q)
    );
  }, [managers, searchQuery]);

  // ── Add new manager ───────────────────────────────────────────────────────
  const handleAddManager = () => {
    setFormError('');
    const { username, password, businessName } = newManager;
    if (!username.trim() || !password.trim() || !businessName.trim()) {
      setFormError('Username, Password aur Business Name zaroori hain!');
      return;
    }
    if (username.toLowerCase() === 'admin') {
      setFormError('"admin" username use nahi kar saktay!');
      return;
    }
    const existing = registeredAccounts.find(
      m => m.username.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      setFormError('Yeh username already maujood hai!');
      return;
    }

    const account: ManagerAccount = {
      username: username.trim().toLowerCase(),
      password: password.trim(),
      businessName: businessName.trim(),
      email: newManager.email.trim(),
      phone: newManager.phone.trim(),
      createdAt: new Date().toISOString(),
    };

    const updated = [...registeredAccounts, account];
    saveRegisteredManagers(updated);

    // Create empty state for this manager
    const emptyState: AppState = {
      users: [],
      receipts: [],
      settings: { businessName: businessName.trim() },
      companies: [
        {
          id: 'COMP-DEFAULT',
          name: businessName.trim(),
          settings: { businessName: businessName.trim() },
        },
      ],
    };
    localStorage.setItem(`${DATA_PREFIX}${account.username}`, JSON.stringify(emptyState));

    setNewManager({ username: '', password: '', businessName: '', email: '', phone: '' });
    setShowAddModal(false);
    loadAllManagers();
  };

  // ── Delete manager ────────────────────────────────────────────────────────
  const handleDeleteManager = (username: string) => {
    const updated = registeredAccounts.filter(m => m.username !== username);
    saveRegisteredManagers(updated);
    localStorage.removeItem(`${DATA_PREFIX}${username}`);
    setShowDeleteConfirm(null);
    setSelectedManager(null);
    loadAllManagers();
  };

  // ── Reset manager password ────────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const handleResetPassword = () => {
    if (!resetTarget || !newPassword.trim()) return;
    const updated = registeredAccounts.map(m =>
      m.username === resetTarget ? { ...m, password: newPassword.trim() } : m
    );
    saveRegisteredManagers(updated);
    setResetTarget(null);
    setNewPassword('');
    loadAllManagers();
  };

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            🛡️ Admin Control Panel
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Last refreshed: {lastRefresh.toLocaleTimeString()} &nbsp;·&nbsp; {managers.length} manager(s)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAllManagers}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
          >
            ＋ Add Manager
          </button>
        </div>
      </div>

      {/* ── Global Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Managers" value={totals.managers} color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200" icon="👥" />
        <StatCard label="Total Customers" value={totals.customers} color="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200" icon="🧑‍💼" />
        <StatCard label="Active" value={totals.active} color="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200" icon="✅" />
        <StatCard label="Total Revenue" value={`Rs. ${totals.revenue.toLocaleString()}`} color="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200" icon="💰" />
        <StatCard label="Pending Balance" value={`Rs. ${totals.balance.toLocaleString()}`} color="bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200" icon="⚠️" />
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          type="text"
          placeholder="Manager search karein (name, username, phone)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* ── Manager Cards ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-600">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-bold">
            {managers.length === 0
              ? 'Abhi koi manager account nahi hai. "Add Manager" se banayein!'
              : 'Koi manager nahi mila is search ke liye.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(m => (
            <div
              key={m.username}
              onClick={() => setSelectedManager(m)}
              className="cursor-pointer rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:shadow-lg hover:border-indigo-400 transition-all"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-black text-lg">
                    {m.businessName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 dark:text-white text-sm leading-tight">
                      {m.businessName}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">@{m.username}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-full ${m.totalCustomers > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                  {m.totalCustomers > 0 ? '🟢 Active' : '⚪ Empty'}
                </span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2">
                  <p className="text-lg font-black text-slate-800 dark:text-white">{m.totalCustomers}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2">
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{m.activeCustomers}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Active</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-2">
                  <p className="text-lg font-black text-rose-600 dark:text-rose-400">{m.expiredCustomers}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Expired</p>
                </div>
              </div>

              {/* Revenue */}
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
                <span>💰 Rs. {m.totalRevenue.toLocaleString()}</span>
                <span>⚠️ Rs. {m.totalBalance.toLocaleString()} due</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MANAGER DETAIL MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {selectedManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSelectedManager(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black">{selectedManager.businessName}</h2>
                  <p className="text-indigo-200 text-sm">@{selectedManager.username}</p>
                </div>
                <button onClick={() => setSelectedManager(null)} className="text-white/70 hover:text-white text-xl">✕</button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Contact Info */}
              <div className="space-y-2">
                {selectedManager.email && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span>📧</span> {selectedManager.email}
                  </div>
                )}
                {selectedManager.phone && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span>📱</span> {selectedManager.phone}
                  </div>
                )}
                {selectedManager.createdAt && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>📅</span> Joined: {new Date(selectedManager.createdAt).toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-slate-900 dark:text-white">{selectedManager.totalCustomers}</p>
                  <p className="text-xs text-slate-400">Total Customers</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{selectedManager.activeCustomers}</p>
                  <p className="text-xs text-slate-400">Active</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-400">Rs. {selectedManager.totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Total Revenue</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400">Rs. {selectedManager.totalBalance.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Pending Balance</p>
                </div>
              </div>

              {/* Customers List Preview */}
              {selectedManager.rawState && selectedManager.rawState.users.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Recent Customers</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {selectedManager.rawState.users.slice(0, 8).map(u => (
                      <div key={u.id} className="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{u.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{u.plan}</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                            {u.status}
                          </span>
                        </div>
                      </div>
                    ))}
                    {selectedManager.rawState.users.length > 8 && (
                      <p className="text-center text-xs text-slate-400 py-1">
                        +{selectedManager.rawState.users.length - 8} more customers
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setResetTarget(selectedManager.username); setNewPassword(''); }}
                  className="flex-1 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-black hover:bg-indigo-100 transition-colors"
                >
                  🔑 Reset Password
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(selectedManager.username)}
                  className="flex-1 py-3 rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-xs font-black hover:bg-rose-100 transition-colors"
                >
                  🗑️ Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ADD MANAGER MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">➕ New Manager Account</h2>

            <div className="space-y-3">
              {[
                { label: 'Username *', key: 'username', placeholder: 'e.g. ali_isp', type: 'text' },
                { label: 'Password *', key: 'password', placeholder: 'Strong password', type: 'password' },
                { label: 'Business Name *', key: 'businessName', placeholder: 'e.g. Ali Networks', type: 'text' },
                { label: 'Email (optional)', key: 'email', placeholder: 'ali@example.com', type: 'email' },
                { label: 'Phone (optional)', key: 'phone', placeholder: '03001234567', type: 'tel' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={newManager[field.key as keyof typeof newManager]}
                    onChange={e => setNewManager(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              ))}

              {formError && (
                <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/30 rounded-xl px-3 py-2">
                  ⚠️ {formError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowAddModal(false); setFormError(''); }}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddManager}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors"
                >
                  ✅ Create Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          RESET PASSWORD MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setResetTarget(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">🔑 Reset Password</h2>
            <p className="text-xs text-slate-400 mb-4">@{resetTarget} ka naya password set karein</p>
            <input
              type="password"
              placeholder="Naya password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setResetTarget(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 text-xs font-black">Cancel</button>
              <button onClick={handleResetPassword} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DELETE CONFIRM MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">Delete Manager?</h2>
            <p className="text-xs text-slate-500 mb-6">
              <span className="font-bold text-rose-600">@{showDeleteConfirm}</span> ka account aur uska poora data permanently delete ho jayega. Yeh action undo nahi hoga!
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 text-xs font-black">Cancel</button>
              <button onClick={() => handleDeleteManager(showDeleteConfirm)} className="flex-1 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
