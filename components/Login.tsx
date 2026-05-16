
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
type ViewType = 'recent' | 'login' | 'signup' | 'otp' | 'forgot' | 'forgot-otp' | 'forgot-newpass';

const Login: React.FC<LoginProps> = ({ onLogin, onBack, theme, onToggleTheme }) => {
  const [accounts, setAccounts]               = useState<ManagerAccount[]>([]);
  const [view, setView]                         = useState<ViewType>('login');
  const [businessName, setBusinessName]         = useState('');
  const [username, setUsername]                 = useState('');
  const [email, setEmail]                       = useState('');
  const [password, setPassword]                 = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [showPassword, setShowPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError]                       = useState('');
  const [selectedAccount, setSelectedAccount]   = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isLoading, setIsLoading]               = useState(false);
  const [loadingText, setLoadingText]           = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);

  // OTP states
  const [emailOtp, setEmailOtp]                 = useState('');
  const [pendingSignupData, setPendingSignupData] = useState<{
    username: string; businessName: string; email: string; password: string;
  } | null>(null);

  // Forgot password states
  const [forgotEmail, setForgotEmail]           = useState('');
  const [forgotOtp, setForgotOtp]               = useState('');
  const [newPassword, setNewPassword]           = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    const loaded = getAccounts();
    setAccounts(loaded);
    setView(loaded.length > 0 ? 'recent' : 'login');
  }, []);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  // ─── LOGIN (Backward Compatible) ──────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setLoadingText('Authorising Node Access...');
    setError('');
    try {
      let { data, error: authError } = await supabase.auth.signInWithPassword({
        email: username.includes('@') ? username : `${username}@myisp.local`,
        password,
      });

      if (authError || !data?.user) {
        const localAccounts = getAccounts();
        const localFound = localAccounts.find(
          a => (a.username === username || a.email === username) && a.password === password
        );
        if (localFound) {
          const authEmail = localFound.email?.includes('@') ? localFound.email : `${localFound.username}@myisp.local`;
          const { error: signUpErr } = await supabase.auth.signUp({
            email: authEmail, password: localFound.password,
            options: { data: { full_name: localFound.businessName || localFound.username } }
          });
          if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) {
            throw new Error('Account migration failed: ' + signUpErr.message);
          }
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: authEmail, password: localFound.password
          });
          if (signInErr || !signInData?.user) throw new Error('Invalid username or password.');
          data = signInData;
          removeAccount(localFound.username);
        } else {
          throw new Error('Invalid username or password.');
        }
      }

      if (data?.user) {
        const loginUser = username.includes('@') ? username.split('@')[0] : username;
        setActiveSession(loginUser);
        writeLog({ username: loginUser, action: 'LOGIN', detail: navigator.userAgent.substring(0, 80) });
        if (rememberPassword) {
          saveAccount({
            username: loginUser, password,
            businessName: data.user.user_metadata?.full_name || loginUser,
            email: data.user.email || '', phone: '',
            createdAt: new Date().toISOString(), rememberPassword: true
          });
        }
        onLogin(loginUser);
      }
    } catch (err: any) {
      showError(err.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── SIGNUP STEP 1: Email diya → Email OTP bhejo ─────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4)   { showError('Password kam az kam 4 characters ka hona chahiye.'); return; }
    if (password !== confirmPassword) { showError('Passwords match nahi karte.'); return; }
    if (username === ADMIN_USERNAME || accounts.some(a => a.username === username)) {
      showError('Yeh Username/ID pehle se maujood hai.');
      return;
    }

    const hasRealEmail = email && email.includes('@') && !email.includes('@myisp.local');
    const authEmail    = hasRealEmail ? email : `${username}@myisp.local`;

    setIsLoading(true);
    setLoadingText('Initialising New Node...');
    setError('');

    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: authEmail, password,
        options: { data: { full_name: businessName || username, username } }
      });
      if (signUpErr) throw new Error(signUpErr.message);
      if (!signUpData.user) throw new Error('Signup failed. Dobara try karein.');

      if (hasRealEmail) {
        // Email diya → OTP verify step pe jao
        setPendingSignupData({ username, businessName: businessName || username, email: authEmail, password });
        setView('otp');
      } else {
        // Email nahi diya → seedha login
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (signInErr) throw new Error('Account ban gaya! Ab login karein.');
        saveAccount({ username, password, businessName: businessName || username, email: authEmail, phone: '', createdAt: new Date().toISOString(), rememberPassword });
        setAccounts(getAccounts());
        writeLog({ username, action: 'SIGNUP', detail: businessName });
        onLogin(username);
      }
    } catch (err: any) {
      showError('Registration Failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── SIGNUP STEP 2: Email OTP Verify ─────────────────────────────────
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSignupData) return;
    setIsLoading(true);
    setLoadingText('OTP verify ho raha hai...');
    setError('');
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: pendingSignupData.email, token: emailOtp, type: 'signup',
      });
      if (verifyErr) throw new Error('OTP galat hai ya expire ho gaya. Dobara check karein.');

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: pendingSignupData.email, password: pendingSignupData.password,
      });
      if (signInErr) throw new Error('Verification hua! Ab login karein.');

      saveAccount({
        username: pendingSignupData.username, password: pendingSignupData.password,
        businessName: pendingSignupData.businessName, email: pendingSignupData.email,
        phone: '', createdAt: new Date().toISOString(), rememberPassword: false
      });
      setAccounts(getAccounts());
      writeLog({ username: pendingSignupData.username, action: 'SIGNUP_VERIFIED', detail: 'Email OTP verified' });
      onLogin(pendingSignupData.username);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingSignupData) return;
    await supabase.auth.resend({ type: 'signup', email: pendingSignupData.email });
    setError('Success: OTP dobara bhej diya gaya! Email inbox check karein.');
  };

  // ─── FORGOT PASSWORD STEP 1: Email dalo, OTP bhejo ───────────────────
  const handleForgotSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoadingText('OTP bhej raha hai...');
    setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw new Error(error.message);
      setView('forgot-otp');
    } catch (err: any) {
      showError('OTP send nahi hua: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── FORGOT PASSWORD STEP 2: OTP Verify ──────────────────────────────
  const handleForgotOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoadingText('OTP verify ho raha hai...');
    setError('');
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: forgotEmail, token: forgotOtp, type: 'recovery',
      });
      if (error) throw new Error('OTP galat hai ya expire ho gaya.');
      setView('forgot-newpass');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── FORGOT PASSWORD STEP 3: Naya Password Set Karo ─────────────────
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) { showError('Passwords match nahi karte.'); return; }
    if (newPassword.length < 4)            { showError('Password kam az kam 4 characters ka hona chahiye.'); return; }
    setIsLoading(true);
    setLoadingText('Password update ho raha hai...');
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setError('Success: Password update ho gaya! Ab login karein.');
      setTimeout(() => { resetFields(); setView('login'); }, 2000);
    } catch (err: any) {
      showError('Password update nahi hua: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── UTILITY ──────────────────────────────────────────────────────────
  const resetFields = () => {
    setBusinessName(''); setUsername(''); setEmail('');
    setPassword(''); setConfirmPassword(''); setRememberPassword(false);
    setError(''); setEmailOtp(''); setForgotEmail(''); setForgotOtp('');
    setNewPassword(''); setConfirmNewPassword(''); setPendingSignupData(null);
  };

  const handleSelectAccount = (acc: ManagerAccount) => {
    setSelectedAccount(acc.username);
    setUsername(acc.username);
    if (acc.rememberPassword && acc.password) { setPassword(acc.password); setRememberPassword(true); }
    else { setPassword(''); setRememberPassword(false); }
    setView('login');
  };

  const handleGoToSignup  = () => { resetFields(); setView('signup'); };
  const handleGoToLogin   = () => { resetFields(); setSelectedAccount(null); setView('login'); };
  const handleGoToRecent  = () => { resetFields(); setSelectedAccount(null); setView('recent'); };

  const handleDeleteAccount = (u: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeAccount(u);
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

  const inputCls = `w-full px-6 py-5 rounded-2xl border-2 font-black outline-none transition-all duration-300 ${theme === 'dark' ? 'bg-[#030712] border-white/5 text-white focus:border-indigo-500/50 placeholder:text-slate-700' : 'bg-slate-50 border-slate-100 text-slate-900 focus:border-indigo-400 placeholder:text-slate-400'}`;
  const labelCls = "text-[10px] font-black text-slate-700 dark:text-slate-400 uppercase tracking-widest ml-1";

  const viewTitle: Record<ViewType, string> = {
    recent:          'Recent Profiles',
    login:           'Secure Manager Access',
    signup:          'Local Node Registration',
    otp:             'Verify Your Account',
    forgot:          'Password Recovery',
    'forgot-otp':    'Enter OTP',
    'forgot-newpass':'Set New Password',
  };

  return (
    <div className={`min-h-screen relative flex items-center justify-center p-6 overflow-hidden transition-colors duration-1000 ${theme === 'dark' ? 'bg-[#030712]' : 'bg-slate-50'}`}>

      {/* Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 dark:bg-indigo-500/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 dark:bg-violet-500/20 rounded-full blur-[120px] animate-pulse delay-700" />

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-50">
        <button onClick={onToggleTheme} className={`p-3 rounded-xl border transition-all shadow-sm flex items-center justify-center w-10 h-10 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-yellow-500 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          {theme === 'dark'
            ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
            : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          }
        </button>
      </div>

      <div className="w-full max-w-md relative z-10 space-y-8">

        {/* Logo */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-8 duration-700 relative">
          {onBack && (
            <button onClick={onBack} className="absolute left-0 top-0 p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
          )}
          <div className="flex justify-center mb-2">
            <img src={logoBase64} alt="MYISP Logo" className="w-[120px] md:w-[150px] h-auto object-contain" referrerPolicy="no-referrer" />
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-[0.4em] mt-2 text-center">
            {viewTitle[view]}
          </p>
        </div>

        {/* Card */}
        <div className={`relative rounded-[3rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8 duration-1000 ${theme === 'dark' ? 'bg-slate-900/80 border-white/5' : 'bg-white/90 border-slate-100'}`}>

          {isLoading && (
            <div className="absolute top-0 left-0 right-0 h-1 z-50 overflow-hidden bg-indigo-500/10">
              <div className="h-full bg-indigo-500 animate-[loading-bar_2s_infinite_linear] w-[30%] shadow-[0_0_10px_#6366f1]" />
            </div>
          )}

          {error && (
            <div className="px-8 pt-8">
              <div className={`p-4 border rounded-2xl text-[10px] font-black uppercase tracking-widest text-center ${error.startsWith('Success') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                {error}
              </div>
            </div>
          )}

          {/* ── RECENT ACCOUNTS ───────────────────────────────────────── */}
          {view === 'recent' && accounts.length > 0 && (
            <div className="p-10 space-y-6">
              <div className="flex justify-between items-center px-1">
                <div className="flex flex-col">
                  <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.2em]">Stored Profiles</h4>
                  <span className="text-[9px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full mt-1 w-fit">{accounts.length} Node{accounts.length !== 1 ? 's' : ''} Active</span>
                </div>
                <button onClick={() => setShowClearConfirm(true)} className="text-[9px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest bg-rose-500/5 px-3 py-1.5 rounded-xl border border-rose-500/10 transition-all hover:bg-rose-500/10">Clear All</button>
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-2">
                {accounts.map((acc, idx) => (
                  <div key={acc.username} className="relative group/wrapper">
                    <button onClick={() => handleSelectAccount(acc)} style={{ animationDelay: `${idx * 100}ms` }}
                      className={`w-full flex items-center gap-5 p-5 rounded-3xl border transition-all text-left group animate-in slide-in-from-bottom-4 duration-500 pr-12 relative overflow-hidden ${theme === 'dark' ? 'bg-slate-900/40 border-white/5 hover:border-indigo-500/30' : 'bg-slate-50/50 border-slate-100 hover:border-indigo-200 hover:bg-white'}`}>
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className={`w-14 h-14 rounded-2xl shadow-inner flex items-center justify-center text-xl font-black group-hover:scale-105 transition-transform relative z-10 ${theme === 'dark' ? 'bg-slate-950 text-indigo-400' : 'bg-white text-indigo-600 border border-slate-100'}`}>
                        {(acc.businessName || acc.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 relative z-10">
                        <p className={`text-[15px] font-black truncate leading-tight mb-1 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{acc.businessName || acc.username}</p>
                        <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">@{acc.username}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 relative z-10">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                      </div>
                    </button>
                    <button onClick={(e) => handleDeleteAccount(acc.username, e)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-400 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover/wrapper:opacity-100 shadow-md border border-slate-100 dark:border-white/5 z-20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <button onClick={handleGoToSignup} className={`py-5 rounded-3xl border-2 border-dashed font-black text-[9px] uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98] ${theme === 'dark' ? 'border-slate-800 text-slate-400 hover:border-indigo-600 hover:text-indigo-400' : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'}`}>+ Register Node</button>
                <button onClick={handleGoToLogin} className={`py-5 rounded-3xl border-2 border-dashed font-black text-[9px] uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98] ${theme === 'dark' ? 'border-slate-800 text-slate-400 hover:border-indigo-600 hover:text-indigo-400' : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'}`}>Manual Login</button>
              </div>
            </div>
          )}

          {/* ── EMAIL OTP VERIFY ──────────────────────────────────────── */}
          {view === 'otp' && (
            <form onSubmit={handleOtpVerify} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={() => setView('signup')} className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Step 2 of 2</span>
              </div>
              <div className={`p-4 rounded-2xl border text-[11px] font-bold text-center leading-relaxed ${theme === 'dark' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                📧 6-digit OTP bheja gaya hai:<br /><strong>{pendingSignupData?.email}</strong><br />
                <span className="text-[10px] opacity-70">Spam/Junk folder bhi check karein</span>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Email OTP (6-digit)</label>
                <input className={inputCls} placeholder="OTP yahan daalen" value={emailOtp}
                  onChange={e => setEmailOtp(e.target.value)} maxLength={6} inputMode="numeric" required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl shadow-indigo-500/20 active:scale-95 transition-all">
                {isLoading ? loadingText : 'Verify & Activate Account'}
              </button>
              <button type="button" onClick={handleResendOtp} className="w-full text-center text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest hover:text-indigo-500 transition-colors">
                OTP nahi mila? Resend karein
              </button>
            </form>
          )}

          {/* ── FORGOT: EMAIL ENTER ───────────────────────────────────── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotSend} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={handleGoToLogin} className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  Back to Login
                </button>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Step 1 of 3</span>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>📧 Registered Email Address</label>
                <input type="email" className={inputCls} placeholder="your@email.com"
                  value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl shadow-indigo-500/20 active:scale-95 transition-all">
                {isLoading ? loadingText : 'Send OTP'}
              </button>
            </form>
          )}

          {/* ── FORGOT: OTP VERIFY ───────────────────────────────────── */}
          {view === 'forgot-otp' && (
            <form onSubmit={handleForgotOtpVerify} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={() => setView('forgot')} className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Step 2 of 3</span>
              </div>
              <div className={`p-4 rounded-2xl border text-[11px] font-bold text-center leading-relaxed ${theme === 'dark' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                📧 OTP bheja gaya: <strong>{forgotEmail}</strong><br />
                <span className="text-[10px] opacity-70">Spam/Junk folder bhi check karein</span>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>6-Digit OTP</label>
                <input className={inputCls} placeholder="OTP yahan daalen" value={forgotOtp}
                  onChange={e => setForgotOtp(e.target.value)} maxLength={6} inputMode="numeric" required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl shadow-indigo-500/20 active:scale-95 transition-all">
                {isLoading ? loadingText : 'Verify OTP'}
              </button>
            </form>
          )}

          {/* ── FORGOT: NEW PASSWORD ──────────────────────────────────── */}
          {view === 'forgot-newpass' && (
            <form onSubmit={handleSetNewPassword} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">✅ OTP Verified</span>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Step 3 of 3</span>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Naya Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} className={inputCls} placeholder="Min 4 characters"
                    value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={4} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-500 transition-colors p-2">
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Confirm Password</label>
                <div className="relative">
                  <input type={showConfirmPassword ? 'text' : 'password'} className={inputCls} placeholder="Dobara daalen"
                    value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-500 transition-colors p-2">
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all">
                {isLoading ? loadingText : 'Update Password'}
              </button>
            </form>
          )}

          {/* ── LOGIN & SIGNUP ────────────────────────────────────────── */}
          {(view === 'login' || view === 'signup') && (
            <form onSubmit={view === 'signup' ? handleSignUp : handleLogin} className="p-10 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={view === 'signup' ? handleGoToLogin : (accounts.length > 0 ? handleGoToRecent : onBack)} className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 hover:-translate-x-1 transition-transform">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  {view === 'signup' ? 'Back to Login' : accounts.length > 0 ? 'Back to Profiles' : 'Back'}
                </button>
                <span className="text-[9px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                  {view === 'signup' ? 'New Node' : 'Authorise Node'}
                </span>
              </div>

              <div className="space-y-6">
                {/* Business Name - signup only */}
                {view === 'signup' && (
                  <div className="space-y-2">
                    <label className={labelCls}>Business Name</label>
                    <input type="text" className={inputCls} placeholder="e.g. MahadNet"
                      value={businessName} onChange={e => setBusinessName(e.target.value)} />
                  </div>
                )}

                {/* Username */}
                <div className="space-y-2">
                  <label className={labelCls}>Username / ID</label>
                  <input required disabled={!!selectedAccount && view === 'login'}
                    className={`${inputCls} ${(!!selectedAccount && view === 'login') ? 'opacity-40 cursor-not-allowed' : ''}`}
                    value={username} onChange={e => setUsername(e.target.value)} placeholder="Unique ID daalen" />
                </div>

                {/* Email - signup only (optional) */}
                {view === 'signup' && (
                  <div className="space-y-2">
                    <label className={labelCls}>
                      Email Address
                      <span className="ml-2 normal-case font-bold text-slate-400">(optional — OTP verification ke liye)</span>
                    </label>
                    <input type="email" className={inputCls} placeholder="your@email.com"
                      value={email} onChange={e => setEmail(e.target.value)} />
                    {email && (
                      <p className="text-[10px] text-indigo-400 font-bold ml-1">
                        ✉️ Email dene par account activate karne ke liye OTP aayega
                      </p>
                    )}
                  </div>
                )}

                {/* Password */}
                <div className="space-y-2">
                  <label className={labelCls}>Master Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} required className={inputCls}
                      value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors p-2">
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password - signup only */}
                {view === 'signup' && (
                  <div className="space-y-2">
                    <label className={labelCls}>Confirm Password</label>
                    <div className="relative">
                      <input type={showConfirmPassword ? 'text' : 'password'} required className={inputCls}
                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors p-2">
                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Remember Password */}
                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="rememberPassword" checked={rememberPassword}
                    onChange={e => setRememberPassword(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-600 cursor-pointer" />
                  <label htmlFor="rememberPassword" className="text-[10px] font-black text-slate-700 dark:text-slate-400 uppercase tracking-widest cursor-pointer select-none">
                    Save Password
                  </label>
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-3xl font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl shadow-indigo-500/20 active:scale-95 transition-all transform hover:-translate-y-1">
                    {isLoading ? loadingText : (view === 'signup' ? 'Initialise Node' : 'Authorise Entry')}
                  </button>
                </div>

                {/* Login extras */}
                {view === 'login' && (
                  <div className="space-y-3 pt-1">
                    <button type="button" onClick={() => { resetFields(); setView('forgot'); }}
                      className="w-full text-center text-[10px] font-black text-indigo-500 hover:text-indigo-400 uppercase tracking-widest transition-colors">
                      Forgot Password?
                    </button>
                    <button type="button" onClick={handleGoToSignup}
                      className="w-full text-center text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest hover:text-indigo-500 transition-colors">
                      Don't have a node? Create one now
                    </button>
                  </div>
                )}

                {/* Signup extras */}
                {view === 'signup' && (
                  <button type="button" onClick={handleGoToLogin}
                    className="w-full text-center text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest hover:text-indigo-500 transition-colors">
                    Already have a node? Login
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        <p className="text-[9px] text-slate-700 dark:text-slate-300 font-bold text-center uppercase tracking-widest">
          {view === 'signup' ? 'Node encrypted using local storage hash' : 'Local node data remains strictly on this device'}
        </p>
      </div>

      {/* Clear All Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 ${theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100'}`}>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center text-2xl mx-auto">⚠️</div>
              <h4 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Purge All Data?</h4>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">This will permanently remove all saved profiles from this device.</p>
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
