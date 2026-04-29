
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppState, UserRecord, Receipt, AppSettings, DefaultPlanPricing, ReceiptDesign, AppNotification, Archive } from './types';
import { loadState, saveState, getActiveSession, setActiveSession } from './utils/storage';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import ReceiptGenerator from './components/ReceiptGenerator';
import Insights from './components/Insights';
import Expiries from './components/Expiries';
import Settings from './components/Settings';
import RecoverySummary from './components/RecoverySummary';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import Archives from './components/Archives';
import LandingPage from './components/LandingPage';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';

interface ConfirmationConfig {
  title: string;
  message: string;
  onConfirm: () => void;
  variant: 'danger' | 'warning' | 'info';
}

const INACTIVITY_LIMIT = 30 * 60 * 1000;

const App: React.FC = () => {
  const [activeManager, setActiveManager] = useState<string | null>(getActiveSession());
  const [state, setState] = useState<AppState>(() => {
    const loaded = loadState(activeManager);
    const initialState = { 
      ...loaded, 
      archives: loaded.archives || [],
      dismissedNotificationIds: loaded.dismissedNotificationIds || [],
      companies: loaded.companies || [],
      activeCompanyId: loaded.activeCompanyId || ''
    };

    // Initialize first company if none exists
    if (initialState.companies.length === 0) {
      const defaultCompanyId = 'COMP-DEFAULT';
      initialState.companies = [{
        id: defaultCompanyId,
        name: loaded.settings?.businessName || 'Default ISP',
        settings: loaded.settings || {
          businessName: 'Default ISP',
          businessPhone: '',
          businessEmail: '',
          businessAddress: 'Pakistan',
          globalNote: 'Thank you for choosing us.',
          planPrices: { ...DefaultPlanPricing },
          receiptDesign: ReceiptDesign.PROFESSIONAL,
          isInitialized: false,
          autoReminderChannel: 'whatsapp'
        }
      }];
      initialState.activeCompanyId = defaultCompanyId;
    }

    return initialState;
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLanding, setShowLanding] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmationConfig | null>(null);
  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);
  const [isReminderBannerDismissed, setIsReminderBannerDismissed] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>(new Date().toLocaleTimeString());
  const [isAdmin, setIsAdmin] = useState(activeManager === 'admin');
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Basic initialization
    setIsAdmin(activeManager === 'admin');
  }, [activeManager]);

  useEffect(() => {
    if (activeManager) {
      setActiveSession(activeManager);
      const newState = loadState(activeManager);
      setState(newState);
    } else {
      setActiveSession(null);
    }
  }, [activeManager]);

  const activeCompany = useMemo(() => {
    if (!state?.companies) return null;
    return state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  }, [state.companies, state.activeCompanyId]);

  const currentSettings: AppSettings = useMemo(() => {
    return activeCompany?.settings || state?.settings || {
      businessName: 'MYISP',
      businessPhone: '',
      businessEmail: '',
      businessAddress: 'Pakistan',
      globalNote: 'Thank you for choosing us.',
      planPrices: { ...DefaultPlanPricing },
      receiptDesign: ReceiptDesign.PROFESSIONAL,
      isInitialized: false,
      autoReminderChannel: 'whatsapp'
    };
  }, [activeCompany, state?.settings]);

  const filteredUsers = useMemo(() => {
    if (!state?.users) return [];
    return state.users.filter(u => !u.companyId || u.companyId === activeCompany?.id);
  }, [state?.users, activeCompany?.id]);

  const filteredReceipts = useMemo(() => {
    if (!state?.receipts) return [];
    return state.receipts.filter(r => !r.companyId || r.companyId === activeCompany?.id);
  }, [state?.receipts, activeCompany?.id]);

  const handleSwitchCompany = (companyId: string) => {
    setLoadingMessage("Switching Environment...");
    setTimeout(() => {
      setState(prev => {
        const newState = { ...prev, activeCompanyId: companyId };
        saveState(newState);
        return newState;
      });
      setLoadingMessage(null);
    }, 500);
  };

  const handleAddCompany = (name: string) => {
    setState(prev => {
      const newCompany: any = {
        id: `COMP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        name,
        settings: { ...currentSettings, businessName: name, isInitialized: true }
      };
      const newState = {
        ...prev,
        companies: [...(prev.companies || []), newCompany],
        activeCompanyId: newCompany.id
      };
      saveState(newState);
      return newState;
    });
  };

  const notifications = useMemo(() => {
    const list: AppNotification[] = [];
    if (!activeManager || !state?.users || !state?.receipts) return list;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    state.users.forEach(u => {
      if (u && u.companyId && u.companyId !== activeCompany?.id) return;
      if (!u || !u.expiryDate) return;
      
      const exp = new Date(u.expiryDate);
      if (isNaN(exp.getTime())) return;
      
      exp.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (diffDays >= 0 && diffDays <= 3) {
        list.push({
          id: `notif-exp-${u.id}`,
          type: 'EXPIRY',
          priority: diffDays === 0 ? 'HIGH' : 'MEDIUM',
          title: diffDays === 0 ? 'Interruption Risk' : 'Upcoming Expiry',
          message: `${u.name}'s ${u.plan} subscription expires ${diffDays === 0 ? 'today' : `in ${diffDays} days`}.`,
          timestamp: new Date().toISOString(),
          userId: u.id,
          actionLabel: 'Remind',
          actionTab: 'expiries'
        });
      }

      if (diffDays < 0 && (u.balance || 0) > 0) {
        list.push({
          id: `notif-due-${u.id}`,
          type: 'OVERDUE',
          priority: 'HIGH',
          title: 'High Arrears Alert',
          message: `${u.name} is expired with a balance of Rs. ${(u.balance || 0).toLocaleString()}.`,
          timestamp: new Date().toISOString(),
          userId: u.id,
          actionLabel: 'Recover',
          actionTab: 'recoveries'
        });
      }
    });

    if (state.receipts.length > 50) {
      list.push({
        id: 'system-backup-check',
        type: 'SYSTEM',
        priority: 'LOW',
        title: 'Backup Recommended',
        message: 'You have over 50 transaction records. Consider generating a backup file from settings.',
        timestamp: new Date().toISOString(),
        actionLabel: 'Go to Settings',
        actionTab: 'settings'
      });
    }

    return list
      .filter(n => !(state.dismissedNotificationIds || []).includes(n.id))
      .sort((a, b) => {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      });
  }, [state?.users, state?.receipts, state?.dismissedNotificationIds, activeManager, activeCompany?.id]);

  useEffect(() => {
    if (!activeManager || !state.users.length) return;

    const getDaysUntilExpiry = (dateStr: string) => {
      const exp = new Date(dateStr);
      exp.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
    };

    const isRemindedToday = (lastSent?: string) => {
      if (!lastSent) return false;
      const last = new Date(lastSent).toDateString();
      const now = new Date().toDateString();
      return last === now;
    };

    const dueReminders = state.users.filter(u => 
      (!u.companyId || u.companyId === activeCompany?.id) && 
      getDaysUntilExpiry(u.expiryDate) === 3 && 
      !isRemindedToday(u.lastReminderSentAt)
    );
    
    if (dueReminders.length !== pendingRemindersCount) {
      setIsReminderBannerDismissed(false);
    }
    setPendingRemindersCount(dueReminders.length);
  }, [activeManager, state.users, activeCompany, pendingRemindersCount]);

  const handleLogin = (username: string) => {
    setActiveManager(username);
    lastActivityRef.current = Date.now();
  };

  const handleLogout = useCallback(() => {
    setActiveSession(null);
    sessionStorage.clear();
    setActiveManager(null);
    setIsAdmin(false);
    
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  }, []);



  useEffect(() => {
    if (!activeManager) return;
    const checkInactivity = () => {
      if (Date.now() - lastActivityRef.current > INACTIVITY_LIMIT) {
        handleLogout();
      }
    };
    const updateActivity = () => { lastActivityRef.current = Date.now(); };
    const interval = setInterval(checkInactivity, 60000);
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity, { passive: true });
    window.addEventListener('click', updateActivity);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      window.removeEventListener('click', updateActivity);
    };
  }, [activeManager, handleLogout]);

  useEffect(() => {
    if (activeManager) {
      // Always save to local storage immediately for data safety
      saveState(state);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Apply Dynamic Theme Colors
    const root = document.documentElement;
    const primary = currentSettings.themePrimaryColor || '#4f46e5';
    const accent = currentSettings.themeAccentColor || '#10b981';
    
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--accent', accent);
    
    // Generate a lighter version for backgrounds (simplified)
    const primaryLight = primary + '1a'; // 10% opacity hex
    root.style.setProperty('--primary-light', primaryLight);
    
    // Generate a darker version for hover (simplified)
    root.style.setProperty('--primary-dark', primary); // For now just use same or could darken
  }, [state, activeManager, currentSettings]);

  const handleToggleTheme = () => {
    setState(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setLoadingMessage("Saving Settings...");
    setTimeout(() => {
      setState(prev => {
        const updatedCompanies = (prev.companies || []).map(c => 
          c.id === prev.activeCompanyId ? { ...c, settings: newSettings } : c
        );
        return { 
          ...prev, 
          settings: newSettings,
          companies: updatedCompanies
        };
      });
      setLoadingMessage(null);
    }, 800);
  };

  const handleAddUser = (user: UserRecord) => {
    setLoadingMessage("Adding Customer...");
    setTimeout(() => {
      setState(prev => ({ 
        ...prev, 
        users: [...prev.users, { ...user, activatedMonths: user.activatedMonths || [], companyId: prev.activeCompanyId }] 
      }));
      setLoadingMessage(null);
    }, 400);
  };

  const handleBulkAddUsers = (incomingUsers: UserRecord[]) => {
    setLoadingMessage(`Importing ${incomingUsers.length} Records...`);
    setTimeout(() => {
      setState(prev => {
        const userMap = new Map<string, UserRecord>(prev.users.map(u => [u.username.toLowerCase().trim(), u]));
        
        incomingUsers.forEach(incoming => {
          const key = incoming.username.toLowerCase().trim();
          const existing = userMap.get(key);
          
          if (existing) {
            // Merge activatedMonths
            const existingMonths = new Set(existing.activatedMonths || []);
            (incoming.activatedMonths || []).forEach(m => existingMonths.add(m));
            
            userMap.set(key, {
              ...existing,
              ...incoming, // Update with new details (balance, plan, etc)
              id: existing.id, // Keep original ID
              activatedMonths: Array.from(existingMonths),
              createdAt: existing.createdAt, // Keep original creation date
              companyId: existing.companyId || prev.activeCompanyId
            });
          } else {
            userMap.set(key, { ...incoming, activatedMonths: incoming.activatedMonths || [], companyId: prev.activeCompanyId });
          }
        });

        return { ...prev, users: Array.from(userMap.values()) };
      });
      setLoadingMessage(null);
    }, 800);
  };

  const handleBulkUpdateUsers = (updatedUsers: UserRecord[]) => {
    setState(prev => {
      const userMap = new Map(prev.users.map(u => [u.id, u]));
      updatedUsers.forEach(u => userMap.set(u.id, u));
      return { ...prev, users: Array.from(userMap.values()) };
    });
  };

  const handleBulkDeleteUsers = (ids: string[]) => {
    setConfirmConfig({
      title: 'Bulk Deletion',
      message: `Permanently remove ${ids.length} records?`,
      variant: 'danger',
      onConfirm: () => {
        setState(prev => ({ ...prev, users: prev.users.filter(u => !ids.includes(u.id)) }));
      }
    });
  };

  const handleAddReceipt = (receipt: Receipt) => {
    setLoadingMessage("Generating Receipt...");
    setTimeout(() => {
      setState(prev => {
        const updatedUsers = prev.users.map(u => {
          if (u.id === receipt.userId) {
            const months = u.activatedMonths || [];
            if (!months.includes(receipt.period)) {
              return { ...u, activatedMonths: [...months, receipt.period] };
            }
          }
          return u;
        });
        return { 
          ...prev, 
          receipts: [...prev.receipts, { ...receipt, companyId: prev.activeCompanyId }], 
          users: updatedUsers 
        };
      });
      setLoadingMessage(null);
    }, 600);
  };

  const handleUpdateReceipt = (receipt: Receipt) => {
    setState(prev => ({ ...prev, receipts: prev.receipts.map(r => r.id === receipt.id ? receipt : r) }));
  };

  const handleImportReceipts = (newReceipts: Receipt[]) => {
    setState(prev => ({ 
      ...prev, 
      receipts: [...prev.receipts, ...newReceipts.map(r => ({ ...r, companyId: prev.activeCompanyId }))] 
    }));
  };

  const handleDeleteReceipt = (id: string) => {
    setConfirmConfig({
      title: 'Discard Record',
      message: 'Remove transaction from history?',
      variant: 'danger',
      onConfirm: () => {
        setState(prev => ({ ...prev, receipts: prev.receipts.filter(r => r.id !== id) }));
      }
    });
  };

  const handleDeleteUser = (id: string) => {
    setConfirmConfig({
      title: 'Purge Subscriber',
      message: 'All profile data for this user will be permanently deleted.',
      variant: 'danger',
      onConfirm: () => {
        setState(prev => ({ ...prev, users: prev.users.filter(u => u.id !== id) }));
      }
    });
  };

  const handleUpdateUser = (userId: string, update: Partial<UserRecord>) => {
    setState(prev => ({ ...prev, users: prev.users.map(u => u.id === userId ? { ...u, ...update } : u) }));
  };

  const handleFullUpdateUser = (user: UserRecord) => {
    setState(prev => ({ ...prev, users: prev.users.map(u => u.id === user.id ? user : u) }));
  };



  const handleMarkUserReminded = (userId: string) => {
    handleUpdateUser(userId, { lastReminderSentAt: new Date().toISOString() });
  };

  const handleRestoreState = (newState: AppState) => {
    setConfirmConfig({
      title: 'System Restore',
      message: 'Overwrite current database with backup file?',
      variant: 'warning',
      onConfirm: () => setState({ ...newState, currentManager: activeManager || undefined })
    });
  };

  const handleCreateArchive = (name: string, usersToArchive: UserRecord[], month?: string, year?: string) => {
    setLoadingMessage(`Creating ${name} Snapshot...`);
    
    setTimeout(() => {
      const newArchive: Archive = {
        id: `arch-${Date.now()}`,
        name,
        month,
        year,
        createdAt: new Date().toISOString(),
        users: usersToArchive
      };
      setState(prev => ({ ...prev, archives: [newArchive, ...(prev.archives || [])] }));
      setLoadingMessage(null);
    }, 800);
  };

  const handleDeleteArchive = (id: string) => {
    setConfirmConfig({
      title: 'Delete Archive',
      message: 'Permanently remove this monthly record?',
      variant: 'danger',
      onConfirm: () => {
        setLoadingMessage('Purging Archive Data...');
        setTimeout(() => {
          setState(prev => ({ ...prev, archives: prev.archives.filter(a => a.id !== id) }));
          setLoadingMessage(null);
        }, 500);
      }
    });
  };

  const handleRenamePeriod = (oldPeriod: string, newPeriod: string) => {
    setState(prev => {
      const updatedReceipts = prev.receipts.map(r => r.period === oldPeriod ? { ...r, period: newPeriod } : r);
      const updatedUsers = prev.users.map(u => {
        const newMonths = (u.activatedMonths || []).map(m => m === oldPeriod ? newPeriod : m);
        const uniqueMonths = Array.from(new Set(newMonths));
        return { ...u, activatedMonths: uniqueMonths };
      });
      return { ...prev, receipts: updatedReceipts, users: updatedUsers };
    });
  };

  const handleDeletePeriod = (period: string) => {
    setConfirmConfig({
      title: 'Delete Period',
      message: `Permanently delete all data for ${period}? This action cannot be undone.`,
      variant: 'danger',
      onConfirm: () => {
        setState(prev => {
          const updatedReceipts = prev.receipts.filter(r => r.period !== period);
          const updatedUsers = prev.users.map(u => ({
            ...u,
            activatedMonths: (u.activatedMonths || []).filter(m => m !== period)
          }));
          return { ...prev, receipts: updatedReceipts, users: updatedUsers };
        });
      }
    });
  };

  const handleWipeData = () => {
    setConfirmConfig({
      title: 'Factory Reset',
      message: 'Permanently erase ALL records for this account?',
      variant: 'danger',
      onConfirm: () => {
        if (activeManager) {
          localStorage.removeItem(`mahadnet_data_${activeManager}`);
          window.location.reload();
        }
      }
    });
  };

  const handleDismissNotification = (id: string) => {
    setState(prev => {
      const newState = {
        ...prev,
        dismissedNotificationIds: [...(prev.dismissedNotificationIds || []), id]
      };
      saveState(newState);
      return newState;
    });
  };

  const handleClearAllNotifications = () => {
    setState(prev => {
      const allIds = notifications.map(n => n.id);
      const newState = {
        ...prev,
        dismissedNotificationIds: [...(prev.dismissedNotificationIds || []), ...allIds]
      };
      saveState(newState);
      return newState;
    });
  };

  const handleRecordLatePayment = (archiveId: string, receipt: Receipt) => {
    setLoadingMessage("Recording Late Payment...");
    setTimeout(() => {
      setState(prev => {
        const updatedArchives = prev.archives.map(arch => {
          if (arch.id === archiveId) {
            // Update the user record in the archive if necessary
            // In our system, archives store the users as they were.
            // But we might want to track that this user paid in the archive view.
            const updatedUsers = arch.users.map(u => {
              if (u.id === receipt.userId || u.username === receipt.username) {
                return { ...u, balance: (u.balance || 0) - receipt.paidAmount };
              }
              return u;
            });
            return { ...arch, users: updatedUsers };
          }
          return arch;
        });

        return {
          ...prev,
          receipts: [...prev.receipts, { ...receipt, isLatePayment: true, companyId: prev.activeCompanyId }],
          archives: updatedArchives
        };
      });
      setLoadingMessage(null);
    }, 600);
  };

  if (!activeManager) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="*" element={
              showLanding ? (
                <LandingPage 
                  onGetStarted={() => setShowLanding(false)} 
                  theme={state.theme || 'light'} 
                  onToggleTheme={handleToggleTheme}
                />
              ) : (
                <Login 
                  onLogin={handleLogin} 
                  onBack={() => setShowLanding(true)} 
                  theme={state.theme || 'light'} 
                  onToggleTheme={handleToggleTheme}
                />
              )
            } />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {loadingMessage && (
          <div className="fixed top-0 left-0 right-0 z-[1000] no-print">
            <div className="h-1.5 w-full overflow-hidden bg-indigo-500/10">
              <div className="h-full bg-indigo-500 animate-[loading-bar_1.5s_infinite_linear] w-[40%] shadow-[0_0_15px_rgba(99,102,241,0.8)] rounded-full"></div>
            </div>
            <div className="flex justify-center mt-3">
              <div className="bg-[#0b1120]/90 backdrop-blur-md text-white px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 border border-white/5 flex items-center gap-3">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                {loadingMessage}
              </div>
            </div>
          </div>
        )}
        <Layout 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          theme={state.theme || 'light'} 
          businessName={currentSettings.businessName} 
          onToggleTheme={handleToggleTheme}
          lastSavedTime={lastSavedTime}
          notifications={notifications}
          onDismissNotification={handleDismissNotification}
          onClearAllNotifications={handleClearAllNotifications}
          companies={state.companies}
          activeCompanyId={state.activeCompanyId}
          onSwitchCompany={handleSwitchCompany}
          onAddCompany={handleAddCompany}
          isAdmin={isAdmin}
        >
          {activeTab === 'dashboard' && (
            <Dashboard 
              users={filteredUsers} 
              receipts={filteredReceipts} 
              settings={currentSettings} 
              onDeleteReceipt={handleDeleteReceipt} 
              setActiveTab={setActiveTab} 
              pendingRemindersCount={pendingRemindersCount}
              onLogout={handleLogout}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'users' && <UserManagement users={filteredUsers} receipts={filteredReceipts} archives={state.archives} settings={currentSettings} onAddUser={handleAddUser} onUpdateUser={handleFullUpdateUser} onDeleteUser={handleDeleteUser} onBulkAddUsers={handleBulkAddUsers} onBulkDeleteUsers={handleBulkDeleteUsers} onBulkUpdateUsers={handleBulkUpdateUsers} setLoadingMessage={setLoadingMessage} />}
          {activeTab === 'receipts' && <ReceiptGenerator users={filteredUsers} receipts={filteredReceipts} settings={currentSettings} onAddReceipt={handleAddReceipt} onUpdateReceipt={handleUpdateReceipt} onUpdateUser={handleUpdateUser} onDeleteReceipt={handleDeleteReceipt} setLoadingMessage={setLoadingMessage} />}
          {activeTab === 'recoveries' && (
            <RecoverySummary 
              users={filteredUsers} 
              receipts={filteredReceipts} 
              settings={currentSettings} 
              onImportReceipts={handleImportReceipts} 
              onBulkAddUsers={handleBulkAddUsers}
              onBulkUpdateUsers={handleBulkUpdateUsers} 
              onDeletePeriod={handleDeletePeriod} 
              onRenamePeriod={handleRenamePeriod} 
            />
          )}
          {activeTab === 'expiries' && <Expiries users={filteredUsers} settings={currentSettings} onMarkReminded={handleMarkUserReminded} setLoadingMessage={setLoadingMessage} />}
          {activeTab === 'archives' && (
            <Archives 
              archives={state.archives} 
              currentUsers={filteredUsers} 
              onCreateArchive={handleCreateArchive} 
              onDeleteArchive={handleDeleteArchive} 
              onBulkAddUsers={handleBulkAddUsers}
              onBulkUpdateUsers={handleBulkUpdateUsers}
              onBack={() => setActiveTab('dashboard')} 
              setLoadingMessage={setLoadingMessage}
              onRecordLatePayment={handleRecordLatePayment}
              settings={currentSettings}
            />
          )}
          {activeTab === 'reports' && <Insights users={filteredUsers} receipts={filteredReceipts} />}
          {activeTab === 'settings' && <Settings settings={currentSettings} onUpdateSettings={handleUpdateSettings} onRestoreState={handleRestoreState} onWipeData={handleWipeData} fullState={state} onLogout={handleLogout} onBulkUpdateUsers={handleBulkUpdateUsers} />}
          {activeTab === 'admin' && isAdmin && <AdminDashboard />}
        </Layout>

      {pendingRemindersCount > 0 && activeTab !== 'expiries' && !isReminderBannerDismissed && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] animate-in slide-in-from-top-10 flex items-center gap-2">
          <div className="flex bg-orange-600 rounded-[2rem] shadow-2xl overflow-hidden group">
            <button 
              onClick={() => setActiveTab('expiries')}
              className="text-white px-6 py-4 flex items-center gap-4 hover:bg-orange-700 transition-colors"
            >
              <span className="text-xl">🚀</span>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none">Automation Ready</p>
                <p className="text-sm font-bold">{pendingRemindersCount} Reminders Pending Today</p>
              </div>
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase">Start Cycle</span>
            </button>
            <button 
              onClick={() => setIsReminderBannerDismissed(true)}
              className="bg-orange-700/50 hover:bg-orange-800 text-white px-4 border-l border-white/10 transition-colors flex items-center justify-center"
              title="Close Banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {confirmConfig && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setConfirmConfig(null)}></div>
          <div className={`relative z-10 w-full max-sm:p-8 p-8 rounded-[2.5rem] shadow-2xl border text-center ${state.theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-900'}`}>
            <h2 className="text-xl font-black mb-2">{confirmConfig.title}</h2>
            <p className="text-xs text-slate-500 mb-8">{confirmConfig.message}</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }} 
                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white ${confirmConfig.variant === 'danger' ? 'bg-red-600' : 'bg-indigo-600'}`}
              >
                Execute Action
              </button>
              <button 
                onClick={() => setConfirmConfig(null)} 
                className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
