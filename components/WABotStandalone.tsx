import React, { useEffect, useState } from 'react';
import { AppState, RouterCatalog, BotTemplate } from '../types';
import { getAccounts, getActiveSession, loadState, saveAccount, saveState, setActiveSession } from '../utils/storage';
import { saveStateToSupabase, smartLoadAndSync } from '../utils/supabaseSync';
import { subscribeToPush } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import WABotInbox from './WABotInbox';
import { isBiometricAvailable, isBiometricRegistered, registerBiometric, removeBiometric } from '../utils/webauthn';
import BiometricLockScreen from './BiometricLockScreen';

// ── Shared gradient-ring avatar (Ayesha brand mark) ─────────────────────────
const Avatar: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <div
    style={{ width: size, height: size, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
    className="rounded-full flex items-center justify-center shadow-xl shrink-0"
  >
    <div
      style={{ width: size - 8, height: size - 8 }}
      className="rounded-full bg-[#0b1120] flex items-center justify-center"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="7" width="16" height="13" rx="5" fill="#e0e7ff" />
        <rect x="10.5" y="2" width="3" height="5" rx="1.5" fill="#a5b4fc" />
        <circle cx="12" cy="4" r="1.6" fill="#a5b4fc" />
        <circle cx="9" cy="13.5" r="1.8" fill="#312e81" />
        <circle cx="15" cy="13.5" r="1.8" fill="#312e81" />
        <rect x="1.5" y="11" width="2" height="5" rx="1" fill="#a5b4fc" />
        <rect x="20.5" y="11" width="2" height="5" rx="1" fill="#a5b4fc" />
      </svg>
    </div>
  </div>
);

const BG = 'linear-gradient(135deg, #F0F4F8 0%, #E6EBF0 100%)';

const FingerprintIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571M17 13.5c0 2.4-.5 4.5-1.5 6.5M4.5 16.5c.5-2 .5-3.5.5-5.5a7 7 0 0114 0c0 .5 0 1-.1 1.9M9 11a3 3 0 116 0c0 1.5-.2 3-.6 4.5M6.5 20c1-1.7 1.5-3.3 1.9-5" />
  </svg>
);

type Phase = 'login' | 'locked' | 'loading' | 'ready' | 'error';

