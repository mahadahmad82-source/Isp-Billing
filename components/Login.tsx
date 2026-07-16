
import React, { useState, useEffect } from 'react';
import { ManagerAccount } from '../types';
import { getAccounts, saveAccount, setActiveSession, clearAllAccounts, removeAccount, writeLog } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { logoBase64 } from '../utils/logoBase64';
import ThreeBackground from './landing/ThreeBackground';
import LanguageToggle from './LanguageToggle';
import { Language, getStoredLanguage, setStoredLanguage } from '../utils/i18n';

interface LoginProps {
  onLogin: (username: string) => void;
  onBack?: () => void;
}

const ADMIN_USERNAME = 'admin';
type ViewType = 'recent' | 'login' | 'signup' | 'otp' | 'forgot' | 'forgot-otp' | 'forgot-newpass' | 'agentLogin';

// ── Icons (outside component to prevent re-render remounting) ──
const EyeIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>);
const EyeOffIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>);
const UserIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>);
const LockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>);
const PhoneIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" /></svg>);
const BriefcaseIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>);
const MailIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>);

// ── Input with left icon (outside component to prevent keyboard dismiss on re-render) ──
const InputField = ({ icon, type = 'text', placeholder, value, onChange, disabled, rightElement }: { icon: React.ReactNode; type?: string; placeholder: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; rightElement?: React.ReactNode }) => (
  <div className={`flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all duration-300 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(99,102,241,0.18)' }}>
    <span className="text-indigo-400 flex-shrink-0">{icon}</span>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="flex-1 bg-transparent text-white text-sm font-medium placeholder:text-slate-500 outline-none min-w-0"
      style={{ caretColor: '#818cf8' }}
    />
    {rightElement && <span className="flex-shrink-0 text-slate-400">{rightElement}</span>}
  </div>
);

const Login: React.FC<LoginProps> = ({ onLogin, onBack }) => {
  const [accounts, setAccounts] = useState<ManagerAccount[]>([]);
  const [view, setView] = useState<ViewType>('login');
  const [language, setLanguage] = useState<Language>(getStoredLanguage());
  const handleLanguageChange = (lang: Language) => { setLanguage(lang); setStoredLanguage(lang); };

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

  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);
    setView(loadedAccounts.length > 0 ? 'recent' : 'login');
  }, []);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const finishLogin = async (finalUsername: string) => {
    onLogin(finalUsername);
  };

  // Core login logic, parameterised so any caller with a known username+password
  // pair can share it. Parameter names intentionally shadow the component's
  // username/password state so the body below is untouched.
  const doLogin = async (username: string, password: string): Promise<boolean> => {
    if (isLoading) return false;
    setIsLoading(true); setLoadingText('Authorising...'); setError('');
    try {
      const localAccounts = getAccounts();
      const localFound = localAccounts.find(a => (a.username === username || a.email === username || a.phone === username) && a.password === password);
      if (localFound && localFound.role === 'admin') {
        // Admin actions (delete/reset manager) require a live Supabase Auth
        // session (auth.uid()) server-side — this shortcut used to skip real
        // auth entirely, silently breaking those RPCs. Re-authenticate in the
        // background; don't block the (already-trusted) local login on it.
        try {
          const authEmail = localFound.username.includes('@') ? localFound.username : `${localFound.username}@myisp.local`;
          await supabase.auth.signInWithPassword({ email: authEmail, password });
        } catch { /* fall through — local session still proceeds */ }
        setActiveSession(localFound.username); finishLogin(localFound.username); return true;
      }
      let identifier = username;
      const authEmail = identifier.includes('@') ? identifier : `${identifier}@myisp.local`;
      let { data, error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if ((authError || !data?.user) && !identifier.includes('@')) {
        // This username may be registered with a real recovery email instead
        // of the synthetic one (set at signup for email-OTP password reset).
        try {
          const { data: resolvedEmail } = await supabase.rpc('resolve_login_email', { p_identifier: identifier });
          if (resolvedEmail && resolvedEmail !== authEmail) {
            const retry = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
            if (!retry.error && retry.data?.user) { data = retry.data; authError = null; }
          }
        } catch { /* fall through to existing fallback chain below */ }
      }
      if (authError || !data?.user) {
        if (localFound) {
          const fallbackEmail = localFound.email && localFound.email.includes('@') ? localFound.email : `${localFound.username}@myisp.local`;
          try {
            const { error: signUpErr } = await supabase.auth.signUp({ email: fallbackEmail, password: localFound.password, options: { data: { full_name: localFound.businessName || localFound.username, phone: localFound.phone || '', is_migrated: true } } });
            if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) console.warn('Migration warning: ' + signUpErr.message);
            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: fallbackEmail, password: localFound.password });
            if (signInData?.user) { data = signInData; authError = null; removeAccount(localFound.username); }
            else { setActiveSession(localFound.username); finishLogin(localFound.username); return true; }
          } catch { setActiveSession(localFound.username); finishLogin(localFound.username); return true; }
        } else {
          setLoadingText('Searching Remote Nodes...');
          try {
            // Server-side scoped lookup (RPC) — no longer pulls every manager's
            // full data (including every other agent's plaintext password) to the browser.
            const { data: match, error: searchErr } = await supabase.rpc('find_sub_manager_login', {
              p_identifier: username,
              p_password: password,
            });
            if (!searchErr && match?.agent) {
              const agent = match.agent;
              const agentUsername = agent.username;
              setActiveSession(agentUsername);
              saveAccount({ username: agentUsername, password, businessName: agent.name, email: agent.email || '', phone: agent.phone || '', role: 'sub-manager', managerUsername: match.manager_id, createdAt: new Date().toISOString(), rememberPassword: true });
              finishLogin(agentUsername); return true;
            }
          } catch (searchEx) { console.error('[Auth] Agent search failed:', searchEx); }
          throw new Error('Invalid username or password.');
        }
      }
      if (data.user) {
        const loginUser = username.includes('@') ? username.split('@')[0] : username;
        // Backfill profiles.username if missing (covers pre-existing accounts and
        // the localStorage→Supabase migration path above) — required for
        // manager_own_data_full_access RLS to recognize this session as the owner.
        await supabase.from('profiles').update({ username: loginUser }).eq('id', data.user.id).is('username', null);
        const { data: profileData } = await supabase.from('profiles').select('role, manager_id, full_name').eq('id', data.user.id).maybeSingle();
        const role = profileData?.role || 'manager';
        setActiveSession(loginUser);
        if (rememberPassword) saveAccount({ username: loginUser, password, businessName: profileData?.full_name || data.user.user_metadata?.full_name || loginUser, email: data.user.email || '', phone: data.user.user_metadata?.phone || '', role: role as 'admin' | 'manager' | 'sub-manager', managerUsername: profileData?.manager_id || '', createdAt: new Date().toISOString(), rememberPassword: true });
        finishLogin(loginUser); return true;
      }
      throw new Error('Authentication failed.');
    } catch (err: any) { showError(err.message || 'Authentication error occurred'); return false; }
    finally { setIsLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(username, password);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) { showError('Password must be at least 4 characters.'); return; }
    if (password !== confirmPassword) { showError('Passwords do not match.'); return; }
    if (phone === ADMIN_USERNAME || accounts.some(a => a.username === phone || a.phone === phone)) { showError('This Phone Number is already taken.'); return; }
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && (!trimmedEmail.includes('@') || trimmedEmail.endsWith('@myisp.local'))) { showError('Please enter a valid email address.'); return; }
    setIsLoading(true); setLoadingText('Initialising New Node...'); setError('');
    try {
      // Use the real email (if given) as the actual login/auth email — this is
      // what makes email-OTP "Forgot Password" work later. Without one, we fall
      // back to the synthetic phone@myisp.local identifier as before (in which
      // case password recovery isn't possible via email — only admin reset).
      const hasRealEmail = !!trimmedEmail;
      const authEmail = hasRealEmail ? trimmedEmail : `${phone}@myisp.local`;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email: authEmail, password, options: { data: { full_name: businessName || phone, phone } } });
      if (signUpErr && signUpErr.message.toLowerCase().includes('already registered')) { showError(hasRealEmail ? 'This email is already registered.' : 'This Phone Number is already registered.'); return; }
      if (signUpErr) throw new Error(signUpErr.message);
      if (!signUpData.user) throw new Error('Signup failed. Try again.');
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (signInErr) throw new Error('Account created! Please login manually.');
      // profiles.username is required for RLS-scoped manager_data access but is
      // never set by the signup trigger — set it now so dual-save works immediately.
      await supabase.from('profiles').update({ username: phone, full_name: businessName || phone }).eq('id', signUpData.user.id);
      const newAccount: ManagerAccount = { username: phone, password, businessName: businessName || phone, email: authEmail, phone, createdAt: new Date().toISOString(), rememberPassword };
      saveAccount(newAccount); setAccounts(getAccounts());
      writeLog({ username: phone, action: 'SIGNUP', detail: `New account: ${businessName}` });
      onLogin(phone);
    } catch (err: any) { showError(`Registration Failed: ${err.message}`); }
    finally { setIsLoading(false); }
  };

  const handleForgotSend = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    let targetEmail = forgotIdentifier;
    if (!targetEmail.includes('@')) {
      // Entered a username instead of an email — resolve their registered email.
      try {
        const { data: resolved } = await supabase.rpc('resolve_login_email', { p_identifier: targetEmail });
        targetEmail = resolved || '';
      } catch { targetEmail = ''; }
    }
    if (!targetEmail || targetEmail.endsWith('@myisp.local')) { setShowSupportModal(true); return; }
    setIsLoading(true); setLoadingText('Sending OTP...');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail);
      if (error) throw new Error(error.message);
      setForgotIdentifier(targetEmail); // so the OTP-verify step targets the right email
      setView('forgot-otp');
    } catch (err: any) { showError(err.message === 'Failed to fetch' ? 'Network error. Contact support.' : 'OTP send failed: ' + err.message); }
    finally { setIsLoading(false); }
  };

  const handleForgotOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setLoadingText('Verifying OTP...'); setError('');
    try {
      const { error } = await supabase.auth.verifyOtp({ email: forgotIdentifier, token: forgotOtp, type: 'recovery' });
      if (error) throw new Error('Invalid OTP or it has expired.');
      setView('forgot-newpass');
    } catch (err: any) { showError(err.message); }
    finally { setIsLoading(false); }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) { showError('Passwords do not match.'); return; }
    if (newPassword.length < 4) { showError('Password must be at least 4 characters.'); return; }
    setIsLoading(true); setLoadingText('Updating password...'); setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setError('Success: Password updated! You can now login.');
      setTimeout(() => { resetFields(); setView('login'); }, 2000);
    } catch (err: any) { showError('Password update failed: ' + err.message); }
    finally { setIsLoading(false); }
  };

  const handleSelectAccount = (acc: ManagerAccount) => {
    setSelectedAccount(acc.username); setUsername(acc.username);
    if (acc.rememberPassword && acc.password) { setPassword(acc.password); setRememberPassword(true); }
    else { setPassword(''); setRememberPassword(false); }
    setView('login');
  };

  const resetFields = () => {
    setBusinessName(''); setUsername(''); setEmail(''); setPhone('');
    setPassword(''); setConfirmPassword(''); setRememberPassword(false); setError('');
    setForgotIdentifier(''); setForgotOtp(''); setNewPassword(''); setConfirmNewPassword('');
  };

  const handleGoToSignup = () => { resetFields(); setView('signup'); };
  const handleGoToLogin = () => { resetFields(); setSelectedAccount(null); setView('login'); };
  const handleGoToRecent = () => { resetFields(); setSelectedAccount(null); setView('recent'); };

  const handleDeleteAccount = (usernameToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation(); removeAccount(usernameToDelete);
    const updated = getAccounts(); setAccounts(updated);
    if (updated.length === 0) setView('login');
  };

  const handleClearAllAccounts = () => { clearAllAccounts(); setAccounts([]); setSelectedAccount(null); setView('signup'); setShowClearConfirm(false); };

  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block";

  // ── Card heading based on view ──
  const getHeading = () => {
    if (view === 'signup') return { title: 'Create Account', sub: 'Register your new ISP node' };
    if (view === 'recent') return { title: 'Welcome Back!', sub: 'Select your profile to continue' };
    if (view === 'forgot') return { title: 'Reset Password', sub: 'Enter your username or recovery email' };
    if (view === 'forgot-otp') return { title: 'Verify OTP', sub: 'Enter the code sent to you' };
    if (view === 'forgot-newpass') return { title: 'New Password', sub: 'Set a strong new password' };
    return { title: 'Welcome Back!', sub: 'Login to continue to your account' };
  };

  const heading = getHeading();

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#020617]">

      {/* Three.js Background */}
      <div className="absolute inset-0 z-0"><ThreeBackground isDark={true} /></div>
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 0%, rgba(2,6,23,0.35) 100%)' }} />

      <div className="absolute top-4 right-4 z-[20]">
        <LanguageToggle language={language} onChange={handleLanguageChange} variant="pill" />
      </div>

      <div className="w-full max-w-sm relative z-[10]">

        {/* Logo */}
        <div className="text-center mb-6 animate-in fade-in slide-in-from-top-6 duration-700 relative">
          {onBack && (
            <button onClick={onBack} className="absolute left-0 top-0 p-2 text-slate-400 hover:text-indigo-400 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
          )}
          {logoBase64 && <img src={logoBase64} alt="Bill Collector Logo" className="w-[135px] h-auto object-contain mx-auto" />}
        </div>

        {/* Main Card */}
        <div
          className="relative rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-1000"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
          }}
        >

          {/* Loading bar */}
          {isLoading && (
            <div className="absolute top-0 left-0 right-0 h-[2px] z-50 overflow-hidden bg-indigo-500/10">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 animate-[loading-bar_2s_infinite_linear] w-[30%]"></div>
            </div>
          )}

          <div className="p-8">

            {/* Card Header */}
            <div className="text-center mb-7">
              <h2 className="text-2xl font-black text-white tracking-tight mb-1">{heading.title}</h2>
              <p className="text-xs text-slate-400 font-medium">{heading.sub}</p>
            </div>

            {/* Error */}
            {error && (
              <div className={`mb-5 p-3.5 border rounded-xl text-[11px] font-bold uppercase tracking-widest text-center ${error.startsWith('Success') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                {error}
              </div>
            )}

            {/* ── RECENT ACCOUNTS ── */}
            {view === 'recent' && accounts.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{accounts.length} Node{accounts.length !== 1 ? 's' : ''} Saved</span>
                  <button onClick={() => setShowClearConfirm(true)} className="text-[9px] font-bold text-rose-400 hover:text-rose-300 uppercase tracking-widest bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-all">Clear All</button>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {accounts.map((acc, idx) => (
                    <div key={acc.username} className="relative group/wrapper">
                      <button onClick={() => handleSelectAccount(acc)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left pr-10"
                        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(99,102,241,0.18)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.18)'; }}>
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-black text-indigo-300 flex-shrink-0"
                          style={{ background: 'rgba(99,102,241,0.15)' }}>
                          {(acc.businessName || acc.username).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{acc.businessName || acc.username}</p>
                          <p className="text-[10px] text-slate-400 font-medium">@{acc.username}</p>
                        </div>
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <button onClick={(e) => handleDeleteAccount(acc.username, e)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover/wrapper:opacity-100 transition-all text-slate-500 hover:text-rose-400 hover:bg-rose-500/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button onClick={handleGoToSignup} className="py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-300 transition-all" style={{ border: '1.5px dashed rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.05)' }}>+ Register Node</button>
                  <button onClick={handleGoToLogin} className="py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-300 transition-all" style={{ border: '1.5px dashed rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.05)' }}>Manual Login</button>
                </div>
              </div>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {view === 'forgot' && (
              <form onSubmit={handleForgotSend} className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={handleGoToLogin} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-indigo-400 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>Back
                  </button>
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Step 1 / 3</span>
                </div>
                <div>
                  <label className={labelCls}>Email / Phone / Username</label>
                  <InputField icon={<MailIcon />} placeholder="Username or email" value={forgotIdentifier} onChange={e => setForgotIdentifier(e.target.value.toLowerCase().trim())} />
                </div>
                <button type="submit" disabled={isLoading} className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] text-white transition-all active:scale-95 hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
                  {isLoading ? loadingText : 'Send Reset Link'}
                </button>
              </form>
            )}

            {/* ── FORGOT OTP ── */}
            {view === 'forgot-otp' && (
              <form onSubmit={handleForgotOtpVerify} className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={() => setView('forgot')} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-indigo-400 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>Back
                  </button>
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Step 2 / 3</span>
                </div>
                <div className="p-3.5 rounded-xl text-[11px] font-bold text-center text-indigo-300" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  OTP sent to: <strong>{forgotIdentifier}</strong>
                </div>
                <div>
                  <label className={labelCls}>6-Digit OTP</label>
                  <InputField icon={<LockIcon />} placeholder="Enter OTP" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} />
                </div>
                <button type="submit" disabled={isLoading} className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] text-white transition-all active:scale-95 hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
                  {isLoading ? loadingText : 'Verify OTP'}
                </button>
              </form>
            )}

            {/* ── NEW PASSWORD ── */}
            {view === 'forgot-newpass' && (
              <form onSubmit={handleSetNewPassword} className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">✅ OTP Verified</span>
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Step 3 / 3</span>
                </div>
                <div>
                  <label className={labelCls}>New Password</label>
                  <InputField icon={<LockIcon />} type={showPassword ? 'text' : 'password'} placeholder="Min 4 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    rightElement={<button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-indigo-400 transition-colors p-1">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>} />
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <InputField icon={<LockIcon />} type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)}
                    rightElement={<button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-slate-400 hover:text-indigo-400 transition-colors p-1">{showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}</button>} />
                </div>
                <button type="submit" disabled={isLoading} className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] text-white transition-all active:scale-95 hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #059669, #0d9488)', boxShadow: '0 8px 32px rgba(16,185,129,0.3)' }}>
                  {isLoading ? loadingText : 'Update Password'}
                </button>
              </form>
            )}

            {/* ── LOGIN & SIGNUP ── */}
            {(view === 'login' || view === 'signup') && (
              <form onSubmit={view === 'signup' ? handleSignUp : handleLogin} className="space-y-4">

                {/* Back nav */}
                <div className="flex items-center justify-between mb-1">
                  <button type="button" onClick={view === 'signup' ? handleGoToLogin : (accounts.length > 0 ? handleGoToRecent : onBack)} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-indigo-400 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                    {view === 'signup' ? 'Back' : accounts.length > 0 ? 'Profiles' : 'Back'}
                  </button>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{view === 'signup' ? 'New Node' : 'Secure Access'}</span>
                </div>

                {/* Business Name (signup only) */}
                {view === 'signup' && (
                  <div>
                    <label className={labelCls}>Business Name</label>
                    <InputField icon={<BriefcaseIcon />} placeholder="e.g. MahadNet" value={businessName} onChange={e => setBusinessName(e.target.value)} />
                  </div>
                )}

                {/* Username / Phone */}
                {view === 'login' ? (
                  <div>
                    <label className={labelCls}>Login ID (Email, Phone, or Username)</label>
                    <InputField icon={<UserIcon />} placeholder="Enter your ID" value={username} onChange={e => setUsername(e.target.value.toLowerCase().trim())} disabled={!!selectedAccount} />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Phone Number</label>
                    <InputField icon={<PhoneIcon />} type="tel" placeholder="e.g. 03001234567" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                )}

                {/* Recovery Email (signup only, optional) */}
                {view === 'signup' && (
                  <div>
                    <label className={labelCls}>Email (optional)</label>
                    <InputField icon={<MailIcon />} type="email" placeholder="For password recovery" value={email} onChange={e => setEmail(e.target.value)} />
                    <p className="text-[9px] text-slate-500 ml-1 mt-1">Add this so you can reset your password via OTP if you forget it.</p>
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className={labelCls}>Master Password</label>
                  <InputField icon={<LockIcon />} type={showPassword ? 'text' : 'password'} placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)}
                    rightElement={<button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-indigo-400 transition-colors p-1">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>} />
                </div>

                {/* Confirm Password (signup only) */}
                {view === 'signup' && (
                  <div>
                    <label className={labelCls}>Confirm Password</label>
                    <InputField icon={<LockIcon />} type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      rightElement={<button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-slate-400 hover:text-indigo-400 transition-colors p-1">{showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}</button>} />
                  </div>
                )}

                {/* Remember Me + Forgot */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={rememberPassword} onChange={e => setRememberPassword(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 bg-white/10 border-white/20 focus:ring-indigo-500 cursor-pointer" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Remember Me</span>
                  </label>
                  {view === 'login' && (
                    <button type="button" onClick={() => { resetFields(); setView('forgot'); }} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider transition-colors">
                      Forgot Password?
                    </button>
                  )}
                </div>

                {/* Submit Button */}
                <button type="submit" disabled={isLoading}
                  className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] text-white transition-all active:scale-95 hover:-translate-y-0.5 mt-2"
                  style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)', boxShadow: '0 8px 32px rgba(99,102,241,0.45)' }}>
                  {isLoading ? loadingText : (view === 'signup' ? 'Create Node' : 'Login')}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
                  <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{view === 'signup' ? 'already have a node?' : "don't have an account?"}</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
                </div>

                {view === 'login' ? (
                  <button type="button" onClick={handleGoToSignup} className="w-full text-center text-[11px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">
                    Sign Up
                  </button>
                ) : (
                  <button type="button" onClick={handleGoToLogin} className="w-full text-center text-[11px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">
                    Login
                  </button>
                )}
              </form>
            )}

          </div>
        </div>

        <p className="text-[9px] text-slate-600 font-bold text-center uppercase tracking-widest mt-5">
          Local node data remains strictly on this device
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <a href="/terms" className="text-[9px] text-slate-600 hover:text-indigo-400 font-black uppercase tracking-widest transition-colors">Terms & Policies</a>
          <span className="text-slate-700 text-[9px]">·</span>
          <span className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Bill Collector v2.0</span>
        </div>
      </div>

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 bg-slate-900 border-white/5">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center text-2xl mx-auto">🎧</div>
              <h4 className="text-xl font-black uppercase tracking-tight text-white">Support Needed</h4>
              <p className="text-xs font-bold text-slate-400">No recovery email is on file for this account, so we can't send an OTP. Please contact our support team to manually reset your password.</p>
              <div className="pt-2 flex flex-col gap-3">
                <a href="https://wa.me/923042773453?text=Hello,%20I%20need%20help%20resetting%20my%20password%20for%20myISP." target="_blank" rel="noopener noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0a12 12 0 00-10.19 18.25L.037 24l5.962-1.55A11.942 11.942 0 0011.944 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zm6.342 17.202c-.288.814-1.42 1.488-2.203 1.583-.783.095-1.558.28-4.385-1.01-3.418-1.562-5.63-5.068-5.8-5.297-.17-.229-1.385-1.848-1.385-3.52 0-1.673.86-2.502 1.168-2.846.308-.344.67-.43.89-.43s.44 0 .633.01c.192.01.448-.076.7.534.252.61 1.092 2.65 1.188 2.846.095.196.16.425.02.653-.14.229-.21.37-.425.62-.215.25-.448.514-.64.715-.192.196-.394.412-.17.795.22.383.985 1.63 2.115 2.64 1.458 1.305 2.68 1.708 3.064 1.88.384.172.61.152.84-.112.23-.264.985-1.144 1.25-1.538.264-.394.528-.328.878-.196.35.132 2.215 1.042 2.59 1.232.375.19.625.286.715.446.09.16.09.936-.198 1.75z" /></svg>
                  WhatsApp Support
                </a>
                <button onClick={() => setShowSupportModal(false)} className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border transition-all active:scale-95 bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 bg-slate-900 border-white/5">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center text-2xl mx-auto">⚠️</div>
              <h4 className="text-xl font-black uppercase tracking-tight text-white">Purge All Data?</h4>
              <p className="text-xs font-bold text-slate-400">This will permanently remove all saved profiles from this device. This action cannot be undone.</p>
              <div className="pt-4 flex flex-col gap-3">
                <button onClick={handleClearAllAccounts} className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all">Confirm Purge</button>
                <button onClick={() => setShowClearConfirm(false)} className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border transition-all active:scale-95 bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700">Keep Data</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
