
import React, { useState, useEffect } from 'react';
import { ManagerAccount } from '../types';
import type { BusinessType } from '../types';
import { BUSINESS_TYPE_LABELS } from '../utils/businessType';
import BusinessTypePicker from './auth/BusinessTypePicker';
import { getAccounts, saveAccount, setActiveSession, clearAllAccounts, removeAccount, writeLog } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { uploadMediaToR2 } from '../utils/whatsapp';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';
import LanguageToggle from './LanguageToggle';
import { Language, getStoredLanguage, setStoredLanguage } from '../utils/i18n';
import { fetchPricingPlans, DEFAULT_ISP_PLANS, WHATSAPP_BOT_PLANS, ensureWhatsAppBotPlan, type PricingPlan } from '../utils/pricing';

interface LoginProps {
  onLogin: (username: string) => void;
  onBack?: () => void;
}

const ADMIN_USERNAME = 'admin';
type ViewType = 'recent' | 'login' | 'signup' | 'signup-business-type' | 'signup-otp' | 'signup-tier' | 'signup-netbot' | 'otp' | 'forgot' | 'forgot-otp' | 'forgot-newpass' | 'agentLogin';

// ── Icons (outside component to prevent re-render remounting) ──
const EyeIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>);
const EyeOffIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>);
const UserIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>);
const LockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>);
const PhoneIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" /></svg>);
const BriefcaseIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>);
const MailIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>);

// ── Floating decoration icons (Mahadnet midnight glass aesthetic) ──
const WifiIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M2 8.82a15 15 0 0 1 20 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>);
const ReceiptIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></svg>);
const WhatsAppIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>);
const ZapIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>);
const GlobeIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>);
const CpuIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" /></svg>);

