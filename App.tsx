
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppState, UserRecord, Receipt, AppSettings, DefaultPlanPricing, ReceiptDesign, AppNotification, Archive, PaymentStatus, SubManagerAccount, AttendanceLog, ComplaintTicket, BusinessExpense } from './types';
import { loadState, saveState, getActiveSession, setActiveSession, getAccounts, generateId, saveAccount, removeAccount } from './utils/storage';
import { saveStateToSupabase, smartLoadAndSync } from './utils/supabaseSync';
import { supabase } from './lib/supabase';
import { showLocalNotification, sendPushNotification } from './lib/pushNotifications';
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
import SubManagerDashboard from './components/SubManager/SubManagerDashboard';
import SubManagerManagement from './components/SubManager/SubManagerManagement';
import ComplaintManager from './components/ComplaintManager';
import BusinessExpenses from './components/BusinessExpenses';
import BusinessAnalytics from './components/BusinessAnalytics';
import LandingPage from './components/LandingPage';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingTour from './components/OnboardingTour';

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
      activeCompanyId: loaded.activeCompanyId || '',
      complaintTickets: loaded.complaintTickets || [],
      businessExpenses: loaded.businessExpenses || [],
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
  const [showTour, setShowTour] = useState(false);
  const [tourMode, setTourMode] = useState<string>('welcome');
  const [userFilter, setUserFilter] = useState<'all' | 'current_month'>('current_month');
  const [preSelectReceiptUser, setPreSelectReceiptUser] = useState<{userId: string; month: string} | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const handleUpdateProfile = (updates: { businessPhone?: string; businessAddress?: string }) => {
    setState(prev => {
      const newState = {
        ...prev,
        settings: {
          ...prev.settings,
          ...updates
        },
        companies: prev.companies.map(c => 
          c.id === prev.activeCompanyId 
            ? { ...c, settings: { ...c.settings, ...updates } } 
            : c
        )
      };
      saveState(newState);
      if (prev.currentManager) {
        saveStateToSupabase(prev.currentManager, newState);
      }
      return newState;
    });
  };

  // Per-page Tour logic
  useEffect(() => {
    if (!activeManager || activeManager === 'admin' || showTour) return;

    // Check master skip key first
    const masterSkipKey = `tour_disabled_${activeManager}`;
    if (localStorage.getItem(masterSkipKey) === 'true') return;

    const tourKey = `tour_seen_${activeManager}_${activeTab}`;
    const alreadySeen = localStorage.getItem(tourKey);

    if (!alreadySeen) {
      // Small delay for tab transition
      const timer = setTimeout(() => {
        setTourMode(activeTab);
        setShowTour(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab, activeManager, showTour]);

  // Listen for custom event from RecoverySummary
  useEffect(() => {
    const handler = (e: Event) => {
      const { userId, month } = (e as CustomEvent).detail;
      // localStorage already written by button, just switch tab
      setActiveTab('receipts');
    };
    window.addEventListener('myisp-goto-receipts', handler);
    return () => window.removeEventListener('myisp-goto-receipts', handler);
  }, [setActiveTab]);
  const [showLanding, setShowLanding] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmationConfig | null>(null);
  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);
  const [isReminderBannerDismissed, setIsReminderBannerDismissed] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>(new Date().toLocaleTimeString());
  const [isAdmin, setIsAdmin] = useState(activeManager === 'admin');
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'sub-manager'>('manager');
  const [agentArea, setAgentArea] = useState<string | undefined>(undefined);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Basic initialization
    setIsAdmin(activeManager === 'admin');
    if (activeManager === 'admin' && activeTab !== 'admin') {
      setActiveTab('admin');
    }
    
    // Check local accounts for role/area
    const account = getAccounts().find(a => a.username === activeManager);
    if (account?.role) {
      setUserRole(account.role);
      // For agents, we also need their area (which we added to profiles and likely saved meta)
      // We might need to fetch this if not in account
    } else if (activeManager === 'admin') {
      setUserRole('admin');
    } else if (activeManager?.startsWith('agent_')) {
      setUserRole('sub-manager');
    } else {
      setUserRole('manager');
    }
  }, [activeManager, activeTab]);

  useEffect(() => {
    if (userRole === 'sub-manager' && activeManager) {
      supabase
        .from('profiles')
        .select('area')
        .eq('email', getAccounts().find(a => a.username === activeManager)?.email || '')
        .single()
        .then(({ data }) => {
          if (data?.area) {
            setAgentArea(data.area);
          }
        });
    }
  }, [userRole, activeManager]);

  useEffect(() => {
    if (activeManager) {
      setActiveSession(activeManager);
      const account = getAccounts().find(a => a.username === activeManager);
      const dataOwner = (account?.role === 'sub-manager' && account.managerUsername) ? account.managerUsername : activeManager;

      // Smart sync: compare localStorage vs Supabase, use richer data
      const localState = loadState(activeManager);
      smartLoadAndSync(dataOwner, localState).then(finalState => {
        setState({
          ...finalState,
          archives: finalState.archives || [],
          dismissedNotificationIds: finalState.dismissedNotificationIds || [],
          companies: finalState.companies || [],
          activeCompanyId: finalState.activeCompanyId || '',
          currentManager: dataOwner
        });
        // Show onboarding welcome for new managers
        if (activeManager !== 'admin') {
          const welcomeKey = `tour_seen_${activeManager}_welcome`;
          if (!localStorage.getItem(welcomeKey)) {
            setShowTour(true);
            setTourMode('welcome');
          }
        }
      });
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
        saveState(newState); saveStateToSupabase(newState.currentManager || activeManager || '', newState);
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
      saveState(newState); saveStateToSupabase(newState.currentManager || activeManager || '', newState);
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
    
    // Explicitly check for tour on login
    if (username !== 'admin') {
      const welcomeKey = `tour_seen_${username}_welcome`;
      if (!localStorage.getItem(welcomeKey)) {
        setTourMode('welcome');
        setShowTour(true);
      }
    } else {
      setActiveTab('admin');
    }
  };

  // OAuth Social Login Handler (Google / Facebook)
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user && !activeManager) {
        const user = session.user;
        const provider = user.app_metadata?.provider;

        // Only handle OAuth providers (not email/password)
        if (provider && provider !== 'email') {
          const userEmail = user.email || '';
          // Derive username from email (e.g. john.doe@gmail.com → john.doe)
          const derivedUsername = userEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_') || `user_${Date.now()}`;
          const displayName = user.user_metadata?.full_name || derivedUsername;

          // Save account to localStorage if not already saved
          const { getAccounts, saveAccount, setActiveSession } = await import('./utils/storage');
          const existing = getAccounts().find(a => a.email === userEmail || a.username === derivedUsername);
          if (!existing) {
            saveAccount({
              username: derivedUsername,
              password: '',
              businessName: displayName,
              email: userEmail,
              phone: '',
              createdAt: new Date().toISOString(),
              rememberPassword: false,
            });
          }
          setActiveSession(existing?.username || derivedUsername);
          setActiveManager(existing?.username || derivedUsername);
          lastActivityRef.current = Date.now();
        }
      }
    });
    return () => { authListener?.subscription?.unsubscribe(); };
  }, [activeManager]);

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
      saveState(state); saveStateToSupabase(state.currentManager || activeManager || '', state);
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
    root.style.setProperty('--color-primary', primary);
    root.style.setProperty('--color-accent', accent);
    
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

  const handleAddAttendanceLog = useCallback((log: Omit<AttendanceLog, 'id'>) => {
    const newLog: AttendanceLog = {
      ...log,
      id: generateId()
    };
    setState(prev => ({
      ...prev,
      attendanceLogs: [...(prev.attendanceLogs || []), newLog]
    }));
  }, []);

  const handleUpdateAttendanceLog = useCallback((logId: string, updates: Partial<AttendanceLog>) => {
    setState(prev => ({
      ...prev,
      attendanceLogs: (prev.attendanceLogs || []).map(log => 
        log.id === logId ? { ...log, ...updates } : log
      )
    }));
  }, []);

  const handleDeleteAttendanceLog = useCallback((logId: string) => {
    setState(prev => ({
      ...prev,
      attendanceLogs: (prev.attendanceLogs || []).filter(log => log.id !== logId)
    }));
  }, []);

  const handleUpdateAgent = useCallback((agentId: string, updates: any) => {
    setState(prev => ({
      ...prev,
      subManagers: (prev.subManagers || []).map(sm => 
        sm.id === agentId ? { ...sm, ...updates } : sm
      )
    }));
  }, []);

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
      onConfirm: () => {
        // ✅ FIX: Restore state AND immediately save to Supabase for cross-device sync
        const restoredState = { ...newState, currentManager: activeManager || undefined };
        setState(restoredState);
        saveState(restoredState);
        if (activeManager) {
          saveStateToSupabase(activeManager, restoredState);
        }
      }
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
      saveState(newState); saveStateToSupabase(newState.currentManager || activeManager || '', newState);
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
      saveState(newState); saveStateToSupabase(newState.currentManager || activeManager || '', newState);
      return newState;
    });
  };

  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleEditReceiptAmount = (id: string, newAmount: number) => {
    setState(prev => {
      const receipt = prev.receipts.find(r => r.id === id);
      if (!receipt) return prev;
      
      const diff = newAmount - receipt.paidAmount;
      
      const updatedUsers = prev.users.map(u => {
        if (u.id === receipt.userId) {
          return { ...u, balance: (u.balance || 0) - diff };
        }
        return u;
      });

      const updatedReceipts = prev.receipts.map(r => {
        if (r.id === id) {
          return { ...r, paidAmount: newAmount };
        }
        return r;
      });

      return {
        ...prev,
        receipts: updatedReceipts,
        users: updatedUsers
      };
    });
    setSuccessToast("Receipt amount updated successfully");
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleVoidReceipt = (id: string) => {
    setConfirmConfig({
      title: 'Void Transaction',
      message: 'This will mark the receipt as Pending and restore customer balance. Continue?',
      variant: 'danger',
      onConfirm: () => {
        setState(prev => {
          const receipt = prev.receipts.find(r => r.id === id);
          if (!receipt) return prev;
          
          const updatedUsers = prev.users.map(u => {
            if (u.id === receipt.userId) {
              return { ...u, balance: (u.balance || 0) + receipt.paidAmount };
            }
            return u;
          });
          
          return {
            ...prev,
            receipts: prev.receipts.map(r => r.id === id ? { ...r, status: PaymentStatus.PENDING, paidAmount: 0, balanceAmount: r.totalAmount } : r),
            users: updatedUsers
          };
        });
        setSuccessToast("Receipt has been voided and marked as Pending.");
        setTimeout(() => setSuccessToast(null), 3000);
      }
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

  if (userRole === 'sub-manager') {
    return (
      <ErrorBoundary>
        {activeTab === 'receipts' ? (
          <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f1a] text-slate-900 dark:text-slate-300 flex flex-col">
            <div className="p-4 bg-white/80 dark:bg-[#0b0f1a]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 sm:px-10">
              <div className="flex items-center gap-5">
                <button 
                  onClick={() => setActiveTab('team')}
                  className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-white/5 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 rounded-full transition-all active:scale-95 text-slate-500 dark:text-slate-400 group shadow-sm border border-slate-200 dark:border-white/10"
                  title="Back to Dashboard"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">New Invoice</h2>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-0.5">Agent Terminal Node</p>
                </div>
              </div>
              <div className="hidden sm:block text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 opacity-60">System Override Protocol</div>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-8">
              <ReceiptGenerator 
                users={state.users}
                settings={currentSettings}
                subManagers={state.subManagers || []}
                preSelectUser={preSelectReceiptUser || undefined}
                onPreSelectConsumed={() => setPreSelectReceiptUser(null)}
                hideHistory={true}
                defaultCollectedBy={state.subManagers?.find(sm => sm.username === activeManager)?.id || activeManager || undefined}
                onAddReceipt={(receipt) => {
                  setState(prev => {
                    const diff = receipt.paidAmount;
                    const updatedUsers = prev.users.map(u => u.id === receipt.userId ? { ...u, balance: (u.balance || 0) - diff } : u);
                    return { ...prev, receipts: [...prev.receipts, receipt], users: updatedUsers };
                  });
                  setSuccessToast("Collection logged successfully!");
                  setTimeout(() => setSuccessToast(null), 3000);
                }}
                receipts={state.receipts}
                onUpdateReceipt={(updatedReceipt) => {
                  setState(prev => ({
                    ...prev,
                    receipts: prev.receipts.map(r => r.id === updatedReceipt.id ? updatedReceipt : r)
                  }));
                }}
                onUpdateUser={(userId, update) => {
                  setState(prev => ({
                    ...prev,
                    users: prev.users.map(u => u.id === userId ? { ...u, ...update } : u)
                  }));
                }}
                onDeleteReceipt={() => {}}
                setLoadingMessage={setLoadingMessage}
              />
            </div>
          </div>
        ) : (
          <SubManagerDashboard 
            subManagerName={activeManager || 'Field Agent'}
            agent={state.subManagers?.find(sm => sm.username === activeManager)}
            agentId={state.subManagers?.find(sm => sm.username === activeManager)?.id || activeManager || ''}
            agentArea={agentArea}
            users={filteredUsers}
            receipts={filteredReceipts}
            settings={currentSettings}
            attendanceLogs={state.attendanceLogs || []}
            onLogout={handleLogout}
            onAddAttendanceLog={handleAddAttendanceLog}
            onIssueInvoice={(userId, agentId) => {
              setPreSelectReceiptUser({ 
                userId, 
                month: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()),
                agentId: agentId
              } as any);
              setActiveTab('receipts');
            }}
            onViewReceipt={(receipt) => {
              // We can reuse the receipts tab logic to view a specific receipt
              // But we need a way to tell ReceiptGenerator to start in View mode
              // Actually, ReceiptGenerator has activeReceipt state.
              // For now, let's just set the tab and maybe we need a preSelectReceipt
              setPreSelectReceiptUser({
                userId: receipt.userId,
                month: receipt.period,
                receiptId: receipt.id // I might need to update ReceiptGenerator to handle this
              } as any);
              setActiveTab('receipts');
            }}
            onUpdateAgent={(agentId, updates) => {
              setState(prev => {
                const newState = {
                  ...prev,
                  subManagers: prev.subManagers?.map(sm => sm.id === agentId ? { ...sm, ...updates } : sm)
                };
                saveState(newState);
                if (newState.currentManager || activeManager) {
                  saveStateToSupabase(newState.currentManager || activeManager || '', newState);
                }
                return newState;
              });
            }}
          />
        )}
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
            <div className="bg-[#0b1120]/90 backdrop-blur-md text-white px-6 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 border border-white/5 flex items-center gap-3">
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
          userRole={userRole}
          activeManager={activeManager || ''}
          onLogout={handleLogout}
          onUpdateProfile={handleUpdateProfile}
          currentPhone={currentSettings.businessPhone}
          currentAddress={currentSettings.businessAddress}
        >
          {activeTab === 'dashboard' && (
            <Dashboard 
              users={filteredUsers} 
              receipts={filteredReceipts} 
              settings={currentSettings} 
              onDeleteReceipt={handleDeleteReceipt} 
              setActiveTab={setActiveTab}
              onSetUserFilter={(filter: 'all' | 'current_month') => { setUserFilter(filter); setActiveTab('users'); }}
              pendingRemindersCount={pendingRemindersCount}
              onLogout={handleLogout}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'users' && <UserManagement users={filteredUsers} receipts={filteredReceipts} archives={state.archives} settings={currentSettings} onAddUser={handleAddUser} onUpdateUser={handleFullUpdateUser} onDeleteUser={handleDeleteUser} onBulkAddUsers={handleBulkAddUsers} onBulkDeleteUsers={handleBulkDeleteUsers} onBulkUpdateUsers={handleBulkUpdateUsers} setLoadingMessage={setLoadingMessage} initialFilter={userFilter} />}
          {activeTab === 'receipts' && <ReceiptGenerator users={state.users || filteredUsers} receipts={filteredReceipts} settings={currentSettings} subManagers={state.subManagers || []} onAddReceipt={handleAddReceipt} onUpdateReceipt={handleUpdateReceipt} onUpdateUser={handleUpdateUser} onDeleteReceipt={handleDeleteReceipt} setLoadingMessage={setLoadingMessage} preSelectUser={preSelectReceiptUser} onPreSelectConsumed={() => setPreSelectReceiptUser(null)} defaultCollectedBy={activeManager || 'admin'} />}
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
              onNavigateToReceipts={(userId, month) => {
                localStorage.setItem('myisp_preselect_receipt', JSON.stringify({ userId, month, ts: Date.now() }));
                setActiveTab('receipts');
              }}
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
          {activeTab === 'settings' && <Settings settings={currentSettings} onUpdateSettings={handleUpdateSettings} onRestoreState={handleRestoreState} onWipeData={handleWipeData} fullState={state} onLogout={handleLogout} onBulkUpdateUsers={handleBulkUpdateUsers} activeManager={activeManager || ''} />}
          {activeTab === 'admin' && isAdmin && <AdminDashboard />}
          {activeTab === 'complaints' && userRole === 'manager' && (
            <ComplaintManager
              tickets={state.complaintTickets || []}
              subManagers={state.subManagers || []}
              users={filteredUsers}
              managerId={activeManager || ''}
              onAddTicket={(t) => {
                setState(prev => {
                  const newState = { ...prev, complaintTickets: [...(prev.complaintTickets || []), { ...t, id: generateId(), createdAt: new Date().toISOString() }] };
                  saveState(newState); saveStateToSupabase(activeManager || '', newState); return newState;
                });
              }}
              onUpdateTicket={(id, updates) => {
                setState(prev => {
                  const newState = { ...prev, complaintTickets: (prev.complaintTickets || []).map(t => t.id === id ? { ...t, ...updates } : t) };
                  saveState(newState); saveStateToSupabase(activeManager || '', newState); return newState;
                });
              }}
              onDeleteTicket={(id) => {
                setState(prev => {
                  const newState = { ...prev, complaintTickets: (prev.complaintTickets || []).filter(t => t.id !== id) };
                  saveState(newState); saveStateToSupabase(activeManager || '', newState); return newState;
                });
              }}
            />
          )}
          {activeTab === 'expenses' && userRole === 'manager' && (
            <BusinessExpenses
              expenses={state.businessExpenses || []}
              receipts={filteredReceipts}
              onAdd={(e) => {
                setState(prev => {
                  const newState = { ...prev, businessExpenses: [...(prev.businessExpenses || []), { ...e, id: generateId(), createdAt: new Date().toISOString() }] };
                  saveState(newState); saveStateToSupabase(activeManager || '', newState); return newState;
                });
              }}
              onDelete={(id) => {
                setState(prev => {
                  const newState = { ...prev, businessExpenses: (prev.businessExpenses || []).filter(e => e.id !== id) };
                  saveState(newState); saveStateToSupabase(activeManager || '', newState); return newState;
                });
              }}
            />
          )}
          {activeTab === 'analytics' && userRole === 'manager' && (
            <BusinessAnalytics
              users={filteredUsers}
              receipts={filteredReceipts}
              expenses={state.businessExpenses || []}
              settings={currentSettings}
            />
          )}
          {activeTab === 'team' && userRole === 'manager' && (
            <SubManagerManagement 
              subManagers={state.subManagers || []}
              recentReceipts={filteredReceipts.filter(r => r.collectedBy)}
              managerId={activeManager || ''}
              onVoidReceipt={handleVoidReceipt}
              onEditReceiptAmount={handleEditReceiptAmount}
              onViewLogs={(id) => console.log('Logs for', id)}
              onAgentRecruited={(agent) => {
                setSuccessToast("Agent Recruited Successfully! Use their email and password to log into the Agent Portal.");
                setTimeout(() => setSuccessToast(null), 5000);
                
    const agentUsername = agent.username;
    const agentId = generateId();

    // Save to local accounts array so they can login directly via the main Login screen
    saveAccount({
      username: agentUsername,
      password: agent.password, // The recruited agent's password from form
      businessName: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: 'sub-manager',
      managerUsername: activeManager || '',
      createdAt: new Date().toISOString(),
      rememberPassword: false // Require explicit remember
    });

    setState(prev => {
      const newState = {
        ...prev,
        subManagers: [...(prev.subManagers || []), {
          id: agentId,
          name: agent.name,
          username: agentUsername,
          managerUsername: activeManager || '',
          dutyStatus: 'offline' as const,
          area: agent.area,
          password: agent.password, // Keep password synced for remote lookups
          email: agent.email,
          phone: agent.phone
        }]
      };
      saveState(newState);
      if (newState.currentManager || activeManager) {
        saveStateToSupabase(newState.currentManager || activeManager || '', newState);
      }
      return newState;
    });
              }}
              onEditAgent={(id, updates) => {
                const agent = state.subManagers?.find(a => a.id === id);
                if (agent) {
                  // If we need to update the agent's name in accounts
                  const accounts = getAccounts();
                  const targetAccount = accounts.find(a => a.username === agent.username);
                  if (targetAccount) {
                    const updatedAccount = { 
                      ...targetAccount, 
                      username: updates.username || targetAccount.username,
                      businessName: updates.name || targetAccount.businessName,
                      email: updates.email || targetAccount.email,
                      phone: updates.phone || targetAccount.phone,
                      password: updates.password || targetAccount.password,
                      salary: updates.salary !== undefined ? updates.salary : (targetAccount as any).salary
                    };
                    
                    if (updates.username && updates.username !== agent.username) {
                      removeAccount(agent.username);
                    }
                    saveAccount(updatedAccount as any);
                  }
                }
                setState(prev => {
                  const newState = {
                    ...prev,
                    subManagers: prev.subManagers?.map(sm => sm.id === id ? { ...sm, ...updates } : sm)
                  };
                  saveState(newState);
                  if (newState.currentManager || activeManager) {
                    saveStateToSupabase(newState.currentManager || activeManager || '', newState);
                  }
                  return newState;
                });
                setSuccessToast("Agent updated successfully");
                setTimeout(() => setSuccessToast(null), 3000);
              }}
              onDeleteAgent={(id) => {
                const agent = state.subManagers?.find(a => a.id === id);
                if (agent) {
                   removeAccount(agent.username);
                }
                setState(prev => {
                  const newState = {
                    ...prev,
                    subManagers: prev.subManagers?.filter(sm => sm.id !== id)
                  };
                  saveState(newState);
                  if (newState.currentManager || activeManager) {
                    saveStateToSupabase(newState.currentManager || activeManager || '', newState);
                  }
                  return newState;
                });
                setSuccessToast("Agent deleted successfully");
                setTimeout(() => setSuccessToast(null), 3000);
              }}
              onAddAttendanceLog={handleAddAttendanceLog}
              complaintTickets={(state.complaintTickets || []).filter(t => t.assignedTo === activeManager || t.assignedTo === activeManager)}
              onResolveComplaint={(ticketId) => {
                setState(prev => {
                  const newState = { ...prev, complaintTickets: (prev.complaintTickets || []).map(t => t.id === ticketId ? { ...t, status: 'resolved' as const, resolvedAt: new Date().toISOString() } : t) };
                  saveState(newState); saveStateToSupabase(activeManager || '', newState); return newState;
                });
              }}
              onUpdateAttendanceLog={handleUpdateAttendanceLog}
              onDeleteAttendanceLog={handleDeleteAttendanceLog}
              attendanceLogs={state.attendanceLogs || []}
            />
          )}
        </Layout>

      {successToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-emerald-600/20 flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span className="text-sm font-bold tracking-tight">{successToast}</span>
          </div>
        </div>
      )}

      {showTour && (
        <OnboardingTour 
          onClose={() => {
            setShowTour(false);
            if (activeManager) {
              localStorage.setItem(`tour_seen_${activeManager}_${tourMode}`, 'true');
            }
          }} 
          onSkipAll={() => {
            setShowTour(false);
            if (activeManager) {
              localStorage.setItem(`tour_disabled_${activeManager}`, 'true');
            }
          }}
          activeTab={tourMode}
        />
      )}

      {pendingRemindersCount > 0 && activeTab !== 'expiries' && !isReminderBannerDismissed && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] animate-in slide-in-from-top-10 flex items-center gap-2">
          <div className="flex bg-orange-600 rounded-[2rem] shadow-2xl overflow-hidden group">
            <button 
              onClick={() => setActiveTab('expiries')}
              className="text-white px-6 py-4 flex items-center gap-4 hover:bg-orange-700 transition-colors"
            >
              <span className="text-xl">🚀</span>
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 leading-none">Automation Ready</p>
                <p className="text-sm font-bold">{pendingRemindersCount} Reminders Pending Today</p>
              </div>
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Start Cycle</span>
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
            <h2 className="text-xl font-bold mb-2">{confirmConfig.title}</h2>
            <p className="text-xs text-slate-500 mb-8">{confirmConfig.message}</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }} 
                className={`w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-widest text-white ${confirmConfig.variant === 'danger' ? 'bg-red-600' : 'bg-indigo-600'}`}
              >
                Execute Action
              </button>
              <button 
                onClick={() => setConfirmConfig(null)} 
                className="w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
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
