
import React, { useState, useEffect, useCallback } from 'react';
import ProfileDialog from './ProfileDialog';
import NotificationCenter from './NotificationCenter';
import { AppNotification } from '../types';
import { logoBase64 } from '../utils/logoBase64';
import { avatarBase64 } from '../utils/avatarBase64';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: 'light' | 'dark';
  businessName: string;
  onToggleTheme: () => void;
  lastSavedTime?: string;
  notifications: AppNotification[];
  onDismissNotification: (id: string) => void;
  onClearAllNotifications: () => void;
  companies?: any[];
  activeCompanyId?: string;
  onSwitchCompany?: (id: string) => void;
  onAddCompany?: (name: string) => void;
  isAdmin?: boolean;
  userRole?: 'admin' | 'manager' | 'sub-manager';
  activeManager?: string;
  onLogout?: () => void;
  onUpdateProfile?: (updates: { businessPhone?: string; businessAddress?: string }) => void;
  currentPhone?: string;
  currentAddress?: string;
  currentEmail?: string;
  onNavigateCustomers?: (filter: 'all' | 'active' | 'expired') => void;
}

// ✅ Live DB Connection Status Indicator
const DbStatusIndicator: React.FC<{ lastSavedTime?: string }> = ({ lastSavedTime }) => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [ping, setPing] = useState<number | null>(null);

  const checkConnection = useCallback(async () => {
    const start = Date.now();
    try {
      const res = await fetch(
        'https://mzmajmjzopmkzboizrbm.supabase.co/rest/v1/manager_data?select=manager_id&limit=1',
        {
          headers: {
            apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw',
          },
        }
      );
      const ms = Date.now() - start;
      if (res.ok) { setStatus('connected'); setPing(ms); }
      else { setStatus('error'); setPing(null); }
    } catch {
      setStatus('error'); setPing(null);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const dotClass = {
    checking:  'bg-amber-400 animate-pulse',
    connected: 'bg-emerald-400 animate-pulse',
    error:     'bg-rose-500 animate-ping',
  }[status];

  const colorClass = {
    checking:  'text-amber-500',
    connected: 'text-emerald-500',
    error:     'text-rose-500',
  }[status];

  const label = {
    checking:  'Connecting',
    connected: ping ? `DB · ${ping}ms` : 'Connected',
    error:     'Offline',
  }[status];

  return (
    <button
      onClick={checkConnection}
      title={status === 'connected' ? `Ping: ${ping}ms · Click to recheck` : 'Click to retry connection'}
      className="flex items-center gap-1 group"
    >
      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotClass.replace('animate-pulse','').replace('animate-ping','')}`} />
      </span>
      <span className={`text-[8px] font-black uppercase tracking-widest whitespace-nowrap ${colorClass}`}>
        {label}
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────
// Page title label map
// ─────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  dashboard:  'Dashboard',
  users:      'Customers',
  receipts:   'Receipts',
  recoveries: 'Recoveries',
  expiries:   'Expiries',
  reports:    'AI Insights',
  settings:   'Settings',
  admin:      'Admin Panel',
  team:       'Team Hub',
  expenses:   'Expenses',
  analytics:  'Analytics',
  equipment:  'Equipment',
  leads:      'Leads',
  aging:      'Aging',
  suspension: 'Suspension',
  outage:     'Outage',
  area:       'Area',
  systemlogs: 'System Logs',
};

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  theme,
  businessName,
  onToggleTheme,
  lastSavedTime,
  notifications,
  onDismissNotification,
  onClearAllNotifications,
  companies = [],
  activeCompanyId,
  onSwitchCompany,
  onAddCompany,
  isAdmin = false,
  userRole = 'manager',
  activeManager = '',
  onLogout = () => {},
  onUpdateProfile = () => {},
  currentPhone = '',
  currentAddress = '',
  currentEmail = '',
  onNavigateCustomers,
}) => {
  const [customersExpanded, setCustomersExpanded] = useState(false);
  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<'profile'|'security'|'session'>('profile');

  let tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <svg className={`${activeTab === 'dashboard' ? 'animate-bounce' : ''} w-5 h-5`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg> },
    { id: 'users',     label: 'Customers', icon: <svg className={`${activeTab === 'users' ? 'animate-pulse' : ''} w-5 h-5`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> },
    { id: 'receipts',  label: 'Receipts',  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> },
    { id: 'recoveries',label: 'Recoveries',icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg> },
    { id: 'expiries',  label: 'Expiries',  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg> },
    { id: 'reports',   label: 'AI Insights',icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> },
    { id: 'systemlogs', label: 'Sys Logs',  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg> },
    { id: 'settings',  label: 'Settings',  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> },
  ];

  if (isAdmin) {
    tabs = [{ id: 'admin', label: 'Admin', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg> }];
  }

  if (userRole === 'manager' && !isAdmin) {
    tabs.splice(tabs.length - 1, 0,
      { id: 'team',       label: 'Team Hub',   icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { id: 'expenses',   label: 'Expenses',   icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
      { id: 'analytics',  label: 'Analytics',  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> },
      { id: 'equipment',  label: 'Equipment',  icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg> },
      { id: 'leads',      label: 'Leads',      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
      { id: 'aging',      label: 'Aging',      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
      { id: 'suspension', label: 'Suspension', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg> },
      { id: 'outage',     label: 'Outage',     icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> },
      { id: 'area',       label: 'Area',       icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg> }
    );
  }

  const isDark = theme === 'dark';

  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 overflow-hidden ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

      {/* ═══════════════════════════════════════
          TOP HEADER — All screen sizes
      ═══════════════════════════════════════ */}
      <header
        id="tour-top-header"
        className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 md:px-6 no-print
          ${isDark
            ? 'bg-slate-950/90 backdrop-blur-md border-b border-slate-800/60'
            : 'bg-white/90 backdrop-blur-md border-b border-slate-200/60'
          }`}
        style={{ height: '64px' }}
      >
        {/* ── LEFT: DB Status (above) + Burger (below) ── */}
        <div className="flex flex-col items-start justify-center gap-1 w-12 flex-shrink-0">
          <DbStatusIndicator lastSavedTime={lastSavedTime} />
          <button
            onClick={() => setDrawerOpen(true)}
            className={`p-1.5 rounded-xl border transition-all shadow-sm flex items-center justify-center w-9 h-9 active:scale-90
              ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title="Open Menu"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>

        {/* ── CENTER: Logo ── */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
          {logoBase64 && (
            <img
              src={logoBase64}
              alt="Logo"
              className="h-12 w-auto max-w-[160px] object-contain drop-shadow-sm"
            />
          )}
        </div>

        {/* ── RIGHT: Theme + Notif + Profile ── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className={`p-1.5 rounded-xl border transition-all shadow-sm flex items-center justify-center w-9 h-9 active:scale-90 active:rotate-180 duration-500
              ${isDark ? 'bg-slate-800 border-slate-700 text-yellow-400' : 'bg-white border-slate-200 text-slate-500'}`}
            title="Toggle Theme"
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            )}
          </button>

          {/* Notifications */}
          <button
            onClick={() => setIsNotifOpen(true)}
            className={`p-1.5 rounded-xl border transition-all shadow-sm flex items-center justify-center w-9 h-9 relative active:rotate-12 active:scale-90
              ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
            title="Notifications"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 animate-pulse">
                {notifications.length}
              </span>
            )}
          </button>

          {/* Profile Avatar */}
          <div className="relative" id="tour-mobile-profile">
            <button
              onClick={() => setDropdownOpen(d => !d)}
              className="w-9 h-9 rounded-full overflow-hidden shadow-lg border-2 border-indigo-400/40 hover:border-indigo-400/80 transition-all active:scale-90"
            >
              {avatarBase64
                ? <img src={avatarBase64} alt="Profile" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">{(businessName?.charAt(0) || 'M').toUpperCase()}</div>
              }
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className={`absolute right-0 top-11 z-50 w-52 rounded-2xl shadow-2xl border overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                  {/* User info */}
                  <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50'}`}>
                    <p className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{businessName}</p>
                    <p className="text-xs text-slate-400">@{activeManager}</p>
                  </div>
                  <button onClick={() => { setDropdownOpen(false); setProfileInitialTab('profile'); setProfileOpen(true); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors text-left ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <span className="text-indigo-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg></span>
                    Profile
                  </button>
                  <button onClick={() => { setDropdownOpen(false); setProfileInitialTab('security'); setProfileOpen(true); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors text-left ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <span className="text-indigo-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg></span>
                    Change Password
                  </button>
                  <div className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <button
                      onClick={() => { setDropdownOpen(false); onLogout(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════
          DRAWER OVERLAY — All screen sizes
      ═══════════════════════════════════════ */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ═══════════════════════════════════════
          LEFT DRAWER — All screen sizes
      ═══════════════════════════════════════ */}
      <div className={`fixed top-0 left-0 h-full z-[100] transition-transform duration-300 ease-in-out shadow-2xl
        w-72 md:w-80
        ${isDark ? 'bg-slate-900' : 'bg-indigo-900'}
        ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Drawer Header */}
        <div className={`flex items-center justify-between px-5 pt-5 pb-5 border-b border-white/10`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center font-black text-indigo-900 flex-shrink-0 text-sm">
              {(businessName?.charAt(0) || 'M').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white font-black text-xs uppercase tracking-wider truncate">{isAdmin ? 'Admin Account' : 'Manager Account'}</p>
              <p className={`text-[9px] font-bold truncate ${isDark ? 'text-slate-400' : 'text-indigo-300'}`}>{businessName || 'ISP Manager'}</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Version label */}
        <div className="px-5 py-2">
          <p className={`text-[8px] font-black uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-indigo-400'}`}>ISP MANAGER v2.5</p>
        </div>

        {/* Nav Items */}
        <nav id="tour-sidebar-nav" className="px-3 py-2 space-y-1 overflow-y-auto max-h-[calc(100vh-100px)]">
          {tabs
            .filter(tab => !['reports', 'analytics'].includes(tab.id))
            .map(tab => {
            const isCustomers = tab.id === 'users';
            const isExpenses  = tab.id === 'expenses';
            const isExpensesGroupActive = isExpenses && ['expenses','reports','analytics'].includes(activeTab);
            const isActive = activeTab === tab.id || isExpensesGroupActive;
            return (
              <div key={tab.id}>
                <a
                  href={isExpenses ? '#expenses' : '#' + tab.id}
                  onClick={(e) => {
                    e.preventDefault();
                    if (isCustomers) {
                      setCustomersExpanded(prev => !prev);
                      setActiveTab(tab.id);
                      setDrawerOpen(false);
                    } else if (isExpenses) {
                      setExpensesExpanded(prev => !prev);
                    } else {
                      setActiveTab(tab.id);
                      setDrawerOpen(false);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left cursor-pointer no-underline
                    ${isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <span className="shrink-0">{tab.icon}</span>
                  <span className="flex-1 text-xs font-bold uppercase tracking-widest">{tab.label}</span>
                  {(isCustomers || isExpenses) && (
                    <svg className={`w-4 h-4 transition-transform
                      ${isCustomers && (customersExpanded || isActive) ? 'rotate-180' : ''}
                      ${isExpenses  && (expensesExpanded  || isExpensesGroupActive) ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/>
                    </svg>
                  )}
                </a>

                {/* Customers Sub-items */}
                {isCustomers && (activeTab === 'users' || customersExpanded) && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-indigo-500/30 pl-3">
                    <a href="#users" onClick={(e) => { e.preventDefault(); if (onNavigateCustomers) onNavigateCustomers('all'); setActiveTab('users'); setDrawerOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                      <svg className="w-4 h-4 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                      <span className="text-[11px] font-bold uppercase tracking-widest">Master Directory</span>
                    </a>
                    <a href="#users" onClick={(e) => { e.preventDefault(); if (onNavigateCustomers) onNavigateCustomers('active'); setActiveTab('users'); setDrawerOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"/>
                      <span className="text-[11px] font-bold uppercase tracking-widest">Active Customers</span>
                    </a>
                    <a href="#users" onClick={(e) => { e.preventDefault(); if (onNavigateCustomers) onNavigateCustomers('expired'); setActiveTab('users'); setDrawerOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"/>
                      <span className="text-[11px] font-bold uppercase tracking-widest">Expired Customers</span>
                    </a>
                  </div>
                )}

                {/* Expenses Sub-items: Expenses · AI Insights · Analytics */}
                {isExpenses && (expensesExpanded || isExpensesGroupActive) && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-indigo-500/30 pl-3">
                    {/* Expenses */}
                    <a href="#expenses" onClick={(e) => { e.preventDefault(); setActiveTab('expenses'); setDrawerOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all
                        ${activeTab === 'expenses' ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                      <svg className="w-4 h-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span className="text-[11px] font-bold uppercase tracking-widest">Expenses</span>
                    </a>
                    {/* AI Insights */}
                    <a href="#reports" onClick={(e) => { e.preventDefault(); setActiveTab('reports'); setDrawerOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all
                        ${activeTab === 'reports' ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                      <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                      </svg>
                      <span className="text-[11px] font-bold uppercase tracking-widest">AI Insights</span>
                    </a>
                    {/* Analytics */}
                    <a href="#analytics" onClick={(e) => { e.preventDefault(); setActiveTab('analytics'); setDrawerOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all
                        ${activeTab === 'analytics' ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                      <svg className="w-4 h-4 shrink-0 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                      </svg>
                      <span className="text-[11px] font-bold uppercase tracking-widest">Analytics</span>
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

      </div>

      {/* ═══════════════════════════════════════
          MAIN CONTENT AREA
      ═══════════════════════════════════════ */}
      <main className="flex-1 px-4 md:px-8 pb-6 pt-[80px] overflow-y-auto custom-scrollbar h-full">
        {/* Page Title Bar */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div className="flex items-center gap-3">
            <div className={`w-1 h-7 rounded-full ${isDark ? 'bg-indigo-500' : 'bg-indigo-600'}`} />
            <h2 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {PAGE_TITLES[activeTab] || activeTab}
            </h2>
          </div>
        </div>

        <div className="w-full">
          {children}
        </div>
      </main>

      {/* ═══════════════════════════════════════
          MODALS & OVERLAYS
      ═══════════════════════════════════════ */}
      <NotificationCenter
        notifications={notifications}
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        onAction={(tab) => { setActiveTab(tab); setIsNotifOpen(false); }}
        onDismiss={onDismissNotification}
        onClearAll={onClearAllNotifications}
        theme={theme}
      />

      {/* Add Company Modal */}
      {showAddCompany && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md p-8 rounded-[2.5rem] border shadow-2xl ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <h3 className={`text-xl font-bold uppercase tracking-tight mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Add New ISP</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-8">Create a separate profile for another ISP company.</p>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. MahadNet South"
                  className={`w-full px-6 py-4 rounded-2xl border outline-none transition-all font-bold text-sm ${isDark ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-100 text-slate-900 focus:border-indigo-500'}`}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAddCompany(false)}
                  className={`flex-1 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all ${isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  Cancel
                </button>
                <button
                  onClick={() => { if (newCompanyName.trim()) { onAddCompany?.(newCompanyName); setNewCompanyName(''); setShowAddCompany(false); } }}
                  disabled={!newCompanyName.trim()}
                  className="flex-1 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create ISP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProfileDialog
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        businessName={businessName}
        username={activeManager}
        onLogout={onLogout}
        theme={theme}
        initialTab={profileInitialTab}
        onUpdateProfile={onUpdateProfile}
        currentPhone={currentPhone}
        currentAddress={currentAddress}
      />
    </div>
  );
};

export default Layout;