export default function WABotStandalone() {
  const [phase, setPhase] = useState<Phase>('login');
  const [username, setUsername] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [showBiometricEnroll, setShowBiometricEnroll] = useState(false);
  const [biometricConfirmPassword, setBiometricConfirmPassword] = useState('');
  const [biometricEnrollLoading, setBiometricEnrollLoading] = useState(false);
  const [biometricEnrollError, setBiometricEnrollError] = useState('');
  // First saved-on-this-device account (if any) that already has fingerprint enabled.
  const biometricAccount = getAccounts().find(a => isBiometricRegistered(a.username) && a.password);

  // Swap manifest + title while this screen is mounted, restore on unmount.
  // Also force LIGHT theme regardless of the main dashboard's saved theme —
  // /wabot always uses its own light brand look, independent of the manager's
  // dashboard dark/light preference.
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const prevHref = link?.getAttribute('href') || 'manifest.json';
    const prevTitle = document.title;
    const hadDarkClass = document.documentElement.classList.contains('dark');

    if (link) link.setAttribute('href', '/wabot-manifest.json');
    document.title = 'Bill Collector-BOT — WABot';
    document.documentElement.classList.remove('dark');

    return () => {
      if (link) link.setAttribute('href', prevHref);
      document.title = prevTitle;
      if (hadDarkClass) document.documentElement.classList.add('dark');
    };
  }, []);

  // Skip straight past login if a session already exists (WhatsApp-style "stay logged in") —
  // but if fingerprint login is enabled for that account, gate it behind a lock
  // screen first instead of loading straight into the chat. Even with NO active
  // session, if this device has a fingerprint-enrolled account, open straight
  // into that lock screen too (banking-app style) instead of the login form.
  useEffect(() => {
    const session = getActiveSession();
    if (session) {
      setUsername(session);
      setPhase(isBiometricRegistered(session) ? 'locked' : 'loading');
    } else if (biometricAccount) {
      setUsername(biometricAccount.username);
      setPhase('locked');
    }
    isBiometricAvailable().then(setBiometricAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'loading' || !username) return;
    (async () => {
      try {
        const local = loadState(username);
        const merged = await smartLoadAndSync(username, local);
        setState(merged);
        setPhase('ready');
        subscribeToPush(username).catch(() => {});
      } catch (e: any) {
        console.error('[WABotStandalone load]', e?.message);
        setErrorMsg('Data load nahi ho saka. Dobara try karein.');
        setPhase('error');
      }
    })();
  }, [phase, username]);

  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loggingIn) return;
    setLoggingIn(true);
    setLoginError('');
    try {
      const typed = loginUser.trim();
      // Fast path: local cache on this device (e.g. admin role, or already logged in here before)
      const accounts = getAccounts();
      const localFound = accounts.find(
        a => a.username.toLowerCase() === typed.toLowerCase() && a.password === loginPass
      );
      if (localFound) {
        setActiveSession(localFound.username);
        setUsername(localFound.username);
        setPhase('loading');
        return;
      }
      // Real check — Supabase Auth, same as the main dashboard login. Works on
      // any device/origin since it isn't tied to this browser's localStorage.
      const authEmail = typed.includes('@') ? typed : `${typed}@billcollector.local`;
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password: loginPass });
      if (authError || !data?.user) {
        setLoginError('Username ya password ghalat hai.');
        return;
      }
      const loginUsername = typed.includes('@') ? typed.split('@')[0] : typed;
      setActiveSession(loginUsername);
      setUsername(loginUsername);
      setPhase('loading');
    } catch (err: any) {
      setLoginError('Login mein masla aaya. Dobara try karein.');
    } finally {
      setLoggingIn(false);
    }
  };

  // ── LOCKED — app-open fingerprint gate (only if enabled for this account) ──
  if (phase === 'locked' && username) {
    const acc = getAccounts().find(a => a.username === username);
    return (
      <BiometricLockScreen
        username={username}
        businessName={acc?.businessName}
        onUnlock={() => { setActiveSession(username); setPhase('loading'); return true; }}
        onUsePassword={() => { setActiveSession(null); setUsername(null); setState(null); setPhase('login'); }}
      />
    );
  }

  // ── LOGIN (simple card) ───────────────────────────────────────────────────
  if (phase === 'login') {
    return (
      <div
        style={{ background: BG, height: '100dvh' }}
        className="flex flex-col items-center justify-center px-6 overflow-hidden"
      >
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-7 flex flex-col items-center gap-5">
          <Avatar size={88} />
          <div className="text-center">
            <h1 className="text-xl font-black text-slate-900">Bill Collector-BOT</h1>
            <p className="text-sm text-slate-500 mt-1">MahadNet's WhatsApp Assistant</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="w-full flex flex-col gap-3 mt-1">
            <input
              autoFocus
              type="text"
              value={loginUser}
              onChange={e => setLoginUser(e.target.value)}
              placeholder="Username"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border border-slate-200 focus:outline-none focus:border-indigo-400"
            />
            <input
              type="password"
              value={loginPass}
              onChange={e => setLoginPass(e.target.value)}
              placeholder="Password"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border border-slate-200 focus:outline-none focus:border-indigo-400"
            />
            {loginError && <p className="text-rose-500 text-xs px-1">{loginError}</p>}
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold mt-1 shadow-sm active:scale-95 transition-all"
            >
              {loggingIn ? 'Logging in…' : 'Log In'}
            </button>
          </form>

          {biometricAccount && (
            <button
              type="button"
              onClick={() => setPhase('locked')}
              className="text-[11px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-wider transition-colors -mt-1"
            >
              Try Fingerprint Instead
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── LOADING ──────────────────────────────────────────────────────────
  if (phase === 'loading' || (phase === 'ready' && !state)) {
    return (
      <div style={{ background: BG, height: '100dvh' }} className="flex flex-col items-center justify-center gap-4 overflow-hidden">
        <Avatar size={64} />
        <p className="text-slate-400 text-xs uppercase tracking-widest animate-pulse">Loading Bill Collector-BOT…</p>
      </div>
    );
  }

  // ── ERROR ───────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div style={{ background: BG, height: '100dvh' }} className="flex flex-col items-center justify-center gap-4 px-8 text-center overflow-hidden">
        <Avatar size={64} />
        <p className="text-slate-500 text-sm">{errorMsg}</p>
        <button
          onClick={() => setPhase('loading')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── READY — full-screen WABot chat ───────────────────────────────────────
  if (!state) return null;

  const activeCompany = (state.companies || []).find(c => c.id === state.activeCompanyId) || state.companies?.[0];
  const botName = activeCompany?.settings?.ayeshaBotName || state.settings?.ayeshaBotName || 'Bill Collector-BOT';
  const routerCatalog: RouterCatalog | undefined = activeCompany?.settings?.routerCatalog || state.settings?.routerCatalog;
  const botTemplates: Record<string, BotTemplate> | undefined = activeCompany?.settings?.botTemplates || state.settings?.botTemplates;
  const filteredUsers = (state.users || []).filter(u => !u.companyId || u.companyId === activeCompany?.id);

  const handleUpdateBotName = (name: string) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), ayeshaBotName: name } as any;
      const newCompanies = (prev.companies || []).map(c =>
        c.id === (prev.activeCompanyId || c.id) ? { ...c, settings: newSettings } : c
      );
      const newState: AppState = { ...prev, settings: newSettings, companies: newCompanies };
      saveState(newState);
      saveStateToSupabase(username || 'mahadnet', newState);
      return newState;
    });
  };

  const handleUpdateRouterCatalog = (catalog: RouterCatalog) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), routerCatalog: catalog } as any;
      const newCompanies = (prev.companies || []).map(c =>
        c.id === (prev.activeCompanyId || c.id) ? { ...c, settings: newSettings } : c
      );
      const newState: AppState = { ...prev, settings: newSettings, companies: newCompanies };
      saveState(newState);
      saveStateToSupabase(username || 'mahadnet', newState);
      return newState;
    });
  };

  const handleUpdateBotTemplates = (templates: Record<string, BotTemplate>) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), botTemplates: templates } as any;
      const newCompanies = (prev.companies || []).map(c =>
        c.id === (prev.activeCompanyId || c.id) ? { ...c, settings: newSettings } : c
      );
      const newState: AppState = { ...prev, settings: newSettings, companies: newCompanies };
      saveState(newState);
      saveStateToSupabase(username || 'mahadnet', newState);
      return newState;
    });
  };

  const handleLogout = () => {
    setActiveSession(null);
    setUsername(null);
    setState(null);
    setLoginUser('');
    setLoginPass('');
    setPhase('login');
  };

  // Security gate for enrollment: must re-confirm the account password (checked
  // against Supabase Auth) before this device's fingerprint gets registered —
  // mirrors the main dashboard's Settings > Fingerprint Login flow.
  const handleConfirmEnrollBiometric = async () => {
    if (!username || !biometricConfirmPassword) { setBiometricEnrollError('Password enter karein'); return; }
    setBiometricEnrollLoading(true);
    setBiometricEnrollError('');
    try {
      const localAccounts = getAccounts();
      const localMatch = localAccounts.find(a => a.username === username && a.password === biometricConfirmPassword);
      let verified = !!localMatch;
      let verifiedEmail = localMatch?.email || '';

      if (!verified) {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email;
        if (email) {
          const { error: authError } = await supabase.auth.signInWithPassword({ email, password: biometricConfirmPassword });
          if (!authError) { verified = true; verifiedEmail = email; }
        }
      }

      if (!verified) { setBiometricEnrollError('Password ghalat hai'); return; }

      const existing = localAccounts.find(a => a.username === username);
      saveAccount({
        username,
        password: biometricConfirmPassword,
        businessName: existing?.businessName || username,
        email: existing?.email || verifiedEmail || '',
        phone: existing?.phone || '',
        role: existing?.role,
        managerUsername: existing?.managerUsername || '',
        createdAt: existing?.createdAt || new Date().toISOString(),
        rememberPassword: true,
      });

      const registered = await registerBiometric(username);
      if (!registered) { setBiometricEnrollError('Device ne fingerprint register nahi kiya.'); return; }

      setShowBiometricEnroll(false);
      setBiometricConfirmPassword('');
    } finally {
      setBiometricEnrollLoading(false);
    }
  };

  return (
    <div style={{ height: '100dvh' }} className="w-full flex flex-col bg-slate-50 overflow-hidden relative">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <Avatar size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-900 truncate">{botName}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">MahadNet WABot</p>
        </div>
        {biometricAvailable && (
          <button
            onClick={() => { setBiometricEnrollError(''); setBiometricConfirmPassword(''); setShowBiometricEnroll(true); }}
            title="Fingerprint Login"
            className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl active:scale-95 transition-all ${isBiometricRegistered(username || '') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
          >
            <FingerprintIcon className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={handleLogout}
          title="Log out"
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 5v1a3 3 0 01-3 3H5a3 3 0 01-3-3v-5a3 3 0 013-3h4a3 3 0 013 3v1z"></path></svg>
        </button>
      </div>
      {showBiometricEnroll && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => { setShowBiometricEnroll(false); setBiometricConfirmPassword(''); setBiometricEnrollError(''); }}>
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <FingerprintIcon className="w-6 h-6 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Fingerprint Login {isBiometricRegistered(username || '') ? 'Setting' : 'Enroll Karein'}</h3>
            </div>
            {isBiometricRegistered(username || '') ? (
              <>
                <p className="text-xs text-slate-500 mb-4">Is device par fingerprint login ON hai.</p>
                <button
                  onClick={() => { removeBiometric(username || ''); setShowBiometricEnroll(false); }}
                  className="w-full bg-rose-50 text-rose-600 py-3 rounded-xl font-semibold text-sm active:scale-95 transition-all"
                >
                  Fingerprint Login Disable Karein
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3">Security ke liye pehle apna current password confirm karein — is k baad device fingerprint mangega.</p>
                <input
                  type="password"
                  value={biometricConfirmPassword}
                  onChange={e => setBiometricConfirmPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border border-slate-200 focus:outline-none focus:border-indigo-400 mb-2"
                />
                {biometricEnrollError && <p className="text-rose-500 text-xs mb-2">{biometricEnrollError}</p>}
                <button
                  onClick={handleConfirmEnrollBiometric}
                  disabled={biometricEnrollLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-sm active:scale-95 transition-all"
                >
                  {biometricEnrollLoading ? 'Verifying…' : 'Confirm & Enroll'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 min-w-0 w-full overflow-hidden">
        <WABotInbox
          managerId={username || 'mahadnet'}
          customers={filteredUsers}
          onOpenReceiptGenerator={() => {}}
          botName={botName}
          onUpdateBotName={handleUpdateBotName}
          routerCatalog={routerCatalog}
          onUpdateRouterCatalog={handleUpdateRouterCatalog}
          botTemplates={botTemplates}
          onUpdateBotTemplates={handleUpdateBotTemplates}
        />
      </div>
    </div>
  );
}
