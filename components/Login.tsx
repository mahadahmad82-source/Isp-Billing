
import React, { useState, useEffect } from 'react';
import { ManagerAccount } from '../types';
import { getAccounts, saveAccount, setActiveSession, clearAllAccounts, removeAccount, writeLog } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { logoBase64 } from '../utils/logoBase64';

interface LoginProps {
  onLogin: (username: string) => void;
  onBack?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const ADMIN_USERNAME = 'admin';

type ViewType = 'recent' | 'login' | 'signup' | 'otp' | 'forgot' | 'forgot-otp' | 'forgot-newpass' | 'agentLogin';

const Login: React.FC<LoginProps> = ({ onLogin, onBack, theme, onToggleTheme }) => {
  const [accounts, setAccounts] = useState<ManagerAccount[]>([]);
  const [view, setView] = useState<ViewType>('login');
  const [businessName, setBusinessName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Removed OTP states

  // Forgot password states
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);
    if (loadedAccounts.length > 0) {
      setView('recent');
    } else {
      setView('login');
    }
  }, []);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  // ─── EXISTING LOGIN (unchanged - backward compatible) ──────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setLoadingText('Authorising...');
    setError('');

    try {
      const localAccounts = getAccounts();
      const localFound = localAccounts.find(a => (a.username === username || a.email === username || a.phone === username) && a.password === password);

      // Fast path for Field Agents and Admins
      if (localFound && (localFound.role === 'sub-manager' || localFound.role === 'admin')) {
        setActiveSession(localFound.username);
        onLogin(localFound.username);
        return;
      }

      let identifier = username;
      // Note: If username has no "@", we assume it handles both old standard username and new Phone-Only pattern
      const authEmail = identifier.includes('@') ? identifier : `${identifier}@myisp.local`;

      let { data, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: password,
      });

      if (authError || !data?.user) {
        if (localFound) {
          const fallbackEmail = localFound.email && localFound.email.includes('@') ? localFound.email : `${localFound.username}@myisp.local`;
          try {
            const { error: signUpErr } = await supabase.auth.signUp({
              email: fallbackEmail,
              password: localFound.password,
              options: { data: { full_name: localFound.businessName || localFound.username, phone: localFound.phone || '', is_migrated: true } }
            });
            if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) console.warn('Account migration warning: ' + signUpErr.message);

            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: fallbackEmail, password: localFound.password });

            if (signInData?.user) {
              data = signInData;
              authError = null;
              removeAccount(localFound.username); // Safely remove after successful migration
            } else {
              // Fallback to local session
              setActiveSession(localFound.username);
              onLogin(localFound.username);
              return;
            }
          } catch {
            // Fallback to local session if any Supabase error during migration
            setActiveSession(localFound.username);
            onLogin(localFound.username);
            return;
          }
        } else {
          // ✅ FIX: Direct Supabase search for sub-manager (works on Vercel - no Express needed)
          setLoadingText('Searching Remote Nodes...');
          try {
            const { data: managers, error: searchErr } = await supabase
              .from('manager_data')
              .select('manager_id, data');

            if (!searchErr && managers) {
              for (const manager of managers) {
                const agents = (manager.data as any)?.subManagers || [];
                const agent = agents.find((sm: any) =>
                  (sm.username?.toLowerCase() === username.toLowerCase() ||
                   sm.email?.toLowerCase() === username.toLowerCase() ||
                   sm.phone === username) &&
                  sm.password === password
                );
                if (agent) {
                  const agentUsername = agent.username;
                  setActiveSession(agentUsername);
                  saveAccount({
                    username: agentUsername,
                    password: password,
                    businessName: agent.name,
                    email: agent.email || '',
                    phone: agent.phone || '',
                    role: 'sub-manager',
                    managerUsername: manager.manager_id,
                    createdAt: new Date().toISOString(),
                    rememberPassword: true,
                  });
                  onLogin(agentUsername);
                  return;
                }
              }
            }
          } catch (searchEx) {
            console.error('[Auth] Supabase agent search failed:', searchEx);
          }

          throw new Error('Invalid username or password.');
        }
      }

      if (data.user) {
        // Fetch profile to check for role (use maybeSingle to avoid crash on 0 rows for new offline migrations)
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, manager_id, name')
          .eq('email', data.user.email)
          .maybeSingle();

        const role = profileData?.role || 'manager';
        const loginUser = username.includes('@') ? username.split('@')[0] : username;

        setActiveSession(loginUser);
        if (rememberPassword) {
          saveAccount({
            username: loginUser,
            password: password,
            businessName: profileData?.name || data.user.user_metadata?.full_name || loginUser,
            email: data.user.email || '',
            phone: data.user.user_metadata?.phone || '',
            role: role as 'admin' | 'manager' | 'sub-manager',
            managerUsername: profileData?.manager_id || '',
            createdAt: new Date().toISOString(),
            rememberPassword: true
          });
        }
        onLogin(loginUser);
        return;
      }

      throw new Error('Authentication failed.');
    } catch (err: any) {
      showError(err.message || 'Authentication error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── SIGNUP FLOW (Phone Only) ────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) { showError('Password must be at least 4 characters.'); return; }
    if (password !== confirmPassword) { showError('Passwords do not match.'); return; }
    if (phone === ADMIN_USERNAME || accounts.some(a => a.username === phone || a.phone === phone)) {
      showError('This Phone Number is already taken.');
      return;
    }

    setIsLoading(true);
    setLoadingText('Initialising New Node...');
    setError('');

    try {
      // Create a pseudo-email strictly tied to the phone number
      const authEmail = `${phone}@myisp.local`;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: { data: { full_name: businessName || phone, phone: phone } }
      });

      if (signUpErr && signUpErr.message.toLowerCase().includes('already registered')) {
         showError('This Phone Number is already registered.');
         return;
      }
      if (signUpErr) throw new Error(signUpErr.message);
      if (!signUpData.user) throw new Error('Signup failed. Try again.');

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (signInErr) throw new Error('Account created! Please login manually.');

      const newAccount: ManagerAccount = {
        username: phone, password, businessName: businessName || phone,
        email: authEmail, phone: phone, createdAt: new Date().toISOString(), rememberPassword
      };
      saveAccount(newAccount);
      setAccounts(getAccounts());
      writeLog({ username: phone, action: 'SIGNUP', detail: `New account: ${businessName}` });
      onLogin(phone);

    } catch (err: any) {
      showError(`Registration Failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!forgotIdentifier.includes('@') || forgotIdentifier.endsWith('@myisp.local')) {
      // It's a phone number or auto-generated email. Since they have no real email linked, prompt Support Modal.
      setShowSupportModal(true);
      return;
    }

    setIsLoading(true);
    setLoadingText('Sending OTP...');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotIdentifier);
      if (error) throw new Error(error.message);
      setView('forgot-otp');
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        showError('Network error ya Supabase mein email recovery disabled hai. Support pe contact karein.');
      } else {
        showError('OTP send nahi hua: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoadingText('Verifying OTP...');
    setError('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: forgotIdentifier, token: forgotOtp, type: 'recovery',
      });
      if (error) throw new Error('Invalid OTP or it has expired.');
      setView('forgot-newpass');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) { showError('Passwords do not match.'); return; }
    if (newPassword.length < 4) { showError('Password must be at least 4 characters.'); return; }
    setIsLoading(true);
    setLoadingText('Updating password...');
    setError('');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setError('Success: Password updated! You can now login.');
      setTimeout(() => {
        resetFields();
        setView('login');
      }, 2000);
    } catch (err: any) {
      showError('Password update nahi hua: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── UTILITY HANDLERS ─────────────────────────────────────────────────
  const handleSelectAccount = (acc: ManagerAccount) => {
    setSelectedAccount(acc.username);
    setUsername(acc.username);
    if (acc.rememberPassword && acc.password) { setPassword(acc.password); setRememberPassword(true); }
    else { setPassword(''); setRememberPassword(false); }
    setView('login');
  };

  const resetFields = () => {
    setBusinessName(''); setUsername(''); setEmail(''); setPhone('');
    setPassword(''); setConfirmPassword(''); setRememberPassword(false); setError('');
    setForgotIdentifier(''); setForgotOtp('');
    setNewPassword(''); setConfirmNewPassword('');
  };

  const handleGoToSignup = () => { resetFields(); setView('signup'); };
  const handleGoToLogin = () => { resetFields(); setSelectedAccount(null); setView('login'); };
  const handleGoToRecent = () => { resetFields(); setSelectedAccount(null); setView('recent'); };

  const handleDeleteAccount = (usernameToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeAccount(usernameToDelete);
    const updated = getAccounts();
    setAccounts(updated);
    if (updated.length === 0) setView('login');
  };

  const handleClearAllAccounts = () => {
    clearAllAccounts(); setAccounts([]); setSelectedAccount(null);
    setView('signup'); setShowClearConfirm(false);
  };

  const EyeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );

  const EyeOffIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
  );

  const inputCls = `w-full px-6 py-5 rounded-2xl border-2 font-bold outline-none transition-all duration-300 ${theme === 'dark' ? 'bg-[#030712] border-white/5 text-white focus:border-indigo-500/50 placeholder:text-slate-700' : 'bg-slate-50 border-slate-100 text-slate-900 focus:border-indigo-400 placeholder:text-slate-400'}`;
  const labelCls = "text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest ml-1";

  return (
    <div className={`min-h-screen relative flex items-center justify-center p-6 overflow-hidden transition-colors duration-1000 ${theme === 'dark' ? 'bg-[#030712]' : 'bg-slate-50'}`}>

      {/* Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 dark:bg-indigo-500/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 dark:bg-violet-500/20 rounded-full blur-[120px] animate-pulse delay-700"></div>

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-50">
        <button onClick={onToggleTheme} className={`p-3 rounded-xl border transition-all shadow-sm flex items-center justify-center w-10 h-10 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-yellow-500 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} title="Toggle Theme">
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
          )}
        </button>
      </div>

      <div className="w-full max-w-md relative z-10 space-y-8">

        {/* Logo & Title */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-8 duration-700 relative">
          {onBack && (
            <button onClick={onBack} className="absolute left-0 top-0 p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors" title="Back to Home">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
          )}
          <div className="flex justify-center mb-2">
            {logoBase64 && <img src={logoBase64} alt="MYISP Logo" className="w-[120px] md:w-[150px] h-auto object-contain" referrerPolicy="no-referrer" />}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-[0.4em] mt-2 text-center">
              {view === 'signup' ? 'Local Node Registration' : view === 'recent' ? 'Recent Profiles' : view === 'otp' ? 'Verify Your Account' : view === 'forgot' ? 'Password Recovery' : view === 'forgot-otp' ? 'Enter OTP' : view === 'forgot-newpass' ? 'Set New Password' : 'Secure Manager Access'}
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className={`relative rounded-[3rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8 duration-1000 ${theme === 'dark' ? 'bg-slate-900/80 border-white/5' : 'bg-white/90 border-slate-100'}`}>

          {isLoading && (
            <div className="absolute top-0 left-0 right-0 h-1 z-50 overflow-hidden bg-indigo-500/10">
              <div className="h-full bg-indigo-500 animate-[loading-bar_2s_infinite_linear] w-[30%] shadow-[0_0_10px_#6366f1]"></div>
            </div>
          )}

          {error && (
            <div className="px-8 pt-8">
              <div className={`p-4 border rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center ${error.startsWith('Success') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                {error}
              </div>
            </div>
          )}

          {/* ── RECENT ACCOUNTS ── */}
          {view === 'recent' && accounts.length > 0 && (
            <div className="p-10 space-y-6">
              <div className="flex justify-between items-center px-1">
                <div className="flex flex-col">
                  <h4 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-[0.2em]">Stored Profiles</h4>
                  <span className="text-[9px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full mt-1 w-fit">{accounts.length} Node{accounts.length !== 1 ? 's' : ''} Active</span>
                </div>
                <button onClick={() => setShowClearConfirm(true)} className="text-[9px] font-bold text-rose-600 hover:text-rose-700 uppercase tracking-widest bg-rose-500/5 px-3 py-1.5 rounded-xl border border-rose-500/10 transition-all hover:bg-rose-500/10">Clear All</button>
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-2">
                {accounts.map((acc, idx) => (
                  <div key={acc.username} className="relative group/wrapper">
                    <b