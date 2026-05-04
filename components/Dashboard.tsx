
import React, { useState } from 'react';
import { UserRecord, Receipt, PaymentStatus, AppSettings } from '../types';
import { shareToWhatsApp } from '../utils/whatsapp';

interface DashboardProps {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  onDeleteReceipt: (id: string) => void;
  setActiveTab: (tab: string) => void;
  onSetUserFilter?: (filter: 'all' | 'current_month') => void;
  pendingRemindersCount?: number;
  onLogout: () => void;
  isAdmin?: boolean;
}

type ModalType = 'REVENUE' | 'BALANCE' | null;

const Dashboard: React.FC<DashboardProps> = ({ users, receipts, settings, onDeleteReceipt, setActiveTab, onSetUserFilter, pendingRemindersCount = 0, onLogout, isAdmin = false }) => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showBalance, setShowBalance] = useState(false);

  const getDaysUntilExpiry = (dateStr: string) => {
    if (!dateStr) return 999;
    const exp = new Date(dateStr);
    if (isNaN(exp.getTime())) return 999;
    exp.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const totalRevenue = (receipts || []).reduce((sum, r) => sum + (r.paidAmount || 0), 0);
  const totalBalance = (users || []).reduce((sum, u) => sum + (u.balance || 0), 0);
  
  // Real-time Recovery Stats (Current Month)
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  // Current month string — same format as UserManagement uses for activatedMonths
  const currentMonthString = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  
  const monthlyRecovered = (receipts || [])
    .filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && r.status === PaymentStatus.SUCCESS;
    })
    .reduce((sum, r) => sum + (r.paidAmount || 0), 0);

  const monthlyTarget = (users || [])
    .filter(u => u.status === 'active')
    .reduce((sum, u) => sum + (settings.planPrices[u.plan] || u.monthlyFee || 0), 0);

  const monthlyPending = Math.max(0, monthlyTarget - monthlyRecovered);
  
  const activeUsersList = (users || []).filter(u => getDaysUntilExpiry(u.expiryDate) >= 0);
  
  // Total users — sabhi users jo kabhi bhi add kiye
  const totalUsersCount = (users || []).length;

  // Active users — sirf current month mein naye add kiye gaye users
  // New This Month = users who are in current month's activatedMonths folder
  // This is the SAME filter UserManagement uses — consistent with monthly folders
  const currentMonthActiveUsers = (users || []).filter(u => 
    (u.activatedMonths || []).includes(currentMonthString)
  );
  const activeUsersCount = currentMonthActiveUsers.length;

  const priorityReminders = (users || []).filter(u => getDaysUntilExpiry(u.expiryDate) === 3);

  const stats = [
    { 
      id: 'RECOVERED',
      label: 'Total Revenue', 
      value: showRevenue ? `Rs. ${totalRevenue.toLocaleString()}` : 'Rs. ••••••', 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.67 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.67-1M12 16c-1.657 0-3-.895-3-2s1.343-2 3-2 3 .895 3 2-1.343 2-3 2"></path></svg>, 
      color: 'text-emerald-500 bg-emerald-500/10', 
      isMasked: true,
      isVisible: showRevenue,
      onToggle: () => setShowRevenue(!showRevenue),
      onViewDetails: () => setActiveTab('receipts'),
      footerLabel: 'Operational Stat'
    },
    { 
      id: 'BALANCE',
      label: 'Outstanding Balance', 
      value: showBalance ? `Rs. ${(totalBalance || 0).toLocaleString()}` : 'Rs. ••••••', 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"></path></svg>, 
      color: 'text-rose-500 bg-rose-500/10', 
      isMasked: true,
      isVisible: showBalance,
      onToggle: () => setShowBalance(!showBalance),
      onViewDetails: () => setActiveModal('BALANCE'),
      footerLabel: 'Operational Stat'
    },
    { 
      id: 'TOTAL_USERS',
      label: 'Total Users', 
      value: totalUsersCount.toString(), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>, 
      color: 'text-violet-500 bg-violet-500/10', 
      isMasked: false,
      onToggle: () => onSetUserFilter ? onSetUserFilter('all') : setActiveTab('users'),
      onViewDetails: () => onSetUserFilter ? onSetUserFilter('all') : setActiveTab('users'),
      footerLabel: 'All Time Users'
    },
    { 
      id: 'CUSTOMERS',
      label: 'New This Month', 
      value: activeUsersCount.toString(), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>, 
      color: 'text-blue-500 bg-blue-500/10', 
      isMasked: false,
      onToggle: () => onSetUserFilter ? onSetUserFilter('current_month') : setActiveTab('users'),
      onViewDetails: () => onSetUserFilter ? onSetUserFilter('current_month') : setActiveTab('users'),
      footerLabel: 'Current Month'
    },
    { 
      id: 'ALERTS',
      label: '3-Day Alerts', 
      value: pendingRemindersCount.toString(), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>, 
      color: 'text-orange-500 bg-orange-500/10', 
      isMasked: false,
      onToggle: () => setActiveTab('expiries'),
      onViewDetails: () => setActiveTab('expiries'),
      footerLabel: 'Operational Stat'
    },
  ];

  const handleSendReminder = (u: UserRecord, channel: 'sms' | 'whatsapp') => {
    const currentPrice = settings.planPrices[u.plan] || u.monthlyFee || 0;
    const totalDue = currentPrice + (u.balance || 0);
    const bizName = settings.businessName || 'ISP';
    const message = `${bizName}: Dear ${u.name}, your ${u.plan} subscription will expire in 3 days. Total due: Rs. ${(totalDue || 0).toLocaleString()}.`;
    if (channel === 'sms') {
      window.location.href = `sms:${u.phone}?body=${encodeURIComponent(message)}`;
    } else {
      shareToWhatsApp(u.phone, message);
    }
  };

  const overdueUsers = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (users || []).filter(u => {
      // Must be expired
      const expiry = new Date(u.expiryDate);
      const isExpired = !isNaN(expiry.getTime()) && expiry < today;
      if (!isExpired && u.status !== 'expired') return false;

      // Get user's last active month (most recent in activatedMonths array)
      const activatedMonths: string[] = u.activatedMonths || [];
      if (activatedMonths.length === 0) return false;

      // Sort months to get the latest one
      const sortedMonths = [...activatedMonths].sort((a, b) => {
        return new Date(a).getTime() - new Date(b).getTime();
      });
      const lastActiveMonth = sortedMonths[sortedMonths.length - 1];

      // Check if user paid in their LAST ACTIVE month
      const paidInLastMonth = (receipts || []).some(r =>
        r.userId === u.id &&
        (r.activatedMonth === lastActiveMonth || r.period === lastActiveMonth) &&
        r.status === 'SUCCESS'
      );

      // Overdue = expired + NOT paid in last active month + has balance
      return !paidInLastMonth && (u.balance || 0) > 0;
    });
  }, [users, receipts]);

  // Calculate overdue balance from last active month receipts
  const totalOverdueBalance = overdueUsers.reduce((sum, u) => {
    // Get last active month balance from receipts
    const activatedMonths: string[] = u.activatedMonths || [];
    const sortedMonths = [...activatedMonths].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const lastActiveMonth = sortedMonths[sortedMonths.length - 1];
    const monthReceipts = (receipts || []).filter(r =>
      r.userId === u.id &&
      (r.activatedMonth === lastActiveMonth || r.period === lastActiveMonth) &&
      r.status === 'SUCCESS'
    );
    const paid = monthReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0);
    const fee = u.monthlyFee || 0;
    const outstanding = Math.max(0, fee - paid);
    return sum + (outstanding || u.balance || 0);
  }, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-colors">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-black dark:text-white uppercase leading-none">Dashboard Overview</h3>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-[0.2em]">{settings.businessName} • Real-time Stats</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('admin')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 active:scale-90 active:-rotate-1 transition-all flex items-center gap-2 group/admin"
            >
              <svg className="w-4 h-4 transition-transform group-hover/admin:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              Admin Panel
            </button>
          )}
          <button 
            onClick={onLogout}
            className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all duration-200 flex items-center gap-2 group/logout"
          >
            <svg className="w-4 h-4 transition-transform group-hover/logout:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            Logout
          </button>
        </div>
      </div>

      {pendingRemindersCount > 0 && (
        <div className="bg-gradient-to-r from-orange-600 to-rose-600 p-8 rounded-[2.5rem] text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
          <div className="relative z-10 flex gap-6 items-center">
            <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center text-white">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
              <h2 className="text-3xl font-black mb-2 tracking-tight uppercase">3-Day Reminder Hub</h2>
              <p className="text-sm font-bold opacity-90 max-w-md">
                System has detected {pendingRemindersCount} users whose subscription expires exactly in 3 days. Run the automation cycle now.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('expiries')}
            className="relative z-10 px-8 py-4 bg-white text-orange-600 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-90 active:translate-y-1 transition-all whitespace-nowrap"
          >
            Run Automation Sequence
          </button>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div 
            key={stat.id} 
            className="bg-[#0b1120] p-8 rounded-[2rem] shadow-2xl border border-white/5 transition-all hover:border-indigo-500/40 cursor-pointer group flex flex-col justify-between overflow-hidden relative active:scale-95 duration-200"
            onClick={stat.onToggle}
          >
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${stat.color}`}>
                  {stat.icon}
                </div>
                {stat.isMasked && (
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {stat.isVisible ? 'VISIBLE' : 'HIDDEN'}
                  </span>
                )}
              </div>
              
              <h3 className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">{stat.label}</h3>
              
              <div className="flex items-baseline gap-1">
                <p className={`text-3xl font-black tracking-tight transition-all ${stat.isMasked && !stat.isVisible ? 'text-slate-800 select-none' : 'text-white'}`}>
                  {stat.value}
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between relative z-10">
               <button 
                 onClick={(e) => { e.stopPropagation(); stat.onToggle(); }} 
                 className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
               >
                 {stat.isMasked ? (stat.isVisible ? 'Hide Amount' : 'Show Amount') : (stat.footerLabel || 'Operational Stat')}
               </button>
               
               <div className="text-slate-400 dark:text-white/20">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                 </svg>
               </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-white/5">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Recent Transactions</h3>
              <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Last 10 Payments Collected</p>
            </div>
            <button onClick={() => setActiveTab('receipts')} className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">View Full Ledger</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-50 dark:border-white/5">
                  <th className="pb-4">Customer</th>
                  <th className="pb-4">Date</th>
                  <th className="pb-4">Paid</th>
                  <th className="pb-4">Status</th>
                  <th className="pb-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {(receipts || []).slice(-10).reverse().map((r) => (
                  <tr key={r.id} className="text-sm group hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-5 font-bold text-slate-900 dark:text-slate-100">{r.userName}</td>
                    <td className="py-5 text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 tracking-wider">{new Date(r.date || new Date()).toLocaleDateString()}</td>
                    <td className="py-5 font-black text-slate-900 dark:text-white">Rs. {(r.paidAmount || 0).toLocaleString()}</td>
                    <td className="py-5">
                      <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                        r.status === PaymentStatus.SUCCESS 
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' 
                        : 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-5 text-right">
                      <button onClick={(e) => { e.stopPropagation(); onDeleteReceipt(r.id); }} className="text-slate-300 dark:text-white/20 hover:text-rose-600 p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 dark:bg-indigo-950 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group border border-slate-700 dark:border-indigo-500/20">
            <h3 className="font-black text-lg mb-6 flex items-center gap-3 relative z-10 uppercase tracking-tight">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
              Recovery Alerts
            </h3>
            <div className="space-y-4 relative z-10">
              {priorityReminders.slice(0, 3).map(u => (
                <div key={u.id} className="bg-white/5 p-5 rounded-2xl border border-white/5 transition-all hover:bg-white/10">
                  <p className="font-black text-sm tracking-tight">{u.name}</p>
                  <p className="text-[10px] font-bold text-indigo-300 mb-4 uppercase tracking-[0.2em]">{u.plan}</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleSendReminder(u, 'sms')} className="flex-1 bg-white text-slate-900 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">SMS</button>
                    <button onClick={() => handleSendReminder(u, 'whatsapp')} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">WhatsApp</button>
                  </div>
                </div>
              ))}
              {priorityReminders.length === 0 && <div className="text-center py-10 opacity-30 space-y-2"><p className="text-3xl">✓</p><p className="text-[10px] font-black uppercase tracking-widest">No Priority Alerts</p></div>}
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
          </div>

          {/* Overdue Collections Section */}
          <div className="bg-rose-600 dark:bg-rose-950 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group border border-rose-500/20">
            <div className="flex justify-between items-start mb-6 relative z-10">
              <h3 className="font-black text-lg flex items-center gap-3 uppercase tracking-tight">
                <svg className="w-6 h-6 text-rose-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Overdue Collections
              </h3>
              <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black">
                Rs. {totalOverdueBalance.toLocaleString()}
              </div>
            </div>
            
            <div className="space-y-4 relative z-10">
              {overdueUsers.slice(0, 3).map(u => (
                <div key={u.id} className="bg-white/10 p-5 rounded-2xl border border-white/10 transition-all hover:bg-white/20">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-black text-sm tracking-tight">{u.name}</p>
                      <p className="text-[10px] font-bold text-rose-200 uppercase tracking-widest">@{u.username}</p>
                    </div>
                    <p className="font-black text-sm text-white">Rs. {(u.balance || 0).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => handleSendReminder(u, 'sms')} className="flex-1 bg-white text-rose-600 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">SMS</button>
                    <button onClick={() => handleSendReminder(u, 'whatsapp')} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">WhatsApp</button>
                  </div>
                </div>
              ))}
              {overdueUsers.length === 0 && (
                <div className="text-center py-10 opacity-30 space-y-2">
                  <p className="text-3xl">✨</p>
                  <p className="text-[10px] font-black uppercase tracking-widest">All Collections Clear</p>
                </div>
              )}
              {overdueUsers.length > 3 && (
                <button onClick={() => setActiveTab('users')} className="w-full py-3 text-[10px] font-black uppercase tracking-[0.2em] text-rose-200 hover:text-white transition-colors">
                  + {overdueUsers.length - 3} More Overdue
                </button>
              )}
            </div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mb-16"></div>
          </div>
        </div>
      </div>
      {activeModal === 'REVENUE' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 relative z-10 flex flex-col max-h-[85vh]">
            <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-green-50/50 dark:bg-green-500/5 flex justify-between items-center">
              <div>
                <h4 className="text-2xl font-black text-slate-900 dark:text-slate-50 uppercase tracking-tight">Revenue Log</h4>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Complete History Collection</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-4 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm text-slate-500 dark:text-slate-400 font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="bg-slate-900 dark:bg-slate-800 text-white p-8 rounded-[2rem] flex justify-between items-center shadow-2xl">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-300">Total Collection</span>
                <span className="text-3xl font-black">Rs. {(totalRevenue || 0).toLocaleString()}</span>
              </div>
              {receipts.filter(r => r.status === PaymentStatus.SUCCESS).slice(-20).reverse().map(r => (
                <div key={r.id} className="p-5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-slate-50">{r.userName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest">{new Date(r.date || new Date()).toLocaleDateString()}</p>
                  </div>
                  <p className="font-black text-green-600 dark:text-green-400">Rs. {(r.paidAmount || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default Dashboard;
