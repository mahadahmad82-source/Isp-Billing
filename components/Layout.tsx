
import React, { useState } from 'react';
import NotificationCenter from './NotificationCenter';
import { AppNotification } from '../types';

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
}

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
  isAdmin = false
}) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <svg className={`${activeTab === 'dashboard' ? 'animate-bounce' : ''} w-5 h-5`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg> },
    { id: 'users', label: 'Customers', icon: <svg className={`${activeTab === 'users' ? 'animate-pulse' : ''} w-5 h-5`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> },
    { id: 'receipts', label: 'Receipts', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> },
    { id: 'recoveries', label: 'Recoveries', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg> },
    { id: 'expiries', label: 'Expiries', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg> },
    { id: 'reports', label: 'AI Insights', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> },
    { id: 'settings', label: 'Settings', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'Admin', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg> });
  }

  return (
    <div className={`flex flex-col md:flex-row h-screen transition-colors duration-300 overflow-hidden ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col w-64 p-6 shadow-xl transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900 border-r border-slate-800 text-white' : 'bg-indigo-900 text-white'}`}>
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <div className="p-1 w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/logo-v3.png" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <span className="text-white truncate">{businessName}</span>
          </h1>
          <p className={`text-[10px] mt-1 uppercase tracking-[0.2em] font-black ${theme === 'dark' ? 'text-slate-400' : 'text-indigo-200'}`}>ISP MANAGER v2.5</p>
        </div>
        
        <nav className="space-y-2 flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all font-bold text-sm ${
                activeTab === tab.id 
                  ? (theme === 'dark' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-700 text-white shadow-inner') 
                  : (theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-white/60 hover:text-white hover:bg-indigo-800')
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={`mt-auto pt-6 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-indigo-800'}`}>
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-900">
              {(businessName?.charAt(0) || 'M').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white uppercase tracking-wider truncate">{isAdmin ? 'ADMIN ACCOUNT' : 'MANAGER ACCOUNT'}</p>
              <p className={`text-[9px] font-black truncate ${theme === 'dark' ? 'text-slate-400' : 'text-indigo-200'}`}>
                {businessName || 'SECURE OFFLINE NODE'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Bottom Nav - Mobile Optimization: Grid of 7 to prevent crowding */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 border-t grid ${isAdmin ? 'grid-cols-8' : 'grid-cols-7'} z-50 shadow-2xl no-print transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center py-3 px-0.5 transition-colors gap-0.5 ${
              activeTab === tab.id ? 'text-indigo-600' : (theme === 'dark' ? 'text-slate-500' : 'text-slate-400')
            }`}
          >
            <span className={`${activeTab === tab.id ? 'scale-110' : 'scale-100'} transition-transform`}>
              {tab.icon}
            </span>
            <span className="text-[7.5px] font-black uppercase tracking-tighter truncate w-full text-center">
              {tab.label.split(' ')[0]}
            </span>
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-y-auto custom-scrollbar h-full">
        <header className="flex justify-between items-center mb-8 no-print">
          <div className="flex flex-col">
            <h2 className={`text-2xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{activeTab}</h2>
            {lastSavedTime && (
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mt-0.5">
                Local Save Integrity Check: {lastSavedTime}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={() => setIsNotifOpen(true)}
              className={`p-2 rounded-xl border transition-all shadow-sm flex items-center justify-center w-10 h-10 relative active:rotate-12 active:scale-90 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 animate-pulse">
                  {notifications.length}
                </span>
              )}
            </button>
            <button 
              onClick={onToggleTheme}
              className={`p-2 rounded-xl border transition-all shadow-sm flex items-center justify-center w-10 h-10 active:scale-90 active:rotate-180 duration-500 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-yellow-500' : 'bg-white border-slate-200 text-slate-600'}`}
              title="Toggle Theme"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
              )}
            </button>
          </div>
        </header>
        <div className="w-full">
           {children}
        </div>
      </main>

      <NotificationCenter 
        notifications={notifications}
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        onAction={(tab) => {
          setActiveTab(tab);
          setIsNotifOpen(false);
        }}
        onDismiss={onDismissNotification}
        onClearAll={onClearAllNotifications}
        theme={theme}
      />

      {/* Add Company Modal */}
      {showAddCompany && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md p-8 rounded-[2.5rem] border shadow-2xl ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <h3 className={`text-xl font-black uppercase tracking-tight mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Add New ISP</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-8">Create a separate profile for another ISP company.</p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input 
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. MahadNet South"
                  className={`w-full px-6 py-4 rounded-2xl border outline-none transition-all font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-100 text-slate-900 focus:border-indigo-500'}`}
                />
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowAddCompany(false)}
                  className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (newCompanyName.trim()) {
                      onAddCompany?.(newCompanyName);
                      setNewCompanyName('');
                      setShowAddCompany(false);
                    }
                  }}
                  disabled={!newCompanyName.trim()}
                  className="flex-1 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create ISP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
