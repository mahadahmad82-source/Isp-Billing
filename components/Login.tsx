
import React, { useState, useEffect } from 'react';
import { ManagerAccount } from '../types';
import { getAccounts, saveAccount, setActiveSession, clearAllAccounts, removeAccount, writeLog } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { findAgentManager } from '../utils/supabaseSync';
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
      
      // Fast path for Admins only (agents always verify via Supabase)
      if (localFound && localFound.role === 'admin') {
        setActiveSession(localFound.username);
        onLogin(localFound.username);
        return;
      }
      // For sub-managers: restore session from sessionStorage if available
      const agentSession = sessionStorage.getItem('agent_temp_session');
      if (agentSession) {
        const sess = JSON.parse(agentSession);
        if ((sess.username === username || sess.email === username || sess.phone === username) && localFound?.password === password) {
          setActiveSession(sess.username);
          onLogin(sess.username);
          return;
        }
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
          // If Supabase Auth fails and no local account, try searching the manager_data JSON for a sub-manager match via secure server-side API
          // This allows field agents recruited by managers to log in even on a fresh device
          setLoadingText('Searching Remote Nodes...');
          
          try {
            // Use findAgentManager — searches all managers in Supabase
            const result = await findAgentManager(username, password);

            if (result) {
              const { agentUsername, managerUsername, agentInfo } = result;
              // Save agent session in sessionStorage (not localStorage)
              sessionStorage.setItem('agent_temp_session', JSON.stringify({
                username: agentUsername,
                managerUsername: managerUsername,
                businessName: agentInfo.name || agentUsername,
                email: agentInfo.email || '',
                phone: agentInfo.phone || '',
                role: 'sub-manager'
              }));
              // Also save to localStorage so getAccounts() can find this agent
              saveAccount({
                username: agentUsername,
                password: password,
                businessName: agentInfo.name || agentUsername,
                email: agentInfo.email || '',
                phone: agentInfo.phone || '',
                role: 'sub-manager',
                managerUsername: managerUsername,
                createdAt: new Date().toISOString(),
                rememberPassword: false
              });
              setActiveSession(agentUsername);
              onLogin(agentUsername);
              return;
            }
          } catch (apiErr) {
            console.error('Agent search failed:', apiErr);
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
                    <button onClick={() => handleSelectAccount(acc)} className={`w-full flex items-center gap-5 p-5 rounded-3xl border transition-all text-left group animate-in slide-in-from-bottom-4 duration-500 pr-12 relative overflow-hidden ${theme === 'dark' ? 'bg-slate-900/40 border-white/5 hover:border-indigo-500/30' : 'bg-slate-50/50 border-slate-100 hover:border-indigo-200 hover:bg-white'}`} style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className={`w-14 h-14 rounded-2xl shadow-inner flex items-center justify-center text-xl font-bold group-hover:scale-105 transition-transform relative z-10 ${theme === 'dark' ? 'bg-slate-950 text-indigo-400' : 'bg-white text-indigo-600 border border-slate-100'}`}>
                        {acc.businessName ? acc.businessName.charAt(0).toUpperCase() : acc.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 relative z-10">
                        <p className={`text-[15px] font-bold truncate leading-tight mb-1 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{acc.businessName || acc.username}</p>
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">@{acc.username}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 relative z-10">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                      </div>
                    </button>
                    <button onClick={(e) => handleDeleteAccount(acc.username, e)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-400 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover/wrapper:opacity-100 shadow-md border border-slate-100 dark:border-white/5 z-20" title="Remove from recents">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <button onClick={handleGoToSignup} className={`py-5 rounded-3xl border-2 border-dashed font-bold text-[9px] uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98] ${theme === 'dark' ? 'border-slate-800 text-slate-400 hover:border-indigo-600 hover:text-indigo-400' : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'}`}>+ Register Node</button>
                <button onClick={handleGoToLogin} className={`py-5 rounded-3xl border-2 border-dashed font-bold text-[9px] uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98] ${theme === 'dark' ? 'border-slate-800 text-slate-400 hover:border-indigo-600 hover:text-indigo-400' : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'}`}>Manual Login</button>
              </div>
            </div>
          )}

          {/* OTP Verification Removed */}

          {/* ── FORGOT PASSWORD: ENTER EMAIL OR PHONE ── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotSend} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={handleGoToLogin} className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  Back to Login
                </button>
                <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Step 1 of 3</span>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Registered Email, Phone, or Username</label>
                <input type="text" className={inputCls} placeholder="Email, Phone, or Username" value={forgotIdentifier} onChange={e => setForgotIdentifier(e.target.value.toLowerCase().trim())} required />
              </div>
              <div className="pt-2">
                <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-lg shadow-indigo-500/50 active:scale-95 transition-all hover:shadow-indigo-500/70 hover:-translate-y-0.5">
                  {isLoading ? loadingText : 'Reset Password'}
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD: VERIFY OTP ── */}
          {view === 'forgot-otp' && (
            <form onSubmit={handleForgotOtpVerify} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={() => setView('forgot')} className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Step 2 of 3</span>
              </div>
              <div className={`p-4 rounded-2xl border text-[11px] font-bold text-center ${theme === 'dark' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                OTP has been sent to: <strong>{forgotIdentifier}</strong>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>6-Digit OTP</label>
                <input className={inputCls} placeholder="Enter OTP here" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} maxLength={6} required />
              </div>
              <div className="pt-2">
                <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-lg shadow-indigo-500/50 active:scale-95 transition-all hover:shadow-indigo-500/70 hover:-translate-y-0.5">
                  {isLoading ? loadingText : 'Verify OTP'}
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD: SET NEW PASSWORD ── */}
          {view === 'forgot-newpass' && (
            <form onSubmit={handleSetNewPassword} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">✅ OTP Verified</span>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Step 3 of 3</span>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>New Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} className={inputCls} placeholder="New password (min 4 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={4} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-500 transition-colors p-2">
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Confirm New Password</label>
                <div className="relative">
                  <input type={showConfirmPassword ? 'text' : 'password'} className={inputCls} placeholder="Enter password again" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-500 transition-colors p-2">
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-lg shadow-emerald-500/50 active:scale-95 transition-all hover:shadow-emerald-500/70 hover:-translate-y-0.5">
                  {isLoading ? loadingText : 'Update Password'}
                </button>
              </div>
            </form>
          )}

          {/* ── LOGIN & SIGNUP FORMS ── */}
          {(view === 'login' || view === 'signup') && (
            <form onSubmit={view === 'signup' ? handleSignUp : handleLogin} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={view === 'signup' ? handleGoToLogin : (accounts.length > 0 ? handleGoToRecent : onBack)} className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  {view === 'signup' ? 'Back to Login' : (accounts.length > 0 ? 'Back to Profiles' : 'Back')}
                </button>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500/50"></span>
                  </div>
                  <span className="text-[9px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">{view === 'signup' ? 'New Node' : 'Authorise Node'}</span>
                </div>
              </div>

              <div className="space-y-6">
                {view === 'signup' && (
                  <div className="space-y-2">
                    <label className={labelCls}>Business Name</label>
                    <input type="text" required className={inputCls} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. MahadNet" />
                  </div>
                )}

                {view === 'login' ? (
                  <div className="space-y-2">
                    <label className={labelCls}>Login ID (Email, Phone, or Username)</label>
                    <input required disabled={!!selectedAccount && view === 'login'} className={`${inputCls} ${(!!selectedAccount && view === 'login') ? 'opacity-40 cursor-not-allowed' : ''}`} value={username} onChange={e => setUsername(e.target.value.toLowerCase().trim())} placeholder="Enter your ID" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className={labelCls}>Phone Number</label>
                    <input required type="tel" className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 03001234567" />
                  </div>
                )}

                <div className="space-y-2">
                  <label className={labelCls}>Master Password</label>
                  <div className="relative group">
                    <input type={showPassword ? 'text' : 'password'} required className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors p-2">
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {view === 'signup' && (
                  <div className="space-y-2">
                    <label className={labelCls}>Confirm Master Password</label>
                    <div className="relative group">
                      <input type={showConfirmPassword ? 'text' : 'password'} required className={inputCls} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors p-2">
                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="rememberPassword" checked={rememberPassword} onChange={e => setRememberPassword(e.target.checked)} className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-600 cursor-pointer" />
                  <label htmlFor="rememberPassword" className="text-[10px] font-black text-slate-700 dark:text-slate-400 uppercase tracking-widest cursor-pointer select-none">Remember Me</label>
                </div>

                <div className="pt-2">
                  <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-lg shadow-indigo-500/50 active:scale-95 transition-all transform hover:shadow-indigo-500/70 hover:-translate-y-0.5">
                    {isLoading ? loadingText : (view === 'signup' ? 'Initialise Node' : 'Authorise Entry')}
                  </button>
                </div>

                {view === 'login' && (
                  <div className="space-y-3">
                    <button type="button" onClick={() => { resetFields(); setView('forgot'); }} className="w-full text-center text-[10px] font-black text-indigo-500 hover:text-indigo-400 uppercase tracking-widest transition-colors">
                      Forgot Password?
                    </button>

                    <button type="button" onClick={handleGoToSignup} className="w-full text-center text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest hover:text-indigo-500 transition-colors pt-1">
                      Don't have a node? Create one now
                    </button>
                  </div>
                )}

                {view === 'signup' && (
                  <div className="space-y-2">
                    <button type="button" onClick={handleGoToLogin} className="w-full text-center text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest hover:text-indigo-500 transition-colors">
                      Already have a node? Login
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        <p className="text-[9px] text-slate-700 dark:text-slate-300 font-bold text-center uppercase tracking-widest">
          {view === 'signup' ? 'Node encrypted using local storage hash' : 'Local node data remains strictly on this device'}
        </p>
      </div>

      {/* Support Message Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 ${theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100'}`}>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center text-2xl mx-auto">🎧</div>
              <h4 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Support Needed</h4>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Password recovery via SMS/Phone is currently unavailable. Please contact our support team to manually reset your account.</p>
              
              <div className="pt-2 flex flex-col gap-3">
                <a 
                  href="https://wa.me/923042773453?text=Hello,%20I%20need%20help%20resetting%20my%20password%20for%20myISP." 
                  target="_blank" rel="noopener noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-[#25D366]/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0a12 12 0 00-10.19 18.25L.037 24l5.962-1.55A11.942 11.942 0 0011.944 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zm6.342 17.202c-.288.814-1.42 1.488-2.203 1.583-.783.095-1.558.28-4.385-1.01-3.418-1.562-5.63-5.068-5.8-5.297-.17-.229-1.385-1.848-1.385-3.52 0-1.673.86-2.502 1.168-2.846.308-.344.67-.43.89-.43s.44 0 .633.01c.192.01.448-.076.7.534.252.61 1.092 2.65 1.188 2.846.095.196.16.425.02.653-.14.229-.21.37-.425.62-.215.25-.448.514-.64.715-.192.196-.394.412-.17.795.22.383.985 1.63 2.115 2.64 1.458 1.305 2.68 1.708 3.064 1.88.384.172.61.152.84-.112.23-.264.985-1.144 1.25-1.538.264-.394.528-.328.878-.196.35.132 2.215 1.042 2.59 1.232.375.19.625.286.715.446.09.16.09.936-.198 1.75z" /></svg>
                  Click to WhatsApp Support
                </a>
                <button onClick={() => setShowSupportModal(false)} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border transition-all active:scale-95 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 ${theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100'}`}>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center text-2xl mx-auto">⚠️</div>
              <h4 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Purge All Data?</h4>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">This will permanently remove all saved profiles and manager accounts from this device. This action cannot be undone.</p>
              <div className="pt-4 flex flex-col gap-3">
                <button onClick={handleClearAllAccounts} className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-500/20 active:scale-95 transition-all">Confirm Purge</button>
                <button onClick={() => setShowClearConfirm(false)} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border transition-all active:scale-95 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>Keep Data</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