// ── Input with left icon (outside component to prevent keyboard dismiss on re-render) ──
const InputField = ({ icon, type = 'text', placeholder, value, onChange, disabled, rightElement, maxLength, onBlur }: { icon: React.ReactNode; type?: string; placeholder: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; rightElement?: React.ReactNode; maxLength?: number; onBlur?: () => void }) => (
  <div className={`flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all duration-300 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(99,102,241,0.18)' }}>
    <span className="text-indigo-400 flex-shrink-0">{icon}</span>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      maxLength={maxLength}
      className="flex-1 bg-transparent text-slate-900 text-sm font-medium placeholder:text-slate-400 outline-none min-w-0"
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
  // Signup-only: the chosen manager username (login ID). Phone is stored separately now.
  const [signupUsername, setSignupUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'' | 'checking' | 'ok' | 'taken' | 'invalid'>('');
  const [cnic, setCnic] = useState('');
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
  const [signupOtp, setSignupOtp] = useState('');
  const [signupBusinessType, setSignupBusinessType] = useState<BusinessType | null>(null);
  const [tierPaymentPending, setTierPaymentPending] = useState<{ tier: string; label: string } | null>(null);
  // BUG FIX: these were added earlier this session but lost when a later
  // full-file JSX edit was based on a stale raw.githubusercontent.com fetch
  // (CDN-cached, not the authoritative GitHub state) instead of the GitHub
  // Contents API — the exact failure mode our own rules warn about. Restored
  // here via the Contents API this time.
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [tierBusy, setTierBusy] = useState(false);
  const [pendingSignupEmail, setPendingSignupEmail] = useState('');
  // Same Supabase site_settings.pricing_plans row LandingPage.tsx reads —
  // keeps this screen's tiers/prices in sync with whatever is currently
  // live on the public landing page (never a separately-maintained copy).
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>(ensureWhatsAppBotPlan(DEFAULT_ISP_PLANS));

  useEffect(() => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);
    setView(loadedAccounts.length > 0 ? 'recent' : 'login');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const plans = await fetchPricingPlans();
      if (!cancelled) setPricingPlans(plans);
    })();
    return () => { cancelled = true; };
  }, []);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  // supabase-js rpc() never throws on server errors — it returns { data, error }.
  // Normalizes all failure shapes (Postgres-level error, or an { ok:false } /
  // { success:false } JSON payload from the RPC itself) into one message, or
  // null on success.
  const rpcErrorMessage = (data: any, error: any): string | null => {
    if (error) return error.message || 'Server error';
    if (data && typeof data === 'object' && ((data as any).ok === false || (data as any).success === false)) {
      return (data as any).error || 'Server error';
    }
    return null;
  };

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
      // Brute-force protection: block further attempts once an identifier
      // has failed too many times in the last 15 minutes. Fails open (does
      // not block) if the RPC itself errors, so this can never lock out
      // real logins due to a network/RPC hiccup.
      try {
        const { data: rl } = await supabase.rpc('check_login_rate_limit', { p_identifier: username.trim() });
        if (rl && rl.allowed === false) {
          const mins = Math.ceil((rl.retry_after_seconds || 60) / 60);
          throw new Error(`Too many login attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
        }
      } catch (rlErr: any) {
        if (rlErr?.message?.startsWith('Too many login attempts')) throw rlErr;
        // any other rate-limit check failure: fail open, proceed to normal auth
      }
      const localAccounts = getAccounts();
      const localFound = localAccounts.find(a => (a.username === username || a.email === username || a.phone === username) && a.password === password);
      if (localFound && localFound.role === 'admin') {
        // Admin actions (delete/reset manager, dashboard stats) require a live
        // Supabase Auth session (auth.uid()) server-side. This shortcut used to
        // swallow a failed re-auth and proceed anyway — leaving the UI "logged
        // in" with zero real session, which is why the admin dashboard showed
        // 0 managers / 0 customers with no error. Now we verify the session
        // actually came up before trusting the shortcut; otherwise fall
        // through to the full auth flow below (which retries properly).
        const authEmail = localFound.username.includes('@') ? localFound.username : `${localFound.username}@myisp.local`;
        let sessionOk = false;
        try {
          const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
          sessionOk = !authErr && !!authData?.session;
        } catch { sessionOk = false; }
        if (sessionOk) { setActiveSession(localFound.username); finishLogin(localFound.username); return true; }
        console.warn('[Auth] Admin quick-login session failed — falling back to full login flow');
      }
      let identifier = username.trim();

      // Phase 1 real-auth agent path. Legacy find_sub_manager_login remains
      // below as the fallback for agents not migrated yet.
      const findRealSubManager = async (lookup: string) => {
        try {
          const column = lookup.includes('@') ? 'email' : 'username';
          const { data: agent } = await supabase
            .from('sub_managers')
            .select('auth_user_id, manager_id, username, name, email, contact')
            .eq(column, lookup.trim().toLowerCase())
            .maybeSingle();
          if (!agent?.auth_user_id) return null;
          const authEmail = agent.email || `agent.${agent.manager_id}.${agent.username}@myisp.local`;
          const { data: agentAuth, error: agentAuthError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
          if (agentAuthError || !agentAuth?.user || agentAuth.user.id !== agent.auth_user_id) {
            if (agentAuth?.user) await supabase.auth.signOut({ scope: 'local' });
            return null;
          }
          return { agent, user: agentAuth.user };
        } catch { return null; }
      };

      const realAgentLogin = await findRealSubManager(identifier);
      if (realAgentLogin) {
        const agent = realAgentLogin.agent;
        const agentUsername = agent.username;
        setActiveSession(agentUsername);
        saveAccount({ username: agentUsername, password: '', businessName: agent.name || agentUsername, email: agent.email || '', phone: agent.contact || '', role: 'sub-manager', managerUsername: agent.manager_id, createdAt: new Date().toISOString(), rememberPassword: false, authUserId: agent.auth_user_id });
        finishLogin(agentUsername); return true;
      }

      const authEmail = identifier.includes('@') ? identifier : `${identifier}@myisp.local`;
      let { data, error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      // Was the session resolved via a different identifier than what the person
      // typed (real recovery email, or now CNIC)? If so `identifier` itself is
      // NOT their actual username — it must be re-derived from their profile
      // below instead of reused as-is, or RLS (which matches on the real
      // profiles.username) would silently break for CNIC-based logins.
      let resolvedViaLookup = false;
      if ((authError || !data?.user) && !identifier.includes('@')) {
        // This username/CNIC may be registered with a real recovery email
        // instead of the synthetic one (set at signup for email-OTP password reset).
        try {
          const { data: resolvedEmail } = await supabase.rpc('resolve_login_email', { p_identifier: identifier });
          if (resolvedEmail && resolvedEmail !== authEmail) {
            const retry = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
            if (!retry.error && retry.data?.user) { data = retry.data; authError = null; resolvedViaLookup = true; }
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
              saveAccount({ username: agentUsername, password, businessName: agent.name, email: agent.email || '', phone: agent.phone || '', role: 'sub-manager', managerUsername: match.manager_id, createdAt: new Date().toISOString(), rememberPassword: true, agentToken: match.token });
              finishLogin(agentUsername); return true;
            }
          } catch (searchEx) { console.error('[Auth] Agent search failed:', searchEx); }
          throw new Error('Invalid username or password.');
        }
      }
      if (data.user) {
        // A direct email login may land here before the username lookup. Match
        // the authenticated identity to sub_managers and route data to parent.
        let { data: authAgent } = await supabase
          .from('sub_managers')
          .select('auth_user_id, manager_id, username, name, email, contact')
          .eq('auth_user_id', data.user.id)
          .maybeSingle();
        // Fresh browsers may have a valid Auth session but no direct SELECT
        // visibility on the auth mapping row. Resolve through the protected
        // service-role-backed endpoint before treating this identity as a manager.
        if (!authAgent && data.session?.access_token) {
          try {
            const response = await fetch('/api/admin-maintenance?action=resolve-sub-manager-session', {
              headers: { Authorization: `Bearer ${data.session.access_token}` },
            });
            const resolved = await response.json().catch(() => ({}));
            if (response.ok && resolved?.agent) authAgent = resolved.agent;
          } catch { /* continue with normal profile resolution */ }
        }
        if (authAgent?.auth_user_id === data.user.id) {
          const agentUsername = authAgent.username;
          setActiveSession(agentUsername);
          saveAccount({ username: agentUsername, password: '', businessName: authAgent.name || agentUsername, email: authAgent.email || data.user.email || '', phone: authAgent.contact || '', role: 'sub-manager', managerUsername: authAgent.manager_id, createdAt: new Date().toISOString(), rememberPassword: false, authUserId: authAgent.auth_user_id });
          finishLogin(agentUsername); return true;
        }

        let loginUser = username.includes('@') ? username.split('@')[0] : username;
        const { data: profileDataPre } = await supabase.from('profiles').select('role, manager_id, full_name, username').eq('id', data.user.id).maybeSingle();
        // SECURITY: Supabase auto-creates a bare profiles row (role defaults to
        // 'manager' at the schema level) for EVERY auth.users insert, including
        // the auth accounts created for sub-managers. If the sub_managers lookup
        // above failed for any reason (deleted account, RLS timing, etc.), this
        // person is NOT a genuine manager just because *some* profiles row
        // exists — sub-manager shadow rows are now actively deleted at creation
        // time (see create-sub-manager-auth), so a row existing at all is the
        // correct signal; a row with null username still gets the legacy
        // backfill treatment below rather than being rejected outright.
        if (!profileDataPre) {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error('This account is not active. Contact your manager or admin.');
        }
        // Backfill profiles.username if missing (covers pre-existing accounts and
        // the localStorage→Supabase migration path above) — required for
        // manager_own_data_full_access RLS to recognize this session as the owner.
        await supabase.from('profiles').update({ username: loginUser }).eq('id', data.user.id).is('username', null);
        const profileData = profileDataPre;
        // If login was resolved via CNIC/recovery-email lookup (not a direct
        // username match), `identifier` typed by the person is NOT their real
        // username — always trust the profile's actual username in that case.
        if (resolvedViaLookup && profileData?.username) loginUser = profileData.username;
        const role = profileData.role || 'manager';
        setActiveSession(loginUser);
        if (rememberPassword) saveAccount({ username: loginUser, password, businessName: profileData?.full_name || data.user.user_metadata?.full_name || loginUser, email: data.user.email || '', phone: data.user.user_metadata?.phone || '', role: role as 'admin' | 'manager' | 'sub-manager', managerUsername: profileData?.manager_id || '', createdAt: new Date().toISOString(), rememberPassword: true });
        finishLogin(loginUser); return true;
      }
      throw new Error('Authentication failed.');
    } catch (err: any) {
      if (!err?.message?.startsWith('Too many login attempts')) {
        supabase.rpc('record_login_failure', { p_identifier: username.trim() }).catch(() => {});
      }
      showError(err.message || 'Authentication error occurred'); return false;
    }
    finally { setIsLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(username, password);
  };

  const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
  const checkUsername = async (raw: string): Promise<boolean> => {
    const u = raw.trim().toLowerCase();
    if (!USERNAME_RE.test(u) || u === ADMIN_USERNAME) { setUsernameStatus('invalid'); return false; }
    setUsernameStatus('checking');
    try {
      const { data, error: rpcErr } = await supabase.rpc('check_username_available', { p_username: u });
      if (rpcErr) { setUsernameStatus(''); return true; } // don't block signup if the check itself is unavailable; server trigger still guards
      if (data === false) { setUsernameStatus('taken'); return false; }
      setUsernameStatus('ok'); return true;
    } catch { setUsernameStatus(''); return true; }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupBusinessType) { setView('signup-business-type'); showError('Please choose your business type first.'); return; }
    if (password.length < 4) { showError('Password must be at least 4 characters.'); return; }
    if (password !== confirmPassword) { showError('Passwords do not match.'); return; }
    const uname = signupUsername.trim().toLowerCase();
    if (!USERNAME_RE.test(uname)) { setUsernameStatus('invalid'); showError('Username must be 3-30 characters: lowercase letters, numbers, dot or underscore.'); return; }
    if (uname === ADMIN_USERNAME || accounts.some(a => a.username === uname)) { setUsernameStatus('taken'); showError('This username is already taken.'); return; }
    if (phone.replace(/[^0-9]/g, '').length < 10) { showError('Please enter a valid phone number.'); return; }
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && (!trimmedEmail.includes('@') || trimmedEmail.endsWith('@myisp.local'))) { showError('Please enter a valid email address.'); return; }
    const cnicDigits = cnic.replace(/[^0-9]/g, '');
    if (cnic && cnicDigits.length !== 13) { showError('CNIC must be 13 digits (XXXXX-XXXXXXX-X).'); return; }
    setIsLoading(true); setLoadingText('Creating your account...'); setError('');
    try {
      if (!(await checkUsername(uname))) { showError('This username is already taken. Please choose another one.'); return; }
      // Use the real email (if given) as the actual login/auth email — this is
      // what makes email-OTP "Forgot Password" work later. Without one, we fall
      // back to the synthetic username@myisp.local identifier as before (in which
      // case password recovery isn't possible via email — only admin reset).
      const hasRealEmail = !!trimmedEmail;
      const authEmail = hasRealEmail ? trimmedEmail : `${uname}@myisp.local`;
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email: authEmail, password, options: { data: { full_name: businessName || uname, phone } } });
      if (signUpErr && signUpErr.message.toLowerCase().includes('already registered')) { showError(hasRealEmail ? 'This email is already registered.' : 'This username is already registered.'); return; }
      if (signUpErr) throw new Error(signUpErr.message);
      if (!signUpData.user) throw new Error('Signup failed. Try again.');
      if (hasRealEmail) {
        // Real email on file — Supabase already dispatched a signup-confirmation
        // email (OTP-style, via the "Confirm signup" template). Don't try to log
        // in yet; the account isn't confirmed until they enter that code.
        setPendingSignupEmail(authEmail);
        setView('signup-otp');
        return;
      }
      // No real email was given — there's nowhere for a confirmation OTP to go
      // (the synthetic {username}@myisp.local address isn't a real inbox), so this
      // account is auto-confirmed server-side instead of being stuck forever.
      await supabase.rpc('auto_confirm_synthetic_signup', { p_user_id: signUpData.user.id });
      await finishSignup(authEmail);
    } catch (err: any) { showError(`Registration Failed: ${err.message}`); }
    finally { setIsLoading(false); }
  };

  // Shared tail-end of account creation, called either right after a synthetic-email
  // signup (auto-confirmed above) or after a real-email signup's OTP is verified.
  const finishSignup = async (authEmail: string) => {
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (signInErr) throw new Error('Account created! Please login manually.');
    // profiles.username is required for RLS-scoped manager_data access but is
    // never set by the signup trigger — set it now so dual-save works immediately.
    const { data: { user } } = await supabase.auth.getUser();
    const cnicDigits = cnic.replace(/[^0-9]/g, '');
    const uname = signupUsername.trim().toLowerCase();
    if (user) {
      const { error: cnicErr } = await supabase.from('profiles').update({ username: uname, full_name: businessName || uname, cnic: cnicDigits || null }).eq('id', user.id);
      // CNIC has a unique index — if someone else already registered with it,
      // don't fail the whole signup over it, just drop the CNIC and let them
      // know via the account they already have (rare edge case).
      if (cnicErr && cnicDigits) {
        await supabase.from('profiles').update({ username: uname, full_name: businessName || uname }).eq('id', user.id);
      }
    }
    // Best-effort: keep the contact phone on the profile (also lets login-by-phone resolve). Never fails signup.
    try { if (user) await supabase.from('profiles').update({ phone }).eq('id', user.id); } catch { /* ignore */ }
    // M5: one-time business type save. The column is not directly updatable —
    // only this RPC can set it, exactly once. Never fail the signup over it;
    // the in-app gate (useBusinessTypeGate) asks if this didn't stick.
    try {
      if (signupBusinessType) {
        const { data: btData } = await supabase.rpc('set_my_business_type', { p_type: signupBusinessType });
        if ((btData as { success?: boolean } | null)?.success) {
          try { localStorage.setItem(`bc_business_type_set_${uname}`, '1'); } catch { /* ignore */ }
        } else console.warn('[Signup] business type not confirmed:', btData);
      }
    } catch (btErr) { console.warn('[Signup] set_my_business_type failed:', btErr); }
    // Keep the per-manager cache in sync so the right tabs render on first paint.
    try { if (signupBusinessType) localStorage.setItem(`bc_business_type_${uname}`, signupBusinessType); } catch { /* ignore */ }
    const newAccount: ManagerAccount = { username: uname, password, businessName: businessName || uname, email: authEmail, phone, createdAt: new Date().toISOString(), rememberPassword };
    saveAccount(newAccount); setAccounts(getAccounts());
    writeLog({ username: uname, action: 'SIGNUP', detail: `New account: ${businessName}` });
    // Ask them which plan they actually want before dropping into the app —
    // Free activates immediately, paid tiers go to a payment-instructions
    // screen and stay on Free-level access until an admin verifies the
    // transfer (see select_signup_tier / admin_record_subscription_payment).
    // TODO(product): water plans not defined yet — skip the tier + NetBot
    // upsell steps for water signups; go straight into the app like "Skip".
    if (signupBusinessType === 'water') { handleSkipNetbot(); return; }
    setView('signup-tier');
  };

  // Built from live pricingPlans (NetBot cards excluded — that's now its own
  // step below) so this list always matches whatever's currently set on the
  // landing page's pricing section, instead of a separate hardcoded copy.
  const PLAN_TIERS = pricingPlans
    .filter(p => !p.name.trim().toLowerCase().startsWith('netbot'))
    .map(p => ({
      tier: p.name.trim().toLowerCase(),
      label: p.name,
      price: p.period ? `${p.price}/mo` : (p.price === 'Custom' ? 'Contact Us' : p.price),
      desc: p.features.slice(0, 2).join(' · '),
    }));

  const handleSelectTier = async (tier: string, label: string) => {
    setTierBusy(true);
    try {
      // NOTE: supabase-js rpc() returns { data, error } — it does NOT throw on
      // server errors, so the error must be checked explicitly. A missing /
      // misbehaving select_signup_tier RPC used to fake-success here and the
      // plan was never recorded.
      // TODO(backend/Claude): select_signup_tier(p_tier text) must exist in
      // Supabase as SECURITY DEFINER (upserts manager_subscriptions).
      const { data, error } = await supabase.rpc('select_signup_tier', { p_tier: tier });
      const rpcMsg = rpcErrorMessage(data, error);
      if (rpcMsg) {
        showError(`Couldn't save your plan (${rpcMsg}). Please try again.`);
        return;
      }
      if (tier === 'free') {
        setView('signup-netbot');
      } else {
        setTierPaymentPending({ tier, label });
      }
    } finally {
      setTierBusy(false);
    }
  };

  // NetBot is a standalone product, sold separately from the ISP tier and
  // fully optional — there's no signup-time RPC for it (activation needs
  // manual Meta WhatsApp Business setup per manager). Selecting a tier just
  // opens WhatsApp with the request; skipping goes straight to the dashboard.
  const handleSelectNetbotTier = (planName: string) => {
    const msg = `Hi, I want to activate NetBot (${planName}) for my account — ${businessName || signupUsername}.`;
    window.open(`https://wa.me/923477136214?text=${encodeURIComponent(msg)}`, '_blank');
    onLogin(signupUsername.trim().toLowerCase());
  };
  const handleSkipNetbot = () => onLogin(signupUsername.trim().toLowerCase());

  const handleSubmitProof = async () => {
    if (!proofFile) { showError('Payment proof screenshot select karein.'); return; }
    setProofUploading(true);
    try {
      const ext = proofFile.name.split('.').pop() || 'jpg';
      const path = `signup-proofs/${signupUsername.trim().toLowerCase()}-${Date.now()}.${ext}`;
      let publicUrl: string;
      try {
        publicUrl = await uploadMediaToR2(path, proofFile, proofFile.type || 'image/jpeg');
      } catch (uploadErr: any) {
        const msg = uploadErr?.message || '';
        // fetch() throws TypeError "Failed to fetch" only on network-level
        // failures (R2 bucket CORS preflight / bad R2 endpoint env var /
        // connectivity) — never on HTTP error statuses. Point the user at the
        // WhatsApp / Email fallback channels below instead of a dead retry.
        // TODO(backend/Claude): fix R2 bucket CORS policy + verify R2_* env vars on Vercel.
        if (/failed to fetch|networkerror/i.test(msg)) {
          showError('Upload connection failed. Please send your receipt on WhatsApp below — your plan will be verified.');
        } else {
          showError(msg || 'Proof upload failed, try again.');
        }
        return;
      }
      // Same silent-failure trap as handleSelectTier: rpc() never throws, so
      // check the error return or the proof is never linked to the account.
      // TODO(backend/Claude): submit_signup_payment_proof(p_proof_url text)
      // must exist in Supabase as SECURITY DEFINER (sets payment_proof_url +
      // status='pending_payment' on the caller's manager_subscriptions row).
      const { data: proofData, error: proofErr } = await supabase.rpc('submit_signup_payment_proof', { p_proof_url: publicUrl });
      const proofRpcMsg = rpcErrorMessage(proofData, proofErr);
      if (proofRpcMsg) {
        showError(`Proof uploaded but couldn't be recorded (${proofRpcMsg}). Please contact support.`);
        return;
      }
      setProofSubmitted(true);
    } catch (err: any) {
      showError(err?.message || 'Proof upload failed, try again.');
    } finally {
      setProofUploading(false);
    }
  };

  const handleSignupOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setLoadingText('Verifying OTP...'); setError('');
    try {
      const { error } = await supabase.auth.verifyOtp({ email: pendingSignupEmail, token: signupOtp, type: 'signup' });
      if (error) throw new Error('Invalid OTP or it has expired.');
      // verifyOtp(type: 'signup') already confirms + signs the user in; finishSignup's
      // own signInWithPassword call below just re-establishes the session cleanly
      // using the known-correct password, which is harmless and keeps this one
      // code path in charge of profile-setup + local account save.
      await finishSignup(pendingSignupEmail);
    } catch (err: any) { showError(err.message); }
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
    setBusinessName(''); setUsername(''); setEmail(''); setPhone(''); setSignupUsername(''); setUsernameStatus('');
    setPassword(''); setConfirmPassword(''); setRememberPassword(false); setError('');
    setForgotIdentifier(''); setForgotOtp(''); setNewPassword(''); setConfirmNewPassword('');
    setSignupOtp(''); setPendingSignupEmail('');
  };

  const handleGoToSignup = () => { resetFields(); setSignupBusinessType(null); setView('signup-business-type'); };
  const handleGoToLogin = () => { resetFields(); setSelectedAccount(null); setView('login'); };
  const handleGoToRecent = () => { resetFields(); setSelectedAccount(null); setView('recent'); };

  const handleDeleteAccount = (usernameToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation(); removeAccount(usernameToDelete);
    const updated = getAccounts(); setAccounts(updated);
    if (updated.length === 0) setView('login');
  };

  const handleClearAllAccounts = () => { clearAllAccounts(); setAccounts([]); setSelectedAccount(null); setView('signup-business-type'); setShowClearConfirm(false); };

  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block";

  // ── Card heading based on view ──
  const getHeading = () => {
    if (view === 'signup-business-type') return { title: 'Business Type', sub: 'What type of business do you run?' };
    if (view === 'signup') return { title: 'Create Account', sub: 'Create your business account' };
    if (view === 'signup-otp') return { title: 'Verify Email', sub: 'Enter the code sent to you' };
    if (view === 'recent') return { title: 'Continue As', sub: 'Select your profile to sign in' };
    if (view === 'forgot') return { title: 'Reset Password', sub: 'Enter your username or recovery email' };
    if (view === 'forgot-otp') return { title: 'Verify OTP', sub: 'Enter the code sent to you' };
    if (view === 'forgot-newpass') return { title: 'New Password', sub: 'Set a strong new password' };
    return { title: 'Sign In', sub: 'Access your ISP billing dashboard securely' };
  };

  const heading = getHeading();

  const isAuthView = view === 'login' || view.startsWith('signup');

  // Entrance animations for the auth illustration (count-up + play)
  useEffect(() => {
    if (!isAuthView) return;
    const root = document.querySelector('.bc-auth');
    if (!root) return;
    const fmtPKR = (n: number) => {
      const s = Math.max(0, Math.round(n)).toString();
      const last3 = s.slice(-3);
      const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      return 'Rs. ' + (rest ? rest + ',' + last3 : last3);
    };
    (root.querySelectorAll('[data-count]') as NodeListOf<HTMLElement>).forEach(el => {
      const target = parseFloat(el.dataset.count || '0');
      const t0 = performance.now();
      const tickFn = (t: number) => {
        const p = Math.min((t - t0) / 1600, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmtPKR(target * e);
        if (p < 1) requestAnimationFrame(tickFn); else el.textContent = fmtPKR(target);
      };
      requestAnimationFrame(tickFn);
    });
    const t = setTimeout(() => {
      root.querySelectorAll('.screen, .shot').forEach(el => el.classList.add('play'));
    }, 150);
    return () => clearTimeout(t);
  }, [view, isAuthView]);

  const cardHeader = (
    <>
            {/* Card Header */}
            <div className="text-center mb-7">
              <h2 className="text-2xl font-black tracking-tight mb-1">
                <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">{heading.title}</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">{heading.sub}</p>
              <div className="w-12 h-1 rounded-full mx-auto mt-3 bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500" />
            </div>

    </>
  );
  const errorBox = (
    <>
            {/* Error */}
            {error && (
              <div className={`mb-5 p-3.5 border rounded-xl text-[11px] font-bold uppercase tracking-widest text-center ${error.startsWith('Success') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                {error}
              </div>
            )}

    </>
  );
  const renderAuthForm = () => (
    <>
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

                {/* Business type chip (signup only) — back to the picker */}
                {view === 'signup' && (
                  <button type="button" onClick={() => setView('signup-business-type')}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all min-h-[48px]"
                    style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)' }}>
                    <span className="text-[11px] font-bold text-slate-600">
                      Business type: <span className="text-indigo-600 font-black">{signupBusinessType ? BUSINESS_TYPE_LABELS[signupBusinessType] : 'Not chosen'}</span>
                    </span>
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Change</span>
                  </button>
                )}

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
                    <label className={labelCls}>Login ID (Email, Phone, Username, or CNIC)</label>
                    <InputField icon={<UserIcon />} placeholder="Enter your ID" value={username} onChange={e => setUsername(e.target.value.toLowerCase().trim())} disabled={!!selectedAccount} />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>Username</label>
                      <InputField icon={<UserIcon />} placeholder="e.g. mahadnet" value={signupUsername} maxLength={30}
                        onBlur={() => { if (signupUsername.length >= 3) void checkUsername(signupUsername); }}
                        onChange={e => { setSignupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')); setUsernameStatus(''); }} />
                      <p className="mt-1.5 ml-1 text-[10px] font-semibold" style={{ color: usernameStatus === 'ok' ? '#059669' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#e11d48' : '#94a3b8' }}>
                        {usernameStatus === 'checking' ? 'Checking availability...'
                          : usernameStatus === 'ok' ? 'Username is available'
                          : usernameStatus === 'taken' ? 'This username is already taken'
                          : usernameStatus === 'invalid' ? 'Use 3-30 characters: a-z, 0-9, dot or underscore'
                          : 'This is your login ID. Letters, numbers, dot or underscore (min 3).'}
                      </p>
                    </div>
                    <div>
                      <label className={labelCls}>Phone Number</label>
                      <InputField icon={<PhoneIcon />} type="tel" placeholder="e.g. 03001234567" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>
                  </>
                )}

                {/* CNIC (signup only, optional) — also usable as a login ID once set */}
                {view === 'signup' && (
                  <div>
                    <label className={labelCls}>CNIC (optional)</label>
                    <InputField icon={<UserIcon />} placeholder="XXXXX-XXXXXXX-X" value={cnic}
                      onChange={e => {
                        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
                        const formatted = digits.length > 12 ? `${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}` : digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits;
                        setCnic(formatted);
                      }} />
                    <p className="text-[9px] text-slate-500 ml-1 mt-1">Add this so you can also log in using your CNIC.</p>
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
                  <label className={labelCls}>Password</label>
                  <InputField icon={<LockIcon />} type={showPassword ? 'text' : 'password'} placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)}
                    rightElement={<button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-indigo-400 transition-colors p-1">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>} />
                </div>

                {/* Terms access — informational link only; acceptance enforcement remains a separate auth-review item. */}
                <div className="-mt-1 flex justify-end">
                  <a href="/terms" className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider transition-colors">
                    Read Terms & Policies
                  </a>
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

              </form>
      )}
    </>
  );
  const cardBody = (
    <>


            {cardHeader}
            {errorBox}
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
                        style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(99,102,241,0.18)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.18)'; }}>
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-black text-indigo-300 flex-shrink-0"
                          style={{ background: 'rgba(99,102,241,0.15)' }}>
                          {(acc.businessName || acc.username).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{acc.businessName || acc.username}</p>
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
                  <label className={labelCls}>8-Digit OTP</label>
                  <InputField icon={<LockIcon />} placeholder="Enter OTP" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} maxLength={8} />
                </div>
                <button type="submit" disabled={isLoading} className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] text-white transition-all active:scale-95 hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
                  {isLoading ? loadingText : 'Verify OTP'}
                </button>
              </form>
            )}

            {/* ── SIGNUP OTP (email confirmation) ── */}
            {view === 'signup-otp' && (
              <form onSubmit={handleSignupOtpVerify} className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={() => { resetFields(); setView('signup'); }} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-indigo-400 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>Back
                  </button>
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Last Step</span>
                </div>
                <div className="p-3.5 rounded-xl text-[11px] font-bold text-center text-indigo-300" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  OTP sent to: <strong>{pendingSignupEmail}</strong>
                </div>
                <div>
                  <label className={labelCls}>8-Digit OTP</label>
                  <InputField icon={<LockIcon />} placeholder="Enter OTP" value={signupOtp} onChange={e => setSignupOtp(e.target.value)} maxLength={8} />
                </div>
                <button type="submit" disabled={isLoading} className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] text-white transition-all active:scale-95 hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
                  {isLoading ? loadingText : 'Verify & Create Node'}
                </button>
              </form>
            )}

            {/* ── BUSINESS TYPE (first signup step) ── */}
            {view === 'signup-business-type' && (
              <BusinessTypePicker
                value={signupBusinessType}
                onChange={setSignupBusinessType}
                onContinue={() => setView('signup')}
                onBack={() => setView(accounts.length > 0 ? 'recent' : 'login')}
                continueLabel="Continue"
              />
            )}

            {/* ── PLAN SELECTION (after successful signup) ── */}
            {view === 'signup-tier' && !tierPaymentPending && (
              <div className="space-y-2.5">
                <div className="text-center mb-3">
                  <h2 className="text-lg font-black text-slate-900 mb-1">Choose Your Plan</h2>
                  <p className="text-[11px] text-slate-500">Free starts instantly. Paid plans activate after payment verification.</p>
                </div>
                {PLAN_TIERS.map((p) => (
                  <button
                    key={p.tier}
                    type="button"
                    disabled={tierBusy}
                    onClick={() => handleSelectTier(p.tier, p.label)}
                    className="w-full text-left p-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-between gap-3 group"
                    style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(99,102,241,0.18)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.18)'; }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-slate-900 text-sm">{p.label}</p>
                        {p.tier === 'free' && (
                          <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/15">Instant</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">{p.desc}</p>
                    </div>
                    <span className="text-[11px] font-black text-indigo-600 flex-shrink-0">{p.price}</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── PAYMENT INSTRUCTIONS (paid tier selected) ── */}
            {view === 'signup-tier' && tierPaymentPending && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-black text-slate-900 mb-1">{tierPaymentPending.label} Plan Selected</h2>
                  <p className="text-[11px] text-slate-500">Pay using any option below, then send your receipt on WhatsApp — your plan activates as soon as it's verified.</p>
                </div>
                <div
                  className="p-4 rounded-2xl space-y-2 text-[12px]"
                  style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(99,102,241,0.18)' }}
                >
                  <p className="font-black text-indigo-600 text-[10px] uppercase tracking-wider mb-1">Meezan Bank</p>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Title</span><span className="font-bold text-slate-900 text-right">MAHAD AHMAD KHAN LODHI</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Account</span><span className="font-bold text-slate-900">00300112164874</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">IBAN</span><span className="font-bold text-slate-900 text-[10px] break-all text-right">PK82MEZN0000300112164874</span></div>
                  <div className="border-t border-indigo-100 my-2" />
                  <p className="font-black text-indigo-600 text-[10px] uppercase tracking-wider mb-1">EasyPaisa / JazzCash</p>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Number</span><span className="font-bold text-slate-900">0304-2773453</span></div>
                </div>

                {proofSubmitted ? (
                  <div className="p-4 rounded-2xl text-center text-[12px] font-bold text-emerald-700" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)' }}>
                    Payment proof submitted — your {tierPaymentPending.label} plan will activate once verified.
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Upload Payment Proof (screenshot)</label>
                    <input type="file" accept="image/*" onChange={e => setProofFile(e.target.files?.[0] || null)}
                      className="w-full text-[11px] text-slate-600 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-indigo-500/15 file:text-indigo-600 hover:file:bg-indigo-500/25 file:cursor-pointer cursor-pointer" />
                  </div>
                )}

                {!proofSubmitted && (
                  <button type="button" onClick={handleSubmitProof} disabled={proofUploading || !proofFile}
                    className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] text-white transition-all active:scale-95 hover:-translate-y-0.5 disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
                    {proofUploading ? 'Uploading...' : 'Submit Registration & Payment Proof'}
                  </button>
                )}

                <a href={`https://wa.me/923477136214?text=${encodeURIComponent(`Payment receipt for ${tierPaymentPending.label} plan — ${businessName || signupUsername}`)}`}
                  target="_blank" rel="noreferrer"
                  className="w-full py-3 rounded-2xl font-bold text-[11px] text-emerald-700 hover:text-emerald-800 transition-colors flex items-center justify-center gap-1.5">
                  Also inform on WhatsApp (optional)
                </a>
                <button type="button" onClick={() => setView('signup-netbot')}
                  className="w-full py-3 rounded-2xl font-bold text-[11px] text-slate-500 hover:text-indigo-600 transition-colors">
                  Continue (Free tier until verified)
                </button>
              </div>
            )}

            {/* ── NETBOT TIER SELECTION (final signup step, fully optional) ── */}
            {view === 'signup-netbot' && (
              <div className="space-y-2.5">
                <div className="text-center mb-3">
                  <h2 className="text-lg font-black text-slate-900 mb-1">Add NetBot WhatsApp Bot?</h2>
                  <p className="text-[11px] text-slate-500">Optional — sold separately from your ISP plan. Skip now, add it later from Settings anytime.</p>
                </div>
                {WHATSAPP_BOT_PLANS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleSelectNetbotTier(p.name)}
                    className="w-full text-left p-4 rounded-2xl transition-all flex items-center justify-between gap-3 group"
                    style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(16,185,129,0.18)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.5)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.18)'; }}
                  >
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 text-sm">{p.name}</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">{p.features[0]}</p>
                    </div>
                    <span className="text-[11px] font-black text-emerald-700 flex-shrink-0">{p.price}/mo</span>
                  </button>
                ))}
                <button type="button" onClick={handleSkipNetbot}
                  className="w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-all"
                  style={{ border: '1.5px dashed rgba(100,116,139,0.35)', background: 'rgba(100,116,139,0.05)' }}>
                  Skip — I don't need NetBot right now
                </button>
              </div>
            )}

            {/* ── NEW PASSWORD ── */}
            {view === 'forgot-newpass' && (
              <form onSubmit={handleSetNewPassword} className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">OTP Verified</span>
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

            {renderAuthForm()}

    </>
  );
  const authArtLogin = (
    <div className="scene active">
      <div className="stage">
        <div className="phone">
          <div className="screen">
            <div className="screen-top"><b>Dashboard</b><div className="avatar" /></div>
            <div className="kpis">
              <div className="kpi"><small>Collected</small><b data-count="124500">Rs. 0</b><span className="up">▲ this month</span></div>
              <div className="kpi"><small>Pending</small><b data-count="38200">Rs. 0</b><span className="up" style={{ color: '#c0392b' }}>▼ 12% vs last</span></div>
            </div>
            <div className="bars">
              <small>Collection · last 7 days</small>
              <div className="bar-row">
                <div className="bar" style={{ height: '42%' }} /><div className="bar" style={{ height: '68%' }} />
                <div className="bar" style={{ height: '55%' }} /><div className="bar" style={{ height: '88%' }} />
                <div className="bar" style={{ height: '74%' }} /><div className="bar" style={{ height: '96%' }} />
                <div className="bar" style={{ height: '62%' }} />
              </div>
            </div>
            <div className="due-list">
              <div className="due"><div><b>Ahmed Raza</b><br /><span>Monthly · Fiber 20MB</span></div><span className="pill paid">Paid</span></div>
              <div className="due"><div><b>Fatima Khan</b><br /><span>Monthly · Fiber 10MB</span></div><span className="pill duep">Due</span></div>
            </div>
          </div>
        </div>
        <div className="float f1"><span className="fcheck"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span><span>Payment received<small>Receipt #R-000124</small></span></div>
        <div className="float f2"><span className="fico wa"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-13.2 8L3 21l1.2-4.4A9 9 0 1 1 21 12z"/><path d="M9 10h.01M12.5 10h.01M16 10h.01"/></svg></span><span>Reminder sent<small>WhatsApp · 2 min ago</small></span></div>
        <div className="float f3"><span className="ring" /><span>Recovery 87%<small>This month</small></span></div>
        <div className="float f4"><span className="fico bl"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/></svg></span><span>Bill generated<small>November · auto</small></span></div>
      </div>
    </div>
  );
  const authArtSignup = (
    <div className="scene active">
      <div className="stage">
        <div className="laptop">
          <div className="lscreen">
            <div className="ldisplay">
              <div className="lbar"><div className="dots"><i /><i /><i /></div><b>Get started</b></div>
              <div className="lbody">
                <div className="lside"><i className="on" /><i /><i /><i /><i /></div>
                <div className="lmain">
                  <div className="lrow"><div><b>Add customers</b><br /><span>Import or add manually</span></div><span style={{ color: '#16a34a', fontWeight: 800 }}>✓</span></div>
                  <div className="lrow"><div><b>Set monthly plans</b><br /><span>Packages &amp; rates</span></div><span style={{ color: '#16a34a', fontWeight: 800 }}>✓</span></div>
                  <div className="lrow"><div><b>Send first reminder</b><br /><span>WhatsApp templates</span></div><span style={{ color: '#6366f1', fontWeight: 800 }}>→</span></div>
                </div>
              </div>
            </div>
          </div>
          <div className="lbase" />
        </div>
        <div className="float f1"><span className="fcheck"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span><span>Account created<small>Welcome aboard!</small></span></div>
        <div className="float f2"><span className="fico bl"><svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg></span><span>Free plan · Active<small>No card required</small></span></div>
        <div className="float f3"><span className="ring" /><span>3 steps<small>To go live</small></span></div>
        <div className="float f4"><span className="fico wa"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-13.2 8L3 21l1.2-4.4A9 9 0 1 1 21 12z"/><path d="M9 10h.01M12.5 10h.01M16 10h.01"/></svg></span><span>WhatsApp ready<small>Templates loaded</small></span></div>
      </div>
    </div>
  );

  return (
    <div className={isAuthView ? 'bc-auth' : 'login-page min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#f4f7fc]'}>

      {isAuthView ? (
        <>
          <style>{`.bc-auth{
    --navy:#0f172a; --indigo:#6366f1; --violet:#8b5cf6; --cyan:#06b6d4;
    --ink:rgba(15,23,42,.92); --muted:rgba(15,23,42,.6); --green:#16a34a; --wa:#0E7C7B;
  }.bc-auth{ 
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;
    background:#c9cde2; min-height:100svh; display:flex; align-items:center; justify-content:center;
    padding:28px 18px; color:var(--ink);
  
    min-height:100svh; display:flex; align-items:center; justify-content:center; padding:28px 18px; position:relative; overflow:hidden; }.bc-auth .auth-shell{
    width:min(1080px,100%); background:#fff; border-radius:26px; overflow:hidden;
    display:grid; grid-template-columns:1fr; box-shadow:0 40px 100px rgba(15,23,42,.28);
    animation:rise .7s cubic-bezier(.2,.7,.2,1);
  }
  @keyframes rise{ from{ opacity:0; transform:translateY(26px);} to{ opacity:1; transform:none;} }
  @media(min-width:900px){.bc-auth .auth-shell{ grid-template-columns:1.25fr 1fr; min-height:620px; } }.bc-auth .art{
    position:relative; overflow:hidden; min-height:420px;
    background:linear-gradient(150deg,#eef0ff 0%,#e6f6fb 55%,#e9fbf3 100%);
    display:flex; align-items:center; justify-content:center; padding:40px 20px;
  }.bc-auth .art::before{ content:""; position:absolute; width:420px; height:420px; border-radius:50%;
    background:radial-gradient(circle,rgba(99,102,241,.22),transparent 70%); top:-120px; left:-120px; }.bc-auth .art::after{ content:""; position:absolute; width:380px; height:380px; border-radius:50%;
    background:radial-gradient(circle,rgba(6,182,212,.18),transparent 70%); bottom:-140px; right:-100px; }.bc-auth .scene{ position:relative; width:min(440px,92%); z-index:1; display:none; }.bc-auth .scene.active{ display:block; animation:panein .5s ease; }.bc-auth .stage{ position:relative; width:100%; transform:perspective(1100px) rotateX(4deg); }.bc-auth .tabs{ display:flex; background:#eef0f6; border-radius:999px; padding:5px; margin-bottom:24px; position:relative; }.bc-auth .tab{ flex:1; border:none; background:transparent; padding:11px; border-radius:999px; font-size:15px; font-weight:700; color:var(--muted); cursor:pointer; position:relative; z-index:1; transition:color .25s; }.bc-auth .tab.active{ color:#fff; }.bc-auth .tab-ind{ position:absolute; top:5px; bottom:5px; left:5px; width:calc(50% - 5px); border-radius:999px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6); box-shadow:0 6px 16px rgba(99,102,241,.35);
    transition:transform .3s cubic-bezier(.2,.7,.2,1); }.bc-auth .tabs.up .tab-ind{ transform:translateX(100%); }.bc-auth .pane{ display:none; }.bc-auth .pane.active{ display:block; animation:panein .4s ease; }
  @keyframes panein{ from{ opacity:0; transform:translateY(10px);} to{ opacity:1; transform:none;} }.bc-auth .lbody .lrow{ animation:rowin .6s cubic-bezier(.2,.7,.2,1) backwards; }.bc-auth .lbody .lrow:nth-child(1){ animation-delay:.25s; }.bc-auth .lbody .lrow:nth-child(2){ animation-delay:.4s; }.bc-auth .lbody .lrow:nth-child(3){ animation-delay:.55s; }
  @keyframes rowin{ from{ opacity:0; transform:translateX(-14px);} to{ opacity:1; transform:none;} }.bc-auth .laptop{ position:relative; }.bc-auth .lscreen{
    background:#0f172a; border-radius:16px; padding:12px 12px 0; box-shadow:0 30px 60px rgba(15,23,42,.35);
  }.bc-auth .ldisplay{ background:#f6f8fb; border-radius:8px; overflow:hidden; }.bc-auth .lbar{ display:flex; align-items:center; gap:8px; padding:10px 12px; background:#fff; border-bottom:1px solid #eef1f5; }.bc-auth .lbar .dots{ display:flex; gap:5px; }.bc-auth .lbar .dots i{ width:8px; height:8px; border-radius:50%; background:#e2e8f0; }.bc-auth .lbar b{ font-size:11px; color:var(--navy); margin-left:4px; }.bc-auth .lbody{ display:grid; grid-template-columns:86px 1fr; min-height:150px; }.bc-auth .lside{ background:#0f172a; padding:12px 8px; display:flex; flex-direction:column; gap:8px; }.bc-auth .lside i{ display:block; height:8px; border-radius:4px; background:rgba(255,255,255,.18); }.bc-auth .lside i.on{ background:linear-gradient(90deg,#6366f1,#8b5cf6); }.bc-auth .lmain{ padding:12px; }.bc-auth .lrow{ display:flex; justify-content:space-between; align-items:center; background:#fff; border-radius:8px; padding:8px 10px; margin-bottom:8px; box-shadow:0 2px 8px rgba(15,23,42,.06); font-size:10px; }.bc-auth .lrow b{ color:var(--navy); font-size:10.5px; }.bc-auth .lrow span{ color:var(--muted); font-size:9px; }.bc-auth .lbase{ height:12px; background:linear-gradient(180deg,#cbd5e1,#94a3b8); border-radius:0 0 14px 14px; margin:0 14px; }.bc-auth .float{ position:absolute; background:#fff; border-radius:14px; padding:10px 14px;
    box-shadow:0 14px 34px rgba(15,23,42,.18); display:flex; align-items:center; gap:9px;
    font-size:12px; font-weight:700; color:var(--navy); animation:bob 5s ease-in-out infinite; z-index:2; }
  @keyframes bob{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-10px);} }.bc-auth .fcheck{ width:30px; height:30px; border-radius:50%; background:#dcfce7; display:flex; align-items:center; justify-content:center; flex:none; }.bc-auth .fcheck svg{ width:15px; height:15px; stroke:var(--green); stroke-width:3; fill:none; stroke-linecap:round; stroke-linejoin:round; }.bc-auth .float small{ display:block; font-weight:500; color:var(--muted); font-size:10px; }.bc-auth .f1{ top:-24px; right:-6px; }.bc-auth .f2{ top:34%; left:-34px; animation-delay:-1.6s; }.bc-auth .f3{ bottom:6%; right:-14px; animation-delay:-3.2s; }.bc-auth .f4{ bottom:-20px; left:16%; animation-delay:-2.2s; }.bc-auth .fico{ width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex:none; }.bc-auth .fico svg{ width:17px; height:17px; stroke:#fff; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }.bc-auth .wa{ background:linear-gradient(135deg,#0E7C7B,#149a98); }.bc-auth .bl{ background:linear-gradient(135deg,#6366f1,#8b5cf6); }.bc-auth .gd{ background:linear-gradient(135deg,#f59e0b,#f97316); }.bc-auth .ring{ width:34px; height:34px; border-radius:50%; flex:none;
    background:conic-gradient(#6366f1 0 87%, #e2e8f0 87% 100%);
    display:flex; align-items:center; justify-content:center; }.bc-auth .ring::after{ content:""; width:24px; height:24px; border-radius:50%; background:#fff; }.bc-auth .f1{ top:-30px; right:6px; }.bc-auth .f2{ top:30%; left:-46px; }
  @media(max-width:520px){.bc-auth .float{ padding:8px 11px; font-size:11px; gap:7px; }.bc-auth .float small{ font-size:9px; }.bc-auth .fcheck, .bc-auth .fico{ width:26px; height:26px; }.bc-auth .ring{ width:28px; height:28px; }.bc-auth .ring::after{ width:19px; height:19px; }.bc-auth .f1{ top:-20px; right:2px; }.bc-auth .f2{ top:24%; left:-6px; }.bc-auth .f3{ bottom:0%; right:-2px; }.bc-auth .f4{ bottom:-16px; left:6%; }.bc-auth .art{ min-height:380px; padding:56px 16px 40px; }
  }.bc-auth .form{ padding:44px 40px; display:flex; flex-direction:column; justify-content:center; }
  @media(max-width:899px){.bc-auth .form{ padding:36px 26px 40px; }.bc-auth .art{ display:none; } }.bc-auth .flogo{ display:flex; align-items:center; justify-content:center; gap:9px; font-weight:800; font-size:19px; color:var(--navy); margin-bottom:26px; }.bc-auth .flogo img{ height:52px; width:auto; object-fit:contain; }.bc-auth .form h2{ text-align:center; font-size:24px; font-weight:800; color:var(--navy); letter-spacing:-.4px; }.bc-auth .form .fsub{ text-align:center; color:var(--muted); font-size:14px; margin:8px 0 24px; }.bc-auth .social{
    display:flex; align-items:center; justify-content:center; gap:10px; width:100%;
    padding:13px; border-radius:12px; border:1.5px solid rgba(15,23,42,.16); background:#fff;
    font-size:15px; font-weight:600; color:var(--ink); cursor:pointer; transition:border-color .2s, box-shadow .2s;
  }.bc-auth .social:hover{ border-color:rgba(15,23,42,.3); box-shadow:0 6px 18px rgba(15,23,42,.08); }.bc-auth .social svg{ width:18px; height:18px; }.bc-auth .divider{ display:flex; align-items:center; gap:12px; margin:22px 0; color:var(--muted); font-size:13px; }.bc-auth .divider::before, .bc-auth .divider::after{ content:""; flex:1; height:1px; background:rgba(15,23,42,.12); }.bc-auth .field{ margin-bottom:14px; }.bc-auth .field label{ display:block; font-size:13px; font-weight:700; color:var(--navy); margin-bottom:7px; }.bc-auth .field input{
    width:100%; padding:13px 15px; font-size:15px; border-radius:12px;
    border:1.5px solid rgba(15,23,42,.16); background:#fff; outline:none; color:var(--ink);
    transition:border-color .2s, box-shadow .2s;
  }.bc-auth .field input:focus{ border-color:var(--indigo); box-shadow:0 0 0 4px rgba(99,102,241,.15); }.bc-auth .btn{
    width:100%; margin-top:8px; padding:14px; border:none; border-radius:12px; cursor:pointer;
    font-size:16px; font-weight:800; color:#fff; background:linear-gradient(135deg,#6366f1,#8b5cf6);
    box-shadow:0 10px 26px rgba(99,102,241,.38); transition:transform .2s, box-shadow .2s;
  }.bc-auth .btn:hover{ transform:translateY(-2px); box-shadow:0 14px 32px rgba(99,102,241,.46); }.bc-auth .foot{ text-align:center; margin-top:22px; font-size:14px; color:var(--muted); }.bc-auth .foot a{ color:var(--indigo); font-weight:700; text-decoration:none; }.bc-auth .tiny{ text-align:center; margin-top:14px; font-size:12px; color:var(--muted); }.bc-auth .scene .phone{ width:min(250px,64vw); border-radius:40px; padding:10px; margin:6px auto;
    background:rgba(15,23,42,.94); box-shadow:0 30px 60px rgba(15,23,42,.35);
    transform:rotateY(-8deg) rotateX(4deg); animation:floaty 7s ease-in-out infinite; }
  @keyframes floaty{ 0%,100%{ transform:rotateY(-8deg) rotateX(4deg) translateY(0);} 50%{ transform:rotateY(-8deg) rotateX(4deg) translateY(-12px);} }.bc-auth .screen{ background:#f6f8fb; border-radius:32px; overflow:hidden; padding:16px 12px 20px; }.bc-auth .screen-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }.bc-auth .screen-top b{ font-size:13px; color:#0f172a; }.bc-auth .avatar{ width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#06b6d4); }.bc-auth .kpis{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:10px; }.bc-auth .kpi{ background:#fff; border-radius:13px; padding:11px; box-shadow:0 4px 14px rgba(15,23,42,.07); }.bc-auth .kpi small{ font-size:9px; color:rgba(15,23,42,.6); font-weight:700; text-transform:uppercase; letter-spacing:.4px; }.bc-auth .kpi b{ display:block; font-size:14.5px; color:#0f172a; margin-top:3px; }.bc-auth .kpi .up{ font-size:9px; color:#6366f1; font-weight:700; }.bc-auth .bars{ background:#fff; border-radius:13px; padding:12px; box-shadow:0 4px 14px rgba(15,23,42,.07); }.bc-auth .bars small{ font-size:9px; color:rgba(15,23,42,.6); font-weight:700; text-transform:uppercase; letter-spacing:.4px; }.bc-auth .bar-row{ display:flex; align-items:flex-end; gap:6px; height:66px; margin-top:9px; }.bc-auth .bar{ flex:1; border-radius:6px 6px 3px 3px; background:linear-gradient(180deg,#8b5cf6,#6366f1); }.bc-auth .bar:nth-child(odd){ background:linear-gradient(180deg,#a5b4fc,#06b6d4); }.bc-auth .due-list{ margin-top:10px; background:#fff; border-radius:13px; padding:5px 11px; box-shadow:0 4px 14px rgba(15,23,42,.07); }.bc-auth .due{ display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #eef1f5; font-size:11px; }.bc-auth .due:last-child{ border:none; }.bc-auth .due b{ color:#0f172a; }.bc-auth .due span{ color:rgba(15,23,42,.6); }.bc-auth .pill{ font-size:9px; font-weight:700; padding:4px 9px; border-radius:999px; }.bc-auth .pill.paid{ background:#dcf5ec; color:#0b7a5c; }.bc-auth .pill.duep{ background:#fdeaea; color:#c0392b; }.bc-auth .screen .bar{ transform:scaleY(0); transform-origin:bottom; }.bc-auth .screen.play .bar{ transform:scaleY(1); transition:transform 1.1s cubic-bezier(.2,.7,.2,1); }.bc-auth .screen.play .bar:nth-child(1){ transition-delay:.15s; }.bc-auth .screen.play .bar:nth-child(2){ transition-delay:.25s; }.bc-auth .screen.play .bar:nth-child(3){ transition-delay:.35s; }.bc-auth .screen.play .bar:nth-child(4){ transition-delay:.45s; }.bc-auth .screen.play .bar:nth-child(5){ transition-delay:.55s; }.bc-auth .screen.play .bar:nth-child(6){ transition-delay:.65s; }.bc-auth .screen.play .bar:nth-child(7){ transition-delay:.75s; }.bc-auth .screen .due{ opacity:0; transform:translateX(-14px); }.bc-auth .screen.play .due{ opacity:1; transform:none; transition:opacity .6s ease, transform .6s ease; }.bc-auth .screen.play .due:nth-child(1){ transition-delay:1s; }.bc-auth .screen.play .due:nth-child(2){ transition-delay:1.15s; }

.bc-auth .mesh{ position:absolute; inset:0; z-index:0; pointer-events:none; background-color:#c9cde2; background-image:radial-gradient(700px 480px at 12% 8%, rgba(99,102,241,.14), transparent 60%),radial-gradient(640px 520px at 88% 12%, rgba(6,182,212,.13), transparent 60%),radial-gradient(760px 560px at 50% 100%, rgba(139,92,246,.12), transparent 60%); }
.bc-auth .auth-shell{ position:relative; z-index:1; }
@media(max-width:899px){ .bc-auth .auth-art{ display:none; } }`}</style>
          <div className="mesh" aria-hidden="true" />
        </>
      ) : (
        <>
      {/* Three.js Background */}
      <div className="absolute inset-0 z-0"><VideoBackground variant="light" /></div>
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 0%, rgba(15,23,42,0.06) 100%)' }} />

      {/* Floating glass icon cards — Mahadnet hero signature */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden hidden md:block" aria-hidden="true">
        <div className="glass absolute top-[16%] left-[8%] w-16 h-16 rounded-2xl flex items-center justify-center text-cyan-600 shadow-[0_0_25px_rgba(8,145,178,0.15)]"><WifiIcon /></div>
        <div className="glass absolute top-[24%] right-[10%] w-14 h-14 rounded-2xl flex items-center justify-center text-purple-600 shadow-[0_0_25px_rgba(147,51,234,0.15)]"><CpuIcon /></div>
        <div className="glass absolute bottom-[22%] left-[10%] w-14 h-14 rounded-2xl flex items-center justify-center text-green-600 shadow-[0_0_25px_rgba(22,101,52,0.15)]"><WhatsAppIcon /></div>
        <div className="glass absolute bottom-[16%] right-[8%] w-16 h-16 rounded-2xl flex items-center justify-center text-blue-600 shadow-[0_0_25px_rgba(37,99,235,0.15)]"><ReceiptIcon /></div>
        <div className="glass absolute top-[52%] left-[4%] w-12 h-12 rounded-2xl flex items-center justify-center text-amber-600 shadow-[0_0_25px_rgba(180,83,9,0.15)]"><ZapIcon /></div>
        <div className="glass absolute top-[48%] right-[4%] w-12 h-12 rounded-2xl flex items-center justify-center text-emerald-600 shadow-[0_0_25px_rgba(5,150,105,0.15)]"><GlobeIcon /></div>
      </div>

        </>
      )}

      <div className="absolute top-4 right-4 z-[20]">
        <LanguageToggle language={language} onChange={handleLanguageChange} variant="pill" />
      </div>

      {isAuthView ? (
        <div className="auth-shell">
          <div className="auth-art art">
            {view === 'login' ? authArtLogin : authArtSignup}
          </div>
          <div className="auth-form form">
            <div className="flogo">
              {logoBase64 && <img src={logoBase64} alt="Bill Collector" />}
            </div>
            {(view === 'login' || view === 'signup') && (
              <div className={'tabs' + (view === 'signup' ? ' up' : '')}>
                <div className="tab-ind" />
                <button type="button" className={'tab' + (view === 'login' ? ' active' : '')} onClick={handleGoToLogin}>Sign in</button>
                <button type="button" className={'tab' + (view === 'signup' ? ' active' : '')} onClick={handleGoToSignup}>Sign up</button>
              </div>
            )}
            {cardBody}
            <div className="flex items-center justify-center gap-2 mt-4">
              <a href="/terms" className="text-[9px] font-black uppercase tracking-widest transition-colors" style={{ color: 'var(--muted)' }}>Terms &amp; Policies</a>
              <span className="text-[9px]" style={{ color: 'var(--muted)' }}>·</span>
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Bill Collector v2.0</span>
            </div>
          </div>
        </div>
      ) : (
      <div className={`w-full relative z-[10] ${view === 'signup-tier' || view === 'signup-netbot' || view === 'signup-business-type' ? 'max-w-md' : 'max-w-sm'}`}>

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
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: '0 24px 64px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >

          {/* Loading bar */}
          {isLoading && (
            <div className="absolute top-0 left-0 right-0 h-[2px] z-50 overflow-hidden bg-indigo-500/10">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 animate-[loading-bar_2s_infinite_linear] w-[30%]"></div>
            </div>
          )}

          <div className="p-8">
            {cardBody}
                    </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-3">
          <a href="/terms" className="text-[9px] text-slate-600 hover:text-indigo-400 font-black uppercase tracking-widest transition-colors">Terms & Policies</a>
          <span className="text-slate-700 text-[9px]">·</span>
          <span className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Bill Collector v2.0</span>
        </div>
      </div>
      )}

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 bg-white border-slate-200">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center mx-auto"><svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z" /></svg></div>
              <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Support Needed</h4>
              <p className="text-xs font-bold text-slate-400">No recovery email is on file for this account, so we can't send an OTP. Please contact our support team to manually reset your password.</p>
              <div className="pt-2 flex flex-col gap-3">
                <a href="https://wa.me/923042773453?text=Hello,%20I%20need%20help%20resetting%20my%20password%20for%20myISP." target="_blank" rel="noopener noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0a12 12 0 00-10.19 18.25L.037 24l5.962-1.55A11.942 11.942 0 0011.944 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zm6.342 17.202c-.288.814-1.42 1.488-2.203 1.583-.783.095-1.558.28-4.385-1.01-3.418-1.562-5.63-5.068-5.8-5.297-.17-.229-1.385-1.848-1.385-3.52 0-1.673.86-2.502 1.168-2.846.308-.344.67-.43.89-.43s.44 0 .633.01c.192.01.448-.076.7.534.252.61 1.092 2.65 1.188 2.846.095.196.16.425.02.653-.14.229-.21.37-.425.62-.215.25-.448.514-.64.715-.192.196-.394.412-.17.795.22.383.985 1.63 2.115 2.64 1.458 1.305 2.68 1.708 3.064 1.88.384.172.61.152.84-.112.23-.264.985-1.144 1.25-1.538.264-.394.528-.328.878-.196.35.132 2.215 1.042 2.59 1.232.375.19.625.286.715.446.09.16.09.936-.198 1.75z" /></svg>
                  WhatsApp Support
                </a>
                <button onClick={() => setShowSupportModal(false)} className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border transition-all active:scale-95 bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 bg-white border-slate-200">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mx-auto"><svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg></div>
              <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Purge All Data?</h4>
              <p className="text-xs font-bold text-slate-400">This will permanently remove all saved profiles from this device. This action cannot be undone.</p>
              <div className="pt-4 flex flex-col gap-3">
                <button onClick={handleClearAllAccounts} className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all">Confirm Purge</button>
                <button onClick={() => setShowClearConfirm(false)} className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border transition-all active:scale-95 bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200">Keep Data</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;

