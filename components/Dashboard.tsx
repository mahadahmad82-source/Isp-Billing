
import React, { useState, useMemo } from 'react';
import { UserRecord, Receipt, PaymentStatus, AppSettings } from '../types';
import { calcTotalRevenue, calcMonthlyRevenue } from '../utils/revenueCalc';
import { shareToWhatsApp } from '../utils/whatsapp';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface DashboardProps {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  onDeleteReceipt: (id: string) => void;
  setActiveTab: (tab: string) => void;
  onSetUserFilter?: (filter: 'all' | 'current_month') => void;
  onSetExpiredFilter?: () => void;
  pendingRemindersCount?: number;
  onLogout: () => void;
  isAdmin?: boolean;
  onUpdateUser?: (user: UserRecord) => void;
}

type ModalType = 'REVENUE' | 'BALANCE' | 'TODAY_EXPIRY' | 'TODAY_EXPIRED' | null;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#0f172a",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"8px 14px"}}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs font-bold" style={{ color: p.color }}>
          {p.name}: Rs. {(Number(p.value)||0).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ users, receipts, settings, onDeleteReceipt, setActiveTab, onSetUserFilter, onSetExpiredFilter, pendingRemindersCount = 0, onLogout, isAdmin = false, onUpdateUser }) => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [hideReminder, setHideReminder] = useState(() => {
    return sessionStorage.getItem('dismissedReminderHub') === 'true';
  });

  const handleDismissReminder = () => {
    setHideReminder(true);
    sessionStorage.setItem('dismissedReminderHub', 'true');
  };

  const getDaysUntilExpiry = (dateStr: string) => {
    if (!dateStr) return 999;
    const exp = new Date(dateStr);
    if (isNaN(exp.getTime())) return 999;
    exp.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const totalRevenue = calcTotalRevenue(receipts || []);

  const totalBalance = (users || []).reduce((sum, u) => {
    const activatedMonths: string[] = u.activatedMonths || [];
    if (activatedMonths.length === 0) return sum;
    const sortedMonths = [...activatedMonths].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const lastMonth = sortedMonths[sortedMonths.length - 1];
    const monthPaid = (receipts || [])
      .filter(r => r.userId === u.id && (r.activatedMonth === lastMonth || r.period === lastMonth) && r.status === PaymentStatus.SUCCESS)
      .reduce((s, r) => s + (r.paidAmount || r.totalAmount || 0), 0);
    const fee = u.monthlyFee || settings.planPrices?.[u.plan] || 0;
    const outstanding = Math.max(0, fee - monthPaid);
    return sum + outstanding;
  }, 0);

  const currentMonthString = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const monthlyRecovered = calcMonthlyRevenue(receipts || [], currentMonthString);

  const todayStr = new Date().toDateString();
  const todayCollection = (receipts || [])
    .filter(r => r.status === PaymentStatus.SUCCESS && new Date(r.date).toDateString() === todayStr)
    .reduce((sum, r) => sum + (r.paidAmount || 0), 0);

  const monthlyTarget = (users || [])
    .filter(u => u.status === 'active')
    .reduce((sum, u) => sum + (settings.planPrices[u.plan] || u.monthlyFee || 0), 0);

  const monthlyPending = Math.max(0, monthlyTarget - monthlyRecovered);

  const _today = new Date();
  _today.setHours(0, 0, 0, 0);
  const _currentMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(_today);
  const _isActiveByDate = (u: UserRecord) => {
    if (u.status === 'deleted') return false;
    // Active if current month is in activatedMonths (matches Recovery Ledger logic)
    if (u.activatedMonths && u.activatedMonths.includes(_currentMonth)) return true;
    // OR active if expiryDate is today or future
    if (!u.expiryDate) return false;
    const exp = new Date(u.expiryDate);
    if (isNaN(exp.getTime())) return false;
    exp.setHours(0, 0, 0, 0);
    return exp >= _today;
  };
  const activeUsersCount = (users || []).filter(_isActiveByDate).length;
  const expiredUsersCount = (users || []).filter(u => u.status !== 'deleted' && !_isActiveByDate(u)).length;
  const totalUsersCount = (users || []).length;

  // Today Expiry = expiryDate === today (last active day)
  const todayExpiringUsers = useMemo(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    return (users || []).filter(u => {
      if (!u.expiryDate) return false;
      const exp = new Date(u.expiryDate);
      if (isNaN(exp.getTime())) return false;
      exp.setHours(0,0,0,0);
      return exp.getTime() === t.getTime();
    });
  }, [users]);

  // Today Expired = expiryDate === yesterday (just became expired today)
  const todayExpiredUsers = useMemo(() => {
    const yesterday = new Date(); yesterday.setHours(0,0,0,0); yesterday.setDate(yesterday.getDate() - 1);
    return (users || []).filter(u => {
      if (!u.expiryDate) return false;
      const exp = new Date(u.expiryDate);
      if (isNaN(exp.getTime())) return false;
      exp.setHours(0,0,0,0);
      return exp.getTime() === yesterday.getTime();
    });
  }, [users]);

  // Last 6 months revenue chart data
  const last6MonthsData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthName = d.toLocaleDateString('en-US', { month: 'long' });
      const year = d.getFullYear();
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const rev = (receipts || [])
        .filter(r => r.status === PaymentStatus.SUCCESS &&
          (r.period || '').includes(monthName) &&
          (r.period || '').includes(String(year)))
        .reduce((s, r) => s + (typeof r.paidAmount === 'number' ? r.paidAmount : 0), 0);
      months.push({ label, Revenue: rev });
    }
    return months;
  }, [receipts]);

  const priorityReminders = (users || []).filter(u => getDaysUntilExpiry(u.expiryDate) === 3);

  const stats = [
    {
      id: 'RECOVERED', label: 'Total Revenue',
      value: showRevenue ? `Rs. ${totalRevenue.toLocaleString()}` : 'Rs. ••••••',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.67 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.67-1M12 16c-1.657 0-3-.895-3-2s1.343-2 3-2 3 .895 3 2-1.343 2-3 2"></path></svg>,
      gradient: 'from-emerald-600 to-teal-600', color: 'text-emerald-500 bg-emerald-500/10', isMasked: true, isVisible: showRevenue,
      onToggle: () => setShowRevenue(!showRevenue), onViewDetails: () => setActiveTab('receipts'), footerLabel: 'Operational Stat'
    },
    {
      id: 'BALANCE', label: 'Outstanding Balance',
      value: showBalance ? `Rs. ${(totalBalance || 0).toLocaleString()}` : 'Rs. ••••••',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"></path></svg>,
      gradient: 'from-rose-600 to-pink-700', color: 'text-rose-500 bg-rose-500/10', isMasked: true, isVisible: showBalance,
      onToggle: () => setShowBalance(!showBalance), onViewDetails: () => setActiveModal('BALANCE'), footerLabel: 'Operational Stat'
    },
    {
      id: 'TOTAL_USERS', label: 'Master Directory', value: totalUsersCount.toString(),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>,
      gradient: 'from-violet-600 to-purple-700', color: 'text-violet-500 bg-violet-500/10', isMasked: false,
      onToggle: () => onSetUserFilter ? onSetUserFilter('all') : setActiveTab('users'),
      onViewDetails: () => onSetUserFilter ? onSetUserFilter('all') : setActiveTab('users'), footerLabel: 'Sab Registered Users'
    },
    {
      id: 'CUSTOMERS', label: 'Active Customers', value: activeUsersCount.toString(),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>,
      gradient: 'from-blue-600 to-indigo-700', color: 'text-blue-500 bg-blue-500/10', isMasked: false,
      onToggle: () => onSetUserFilter ? onSetUserFilter('current_month') : setActiveTab('users'),
      onViewDetails: () => onSetUserFilter ? onSetUserFilter('current_month') : setActiveTab('users'), footerLabel: 'Active Subscribers'
    },
    {
      id: 'EXPIRED', label: 'Expired Customers', value: expiredUsersCount.toString(),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>,
      gradient: 'from-orange-600 to-red-700', color: 'text-rose-500 bg-rose-500/10', isMasked: false,
      onToggle: () => onSetExpiredFilter ? onSetExpiredFilter() : setActiveTab('users'),
      onViewDetails: () => onSetExpiredFilter ? onSetExpiredFilter() : setActiveTab('users'), footerLabel: 'Inactive / Not Renewed'
    },
    {
      id: 'ALERTS', label: '3-Day Alerts', value: pendingRemindersCount.toString(),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>,
      gradient: 'from-orange-500 to-rose-600', color: 'text-orange-500 bg-orange-500/10', isMasked: false,
      onToggle: () => setActiveTab('expiries'), onViewDetails: () => setActiveTab('expiries'), footerLabel: 'Expiry Alerts'
    },
  ];

  const handleSendReminder = (u: UserRecord, channel: 'sms' | 'whatsapp') => {
    const currentPrice = settings.planPrices[u.plan] || u.monthlyFee || 0;
    const totalDue = currentPrice + (u.balance || 0);
    const bizName = settings.businessName || 'ISP';
    const message = `${bizName}: Dear ${u.name}, your ${u.plan} subscription expires today. Total due: Rs. ${(totalDue || 0).toLocaleString()}.`;
    if (channel === 'sms') {
      window.location.href = `sms:${u.phone}?body=${encodeURIComponent(message)}`;
    } else {
      shareToWhatsApp(u.phone, message);
    }
  };

  const handleActivateUser = (u: UserRecord) => {
    if (!onUpdateUser) return;
    const today = new Date();
    const newExpiryDate = new Date(today);
    newExpiryDate.setDate(newExpiryDate.getDate() + 30);
    const newExpiry = newExpiryDate.toISOString().split('T')[0];
    const currentMonth = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const updatedMonths = Array.from(new Set([...(u.activatedMonths || []), currentMonth]));
    onUpdateUser({ ...u, status: 'active', expiryDate: newExpiry, activatedMonths: updatedMonths });
  };

  const UserListItem = ({ u, variant }: { u: UserRecord; variant: 'expiry' | 'expired' }) => {
    const expiryDisplay = u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    return (
      <div className="p-3.5 rounded-2xl bg-black/20 border border-white/10 hover:bg-black/30 transition-all flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-black text-sm text-white truncate">{u.name}</p>
          {u.username && <p className="text-[10px] font-bold text-white/40 truncate">@{u.username}</p>}
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest truncate">
            {u.plan} • Rs. {(u.monthlyFee || settings.planPrices?.[u.plan] || 0).toLocaleString()}
          </p>
          <p className="text-[9px] font-bold text-white/50 mt-0.5">
            📅 Exp: {expiryDisplay}
          </p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={() => handleSendReminder(u, 'sms')}
            className="px-2 py-2 bg-black/30 hover:bg-black/50 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95">
            SMS
          </button>
          <button onClick={() => handleSendReminder(u, 'whatsapp')}
            className="px-2 py-2 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95">
            WA
          </button>
          {onUpdateUser && (
            <button onClick={() => handleActivateUser(u)}
              className="px-2 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95" title="Activate user for this month">
              ✓ ON
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-colors">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <h3 className="text-3xl font-bold text-black dark:text-white uppercase leading-none">Dashboard Overview</h3>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-[0.2em]">{settings.businessName} • Real-time Stats</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 flex items-center gap-2 group/admin"
            >
              <svg className="w-4 h-4 transition-transform group-hover/admin:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              Admin Panel
            </button>
          )}
        </div>
      </div>

      {pendingRemindersCount > 0 && !hideReminder && (
        <div id="tour-reminder-hub" className="bg-gradient-to-r from-orange-600 to-rose-600 p-8 rounded-[2.5rem] text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="relative z-10 flex gap-6 items-center">
            <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center text-white">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-2 tracking-tight uppercase">3-Day Reminder Hub</h2>
              <p className="text-sm font-bold opacity-90 max-w-md">
                System has detected {pendingRemindersCount} users whose subscription expires exactly in 3 days. Run the automation cycle now.
              </p>
            </div>
          </div>
          <button onClick={() => setActiveTab('expiries')}
            className="relative z-10 px-8 py-4 bg-white text-orange-600 rounded-2xl font-bold uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-90 active:translate-y-1 transition-all whitespace-nowrap">
            Run Automation Sequence
          </button>
          <button onClick={handleDismissReminder}
            className="absolute top-4 right-4 z-20 p-2 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full transition-colors" title="Dismiss Reminder">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        </div>
      )}

      <div id="tour-stats-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.id} onClick={stat.onToggle}
            className={`bg-gradient-to-br ${stat.gradient} p-7 rounded-[2rem] shadow-2xl cursor-pointer group flex flex-col justify-between overflow-hidden relative active:scale-95 duration-200 transition-all`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none"></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-5">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white transition-transform group-hover:scale-110">
                  {stat.icon}
                </div>
                {stat.isMasked && (
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 bg-black/20 px-2 py-1 rounded-lg">
                    {stat.isVisible ? 'VISIBLE' : 'HIDDEN'}
                  </span>
                )}
              </div>
              <h3 className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mb-2">{stat.label}</h3>
              <div className="flex items-baseline gap-1">
                <p className={`text-3xl font-black tracking-tight transition-all ${stat.isMasked && !stat.isVisible ? 'text-white/20 select-none' : 'text-white'}`}>
                  {stat.value}
                </p>
              </div>
            </div>
            <div className="mt-6 pt-5 border-t border-white/20 flex items-center justify-between relative z-10">
              <button onClick={(e) => { e.stopPropagation(); stat.onToggle(); }}
                className="text-[10px] font-black text-white/80 uppercase tracking-[0.2em] hover:text-white transition-colors">
                {stat.isMasked ? (stat.isVisible ? 'Hide Amount' : 'Show Amount') : (stat.footerLabel || 'View Details')}
              </button>
              <div className="text-white/40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Today Expiry & Expired Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today Expiry */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="flex items-center justify-between mb-5 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-3xl flex items-center justify-center text-white">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-black text-xl text-white uppercase tracking-tight">Today Expiry</h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Subscriptions Ending Today</p>
              </div>
            </div>
            <span className="bg-black/20 text-white font-black text-2xl px-5 py-2 rounded-2xl border border-white/20">
              {todayExpiringUsers.length}
            </span>
          </div>
          <div className="relative z-10 space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {todayExpiringUsers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">✓</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/70">No Expiries Today</p>
              </div>
            ) : (
              todayExpiringUsers.map(u => <UserListItem key={u.id} u={u} variant="expiry" />)
            )}
          </div>
          {todayExpiringUsers.length > 3 && (
            <button onClick={() => setActiveModal('TODAY_EXPIRY')}
              className="relative z-10 w-full mt-4 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
              View All {todayExpiringUsers.length} Users
            </button>
          )}
        </div>

        {/* Today Expired */}
        <div className="bg-gradient-to-br from-rose-600 to-red-800 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="flex items-center justify-between mb-5 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-3xl flex items-center justify-center text-white">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <h3 className="font-black text-xl text-white uppercase tracking-tight">Today Expired</h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Expired Since Yesterday</p>
              </div>
            </div>
            <span className="bg-black/20 text-white font-black text-2xl px-5 py-2 rounded-2xl border border-white/20">
              {todayExpiredUsers.length}
            </span>
          </div>
          <div className="relative z-10 space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {todayExpiredUsers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">✨</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/70">None Expired Today</p>
              </div>
            ) : (
              todayExpiredUsers.map(u => <UserListItem key={u.id} u={u} variant="expired" />)
            )}
          </div>
          {todayExpiredUsers.length > 3 && (
            <button onClick={() => setActiveModal('TODAY_EXPIRED')}
              className="relative z-10 w-full mt-4 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
              View All {todayExpiredUsers.length} Users
            </button>
          )}
        </div>
      </div>

      {/* ── Analytics Chart ── */}
      <div className="bg-[#0b1120] border border-white/5 rounded-[2.5rem] p-8 shadow-xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Revenue Analytics</h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last 6 Months Collection</p>
          </div>
          <button onClick={() => setActiveTab('analytics')}
            className="text-[10px] bg-white/5 text-slate-400 px-4 py-2 rounded-xl font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all border border-white/5">
            Full Analytics
          </button>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={last6MonthsData} barCategoryGap="30%" barSize={32}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
            <Bar dataKey="Revenue" radius={[8,8,0,0]} fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
        {/* Monthly summary row */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/5">
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">This Month</p>
            <p className="text-lg font-black text-indigo-400">Rs. {(monthlyRecovered || 0).toLocaleString()}</p>
          </div>
          <div className="text-center border-x border-white/5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Today</p>
            <p className="text-lg font-black text-emerald-400">Rs. {(todayCollection || 0).toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Pending</p>
            <p className="text-lg font-black text-rose-400">Rs. {(monthlyPending || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {activeModal === 'BALANCE' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 relative z-10 flex flex-col max-h-[85vh]">
            <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-red-50/50 dark:bg-red-500/5 flex justify-between items-center">
              <div>
                <h4 className="text-2xl font-black text-slate-900 dark:text-slate-50 uppercase tracking-tight">Outstanding Log</h4>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Pending Recoveries</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-4 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm text-slate-500 dark:text-slate-400 font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="bg-slate-900 dark:bg-slate-800 text-white p-8 rounded-[2rem] flex justify-between items-center shadow-2xl">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-300">Total Arrears</span>
                <span className="text-3xl font-black">Rs. {(totalBalance || 0).toLocaleString()}</span>
              </div>
              {users.filter(u => (u.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0)).map(u => (
                <div key={u.id} className="p-5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-slate-50">{u.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest">@{u.username}</p>
                  </div>
                  <p className="font-black text-red-600 dark:text-red-400">Rs. {(u.balance || 0).toLocaleString()}</p>
                </div>
              ))}
              {users.filter(u => (u.balance || 0) > 0).length === 0 && (
                <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-xs">No outstanding balances found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {(activeModal === 'TODAY_EXPIRY' || activeModal === 'TODAY_EXPIRED') && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/5 relative z-10 flex flex-col max-h-[85vh]">
            <div className={`p-6 border-b border-white/5 flex justify-between items-center ${activeModal === 'TODAY_EXPIRY' ? 'bg-amber-500/5' : 'bg-rose-500/5'}`}>
              <div>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">
                  {activeModal === 'TODAY_EXPIRY' ? 'Today Expiry' : 'Today Expired'}
                </h4>
                <p className={`text-[10px] font-black uppercase tracking-widest ${activeModal === 'TODAY_EXPIRY' ? 'text-amber-400' : 'text-rose-400'}`}>
                  {activeModal === 'TODAY_EXPIRY' ? 'Last Active Day' : 'Expired Today'}
                </p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-3 bg-white/10 rounded-2xl text-white font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {(activeModal === 'TODAY_EXPIRY' ? todayExpiringUsers : todayExpiredUsers).map(u => (
                <UserListItem key={u.id} u={u} variant={activeModal === 'TODAY_EXPIRY' ? 'expiry' : 'expired'} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
