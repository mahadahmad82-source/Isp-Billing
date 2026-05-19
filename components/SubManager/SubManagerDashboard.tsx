import React, { useState, useMemo, useEffect } from 'react';
import LocationTracker from './LocationTracker';
import { UserRecord, AppSettings, Receipt, PaymentStatus, SubManagerAccount, AttendanceLog } from '../../types';
import { supabase } from '../../lib/supabase';

interface SubManagerDashboardProps {
  subManagerName: string;
  agentArea?: string;
  agentId?: string;
  agent?: SubManagerAccount;
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  attendanceLogs: AttendanceLog[];
  onLogout: () => void;
  onIssueInvoice: (userId: string, agentId?: string) => void;
  onViewReceipt: (receipt: Receipt) => void;
  onUpdateAgent: (agentId: string, updates: any) => void;
  onAddAttendanceLog: (log: Omit<AttendanceLog, 'id'>) => void;
}

const SubManagerDashboard: React.FC<SubManagerDashboardProps> = ({
  subManagerName,
  agentArea,
  agentId,
  agent,
  users,
  receipts,
  settings,
  onLogout,
  onIssueInvoice,
  onViewReceipt,
  onUpdateAgent,
  onAddAttendanceLog,
  attendanceLogs,
}) => {
  const [activePortalTab, setActivePortalTab] = useState<'clients' | 'attendance'>('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [dutyStatus, setDutyStatus] = useState<'online' | 'offline'>(agent?.dutyStatus || 'offline');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('pending');
  const [sortConfig, setSortConfig] = useState<{ key: keyof UserRecord | 'displayStatus' | 'displayBalance', direction: 'asc' | 'desc' | null }>({ key: 'name', direction: 'asc' });

  // ── Direct Supabase load for agent — bypass App.tsx filters ──
  const [agentUsers, setAgentUsers]       = useState<UserRecord[]>([]);
  const [agentReceipts, setAgentReceipts] = useState<Receipt[]>([]);
  const [agentSettings, setAgentSettings] = useState<AppSettings>(settings);
  const [dataLoading, setDataLoading]     = useState(true);

  useEffect(() => {
    const loadManagerData = async () => {
      setDataLoading(true);
      try {
        let managerId = agent?.managerUsername || '';

        // Try Supabase — most reliable source
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Try by auth_user_id first
          const { data: agentRow } = await supabase
            .from('sub_managers')
            .select('manager_id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

          if (agentRow?.manager_id) {
            managerId = agentRow.manager_id;
          } else {
            // Fallback: try by username
            const { data: agentRow2 } = await supabase
              .from('sub_managers')
              .select('manager_id')
              .eq('username', subManagerName)
              .maybeSingle();
            if (agentRow2?.manager_id) managerId = agentRow2.manager_id;
          }
        }

        if (!managerId) { setDataLoading(false); return; }

        // Load manager full data
        const { data: managerRow } = await supabase
          .from('manager_data')
          .select('data')
          .eq('manager_id', managerId)
          .maybeSingle();

        if (managerRow?.data) {
          const mData = managerRow.data as any;
          const companies = mData.companies || [];
          const activeCompanyId = mData.activeCompanyId || '';
          const activeCompany = companies.find((c: any) => c.id === activeCompanyId) || companies[0];
          const mSettings: AppSettings = activeCompany?.settings || mData.settings || settings;

          const allUsers: UserRecord[] = mData.users || [];
          const companyUsers = activeCompanyId
            ? allUsers.filter((u: any) => !u.companyId || u.companyId === activeCompanyId)
            : allUsers;
          // Current month label — same as manager's activatedMonths format
          const currentMonthLabel = new Intl.DateTimeFormat('en-US', {
            month: 'long', year: 'numeric'
          }).format(new Date()); // "May 2026"

          // Only users activated in current month — matches manager's Active Customers view exactly
          const activeUsers = companyUsers.filter((u: any) => {
            if (u.status === 'deleted' || u.status === 'suspended') return false;
            const months: string[] = u.activatedMonths || [];
            return months.includes(currentMonthLabel);
          });

          const allReceipts: Receipt[] = mData.receipts || [];
          const companyReceipts = activeCompanyId
            ? allReceipts.filter((r: any) => !r.companyId || r.companyId === activeCompanyId)
            : allReceipts;

          setAgentUsers(activeUsers);
          setAgentReceipts(companyReceipts);
          setAgentSettings(mSettings);
        }
      } catch (err) {
        console.error('Agent data load error:', err);
      } finally {
        setDataLoading(false);
      }
    };

    loadManagerData();
  }, [subManagerName, agent?.managerUsername]);

  const handleSort = (key: keyof UserRecord | 'displayStatus' | 'displayBalance') => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const handleDutyStatusChange = (status: 'online' | 'offline') => {
    if (status === dutyStatus) return;
    
    setDutyStatus(status);
    if (agentId) {
      const updates: any = { dutyStatus: status };
      if (status === 'online') {
        updates.lastCheckIn = new Date().toISOString();
        updates.isLeave = false;
        
        onAddAttendanceLog({
          subManagerId: agentId,
          type: 'check-in',
          timestamp: new Date().toISOString(),
          location: agent?.lastLocation ? { lat: agent.lastLocation.lat, lng: agent.lastLocation.lng } : undefined
        });
      } else {
        updates.lastCheckOut = new Date().toISOString();
        updates.lastLocation = null; // Wipe location state on checkout for privacy
        
        onAddAttendanceLog({
          subManagerId: agentId,
          type: 'check-out',
          timestamp: new Date().toISOString(),
          location: agent?.lastLocation ? { lat: agent.lastLocation.lat, lng: agent.lastLocation.lng } : undefined
        });
      }
      onUpdateAgent(agentId, updates);
    }
  };

  const handleApplyLeave = () => {
    if (!agentId || !leaveReason.trim()) return;
    
    onAddAttendanceLog({
      subManagerId: agentId,
      type: 'leave',
      timestamp: new Date().toISOString(),
      reason: leaveReason
    });
    
    onUpdateAgent(agentId, {
      dutyStatus: 'offline',
      isLeave: true,
      lastCheckOut: new Date().toISOString()
    });
    
    setDutyStatus('offline');
    setLeaveReason('');
    setShowLeaveModal(false);
  };

  const handleLocationUpdate = (loc: { lat: number; lng: number; accuracy: number; timestamp: number }) => {
    if (agentId) {
      onUpdateAgent(agentId, { 
        lastLocation: {
          lat: loc.lat,
          lng: loc.lng,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  const dailyStats = useMemo(() => {
    const today = new Date();
    const currentDayStr = today.toDateString();
    const todayAgentReceipts = agentReceipts.filter(r => {
      const isCollectedByMe = (r.collectedBy === agentId || r.collectedBy === agent?.username);
      return isCollectedByMe && new Date(r.date).toDateString() === currentDayStr;
    });
    return {
      amount: todayAgentReceipts.reduce((sum, r) => sum + (r.paidAmount || 0), 0),
      count: todayAgentReceipts.length
    };
  }, [agentReceipts, agentId, agent?.username]);

  const augmentedUsers = useMemo(() => {
    const currentMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
    const currentMonth = new Date().getMonth();
    const currentYear  = new Date().getFullYear();

    return agentUsers.map((u) => {
      const userReceipts = agentReceipts.filter(r => r.userId === u.id);
      const latestReceipt = userReceipts.length > 0
        ? [...userReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;

      // EXACT same logic as manager's recovery ledger:
      // PAID = receipt with period "May 2026" AND status "Success"
      const hasPaidThisMonth = userReceipts.some(r =>
        r.period === currentMonthLabel &&
        r.status === PaymentStatus.SUCCESS
      );

      // Fallback: receipt date in current month with Success status
      // (handles cases where period not set but date is current month)
      const hasPaidByDate = !hasPaidThisMonth && userReceipts.some(r => {
        const rDate = new Date(r.date);
        return r.status === PaymentStatus.SUCCESS &&
          rDate.getMonth() === currentMonth &&
          rDate.getFullYear() === currentYear;
      });

      const hasPaidRecently = hasPaidThisMonth || hasPaidByDate;

      // isClear ONLY if actually paid — do not use balance < 0 as paid indicator
      const balance   = u.balance || 0;
      const isClear   = hasPaidRecently;

      // Plan price — handle both name formats (dash vs bracket)
      // "Alpha-15mb" → "Alpha (15MB)", "Blue-20mb" → "Blue (20MB)"
      const planKey = u.plan || '';
      const normalizedKey = planKey
        .replace(/-(\d+)mb$/i, (_: string, n: string) => ` (${n}MB)`)
        .replace(/-(\d+)Mb$/i, (_: string, n: string) => ` (${n}MB)`);
      const planPrice = agentSettings?.planPrices?.[planKey] ||
                        agentSettings?.planPrices?.[normalizedKey] ||
                        1500;
      // Dues: if balance > 0 user owes that amount, otherwise show plan price
      // balance = 0 and not paid = full plan price pending
      const dues = isClear ? 0 : (balance > 0 ? balance : planPrice);

      return {
        ...u,
        displayBalance: dues,
        displayStatus:  isClear ? 'clear' : 'pending',
        latestReceipt,
      };
    });
  }, [agentUsers, agentReceipts, agentSettings]);

  const sortedUsers = useMemo(() => {
    const list = augmentedUsers.filter(u => {
      const nameSafe = String(u.name || '');
      const usernameSafe = String(u.username || '');
      const phoneSafe = String(u.phone || '');

      const matchesSearch = nameSafe.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           usernameSafe.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           phoneSafe.includes(searchTerm);
      
      const isPaid = u.displayStatus === 'clear';
      const matchesFilter = filter === 'all' || 
                           (filter === 'paid' && isPaid) || 
                           (filter === 'pending' && !isPaid);
      
      return matchesSearch && matchesFilter && u.status !== 'deleted';
    });

    if (sortConfig.key && sortConfig.direction) {
      list.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [augmentedUsers, searchTerm, filter, sortConfig]);

  const counts = useMemo(() => {
    return {
      all: augmentedUsers.filter(u => u.status !== 'deleted').length,
      paid: augmentedUsers.filter(u => u.displayStatus === 'clear' && u.status !== 'deleted').length,
      pending: augmentedUsers.filter(u => u.displayStatus === 'pending' && u.status !== 'deleted').length
    };
  }, [augmentedUsers]);

  const filterTabs = [
    { id: 'all', label: `All (${counts.all})` },
    { id: 'paid', label: `Paid (${counts.paid})` },
    { id: 'pending', label: `Pending (${counts.pending})` }
  ] as const;

  // Loading state while fetching manager data from Supabase
  if (dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-900">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Loading customer data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f1a] text-slate-900 dark:text-slate-300">
      {/* Dynamic Header - Hidden on mobile if bottom nav is enough, but keeping simple one for identity */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-[#0b0f1a]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 py-3 px-4 sm:py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 text-sm sm:text-base">
                {subManagerName.charAt(0).toUpperCase()}
              </div>
              <div className="block">
                <h1 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Agent Terminal</h1>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">{subManagerName}</p>
              </div>
            </div>

            <div className="hidden sm:flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
              <button 
                onClick={() => setActivePortalTab('clients')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activePortalTab === 'clients' ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Operations
              </button>
              <button 
                onClick={() => setActivePortalTab('attendance')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activePortalTab === 'attendance' ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Attendance
              </button>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-rose-500/10 text-rose-500 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        {activePortalTab === 'clients' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Daily Stats Summary - Agent Proof */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="col-span-2 sm:col-span-2 bg-[#0b1120] p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl relative overflow-hidden group border border-white/5">
                <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-20 group-hover:scale-110 transition-transform">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Your Daily Collection</p>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Rs. {dailyStats.amount.toLocaleString()}</h3>
                <p className="text-[8px] font-bold text-emerald-500/80 uppercase tracking-widest mt-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Field Tracking
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-10 group-hover:scale-110 transition-transform text-indigo-500">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Visits</p>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{dailyStats.count}</h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2 italic">Receipts issued</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm relative overflow-hidden group">
                <div className={`absolute top-0 right-0 p-3 sm:p-4 opacity-10 group-hover:scale-110 transition-transform ${dutyStatus === 'online' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Status</p>
                <h3 className={`text-sm sm:text-base font-black uppercase tracking-widest ${dutyStatus === 'online' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {dutyStatus}
                </h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2">{dutyStatus === 'online' ? 'Tracking Active' : 'Off duty'}</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
            {/* Main List */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between sticky top-[60px] sm:top-[73px] z-30 bg-slate-50/50 dark:bg-[#0b0f1a]/50 backdrop-blur-sm py-2">
              <div className="relative w-full sm:max-w-xs">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </span>
                <input 
                  type="text" 
                  placeholder="Search clients..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                />
              </div>

              <div className="flex bg-white dark:bg-white/[0.03] p-1 rounded-lg sm:rounded-xl border border-slate-200 dark:border-white/5 w-full sm:w-auto">
                {filterTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id as any)}
                    className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all ${
                      filter === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop Table - Hidden on smaller mobile */}
            <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
                    <tr>
                      <th className="px-6 py-4">
                        <button 
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                        >
                          Client
                          {sortConfig.key === 'name' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4">
                        <button 
                          onClick={() => handleSort('plan')}
                          className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                        >
                          Package
                          {sortConfig.key === 'plan' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4">
                        <button 
                          onClick={() => handleSort('displayBalance')}
                          className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                        >
                          Dues
                          {sortConfig.key === 'displayBalance' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4">
                        <button 
                          onClick={() => handleSort('displayStatus')}
                          className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                        >
                          Status
                          {sortConfig.key === 'displayStatus' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                    {sortedUsers.length > 0 ? sortedUsers.map(user => (
                      <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-all group">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                          <p className="text-[11px] text-slate-500 font-medium">@{user.username}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
                            {user.plan}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`font-bold text-sm ${user.displayStatus === 'pending' ? 'text-rose-500' : 'text-emerald-500'}`}>
                            Rs. {user.displayBalance.toLocaleString()}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                            user.displayStatus === 'clear' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${user.displayStatus === 'clear' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                            {user.displayStatus === 'clear' ? 'Clear' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {user.latestReceipt && (
                              <button 
                                onClick={() => onViewReceipt(user.latestReceipt!)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all"
                                title="View Latest Receipt"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            )}
                            <button 
                              disabled={user.displayStatus === 'clear'}
                              onClick={() => onIssueInvoice(user.id, agentId)}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                              Issue invoice
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <p className="text-sm font-bold uppercase tracking-widest">No matching records</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List - Optimized for small screens */}
            <div className="md:hidden space-y-3">
              {sortedUsers.length > 0 ? sortedUsers.map(user => (
                <div key={user.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{user.name}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">@{user.username}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                      user.displayStatus === 'clear' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {user.displayStatus}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 rounded-xl px-4 py-2.5 mb-4">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Plan</p>
                      <p className="text-xs font-bold">{user.plan}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dues</p>
                      <p className={`text-xs font-black ${user.displayStatus === 'pending' ? 'text-rose-500' : 'text-emerald-500'}`}>
                        Rs. {user.displayBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {user.latestReceipt && (
                      <button 
                        onClick={() => onViewReceipt(user.latestReceipt!)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-widest"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </button>
                    )}
                    <button 
                      disabled={user.displayStatus === 'clear'}
                      onClick={() => onIssueInvoice(user.id, agentId)}
                      className="flex-[2] flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 active:scale-95 transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      {user.displayStatus === 'clear' ? 'Paid' : 'Issue Bill'}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center opacity-30">
                  <p className="text-sm font-bold uppercase tracking-widest">No matching records</p>
                </div>
              )}
            </div>
            </div>

            {/* Sidebar - Desktop Layout */}
            <div className="hidden lg:block space-y-6">
              <LocationTracker 
              status={dutyStatus}
              lastCheckIn={agent?.lastCheckIn}
              onStatusChange={handleDutyStatusChange}
              onLocationUpdate={handleLocationUpdate}
            />

            <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9.09 9 1.12 1.13c1.72 1.72 1.72 4.51 0 6.23l-3.32 3.32a3 3 0 0 0 0 4.24l.08.08a3 3 0 0 0 4.24 0l3.32-3.32c1.72-1.72 4.51-1.72 6.23 0l1.13 1.12L21.09 21"/></svg>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Daily Briefing</p>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold">Secure Access</p>
                    <p className="text-[11px] text-slate-400">Connection is encrypted</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-bold">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold">Privacy Mode</p>
                    <p className="text-[11px] text-slate-400">Revenue stats are hidden</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid md:grid-cols-3 gap-6">
               {/* Attendance Controls */}
               <div className="md:col-span-1 space-y-6">
                  <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/5 shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">Daily Presence</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Record your work duration correctly</p>
                    
                    <div className="space-y-4">
                      {dutyStatus === 'offline' ? (
                        <button 
                          onClick={() => handleDutyStatusChange('online')}
                          className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl flex flex-col items-center gap-2 transition-all shadow-xl shadow-emerald-600/20 active:scale-95"
                        >
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v1"></path></svg>
                          <span className="text-[10px] font-black uppercase tracking-widest">Mark Attendance (Check-in)</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleDutyStatusChange('offline')}
                          className="w-full py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-3xl flex flex-col items-center gap-2 transition-all shadow-xl shadow-rose-600/20 active:scale-95"
                        >
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"></path></svg>
                          <span className="text-[10px] font-black uppercase tracking-widest">End Shift (Check-out)</span>
                        </button>
                      )}

                      <button 
                        onClick={() => setShowLeaveModal(true)}
                        className="w-full py-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-[2rem] text-[10px] font-black uppercase tracking-widest border border-amber-500/20 hover:bg-amber-500 hover:text-white transition-all active:scale-95"
                      >
                        Request Leave / Absence
                      </button>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-100 dark:border-white/5 space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Status</p>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${dutyStatus === 'online' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}>
                          {agent?.isLeave ? 'On Leave' : (dutyStatus === 'online' ? 'On Duty' : 'Off Duty')}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Entry</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {agent?.lastCheckIn ? new Date(agent.lastCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <LocationTracker 
                    status={dutyStatus}
                    lastCheckIn={agent?.lastCheckIn}
                    onStatusChange={handleDutyStatusChange}
                    onLocationUpdate={handleLocationUpdate}
                  />
               </div>

               {/* Attendance List */}
               <div className="md:col-span-2 space-y-6">
                  <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/5 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                       <div>
                         <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Monthly Report</h3>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Review your logs for this period</p>
                       </div>
                       <input 
                         type="month"
                         value={reportMonth}
                         onChange={(e) => setReportMonth(e.target.value)}
                         className="px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                       />
                    </div>

                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Event</th>
                            <th className="px-6 py-4">Time</th>
                            <th className="px-6 py-4">Context / Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/[0.02]">
                          {attendanceLogs
                            .filter(log => log.subManagerId === agentId && log.timestamp.startsWith(reportMonth))
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map(log => (
                              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                                <td className="px-6 py-4">
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {new Date(log.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                    log.type === 'check-in' ? 'bg-emerald-500/10 text-emerald-600' :
                                    log.type === 'check-out' ? 'bg-rose-500/10 text-rose-500' :
                                    'bg-amber-500/10 text-amber-600'
                                  }`}>
                                    {log.type}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-xs font-medium text-slate-500">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-xs text-slate-500 max-w-[200px] truncate" title={log.reason || log.location ? 'Location Captured' : ''}>
                                    {log.reason || (log.location ? '📍 Location Stamped' : '-')}
                                  </p>
                                </td>
                              </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Attendance Logs */}
                    <div className="sm:hidden space-y-3">
                      {attendanceLogs
                        .filter(log => log.subManagerId === agentId && log.timestamp.startsWith(reportMonth))
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .map(log => (
                          <div key={log.id} className="bg-slate-50 dark:bg-white/5 p-4 rounded-xl flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                log.type === 'check-in' ? 'bg-emerald-500/10 text-emerald-500' :
                                log.type === 'check-out' ? 'bg-rose-500/10 text-rose-500' : 
                                'bg-amber-500/10 text-amber-500'
                              }`}>
                                {log.type === 'check-in' ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                                ) : log.type === 'check-out' ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{log.type}</p>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  {new Date(log.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short' })} • {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            {log.reason && (
                              <div className="text-right max-w-[100px]">
                                <p className="text-[9px] text-slate-500 truncate italic">{log.reason}</p>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>

                    {attendanceLogs.filter(log => log.subManagerId === agentId && log.timestamp.startsWith(reportMonth)).length === 0 && (
                      <div className="py-20 text-center opacity-30 text-xs font-bold uppercase tracking-widest">No logs found</div>
                    )}
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation - Sticky at the bottom */}
      <div className="sm:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
        <div className="flex items-center justify-around bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-xl border border-white/10 p-2 rounded-[2rem] shadow-2xl shadow-indigo-500/20">
          <button 
            onClick={() => setActivePortalTab('clients')}
            className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all ${
              activePortalTab === 'clients' ? 'text-white' : 'text-slate-400'
            }`}
          >
            <div className={`p-1.5 rounded-full transition-all ${activePortalTab === 'clients' ? 'bg-indigo-600 scale-110 shadow-lg shadow-indigo-600/30' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest">Clients</span>
          </button>

          <button 
            onClick={() => setActivePortalTab('attendance')}
            className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all ${
              activePortalTab === 'attendance' ? 'text-white' : 'text-slate-400'
            }`}
          >
            <div className={`p-1.5 rounded-full transition-all ${activePortalTab === 'attendance' ? 'bg-indigo-600 scale-110 shadow-lg shadow-indigo-600/30' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest">Attendance</span>
          </button>
        </div>
      </div>

      {showLeaveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLeaveModal(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#0b0c14] rounded-[3rem] p-8 border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Mark Leave / Absence</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Please provide a reason for visibility</p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-4">Reason / Description</label>
                <textarea 
                  rows={4}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="e.g. Personal emergency, Going to XYZ area for recovery, Medical leave..."
                  className="w-full px-6 py-4 rounded-3xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLeaveModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Discard
                </button>
                <button 
                  onClick={handleApplyLeave}
                  disabled={!leaveReason.trim()}
                  className="flex-[2] py-4 bg-amber-500 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-amber-600 shadow-xl shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  Confirm Absence
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubManagerDashboard;
