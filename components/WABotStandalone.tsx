import React, { useEffect, useState } from 'react';
import { AppState, RouterCatalog, BotTemplate } from '../types';
import { getAccounts, getActiveSession, loadState, saveAccount, saveState, setActiveSession } from '../utils/storage';
import { saveStateToSupabase, smartLoadAndSync } from '../utils/supabaseSync';
import { subscribeToPush } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import WABotInbox from './WABotInbox';
import { isBiometricAvailable, isBiometricRegistered, registerBiometric, verifyBiometric } from '../utils/webauthn';

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

type Phase = 'login' | 'loading' | 'ready' | 'error';

export default function WABotStandalone() {
  const [phase, setPhase] = useState<Phase>('login');
  const [username, setUsername] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
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

  // Skip straight past login if a session already exists (WhatsApp-style "stay logged in")
  useEffect(() => {
    const session = getActiveSession();
    if (session) {
      setUsername(session);
      setPhase('loading');
    }
    isBiometricAvailable().then(setBiometricAvailable);
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
        if (enableBiometric && biometricAvailable) { try { await registerBiometric(localFound.username); } catch { /* non-fatal */ } }
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
      if (enableBiometric && biometricAvailable) {
        // Save the account locally too (mirrors main app's "Remember Me") so the
        // fingerprint fast-path has a password to use next time.
        try {
          if (!getAccounts().some(a => a.username === loginUsername)) {
            saveAccount({ username: loginUsername, password: loginPass, businessName: loginUsername, email: data.user.email || '', phone: '', role: 'manager', managerUsername: '', createdAt: new Date().toISOString(), rememberPassword: true });
          }
          await registerBiometric(loginUsername);
        } catch { /* non-fatal */ }
      }
      setActiveSession(loginUsername);
      setUsername(loginUsername);
      setPhase('loading');
    } catch (err: any) {
      setLoginError('Login mein masla aaya. Dobara try karein.');
    } finally {
      setLoggingIn(false);
    }
  };

  // Fingerprint quick-login using the first biometric-enabled saved account on this device.
  const handleBiometricLogin = async () => {
    if (!biometricAccount) return;
    setBiometricBusy(true);
    setLoginError('');
    try {
      const verified = await verifyBiometric(biometricAccount.username);
      if (!verified) { setLoginError('Fingerprint verify nahi hua.'); return; }
      setActiveSession(biometricAccount.username);
      setUsername(biometricAccount.username);
      setPhase('loading');
    } finally {
      setBiometricBusy(false);
    }
  };

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
            {biometricAvailable && (
              <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                <input type="checkbox" checked={enableBiometric} onChange={e => setEnableBiometric(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                <FingerprintIcon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-semibold text-slate-500">Enable Fingerprint Login</span>
              </label>
            )}
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
              onClick={handleBiometricLogin}
              disabled={biometricBusy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-50"
            >
              <FingerprintIcon className="w-4 h-4" />
              {biometricBusy ? 'Verifying…' : `Login as ${biometricAccount.username} with Fingerprint`}
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

  return (
    <div style={{ height: '100dvh' }} className="w-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <Avatar size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-900 truncate">{botName}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">MahadNet WABot</p>
        </div>
        <button
          onClick={handleLogout}
          title="Log out"
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 5v1a3 3 0 01-3 3H5a3 3 0 01-3-3v-5a3 3 0 013-3h4a3 3 0 013 3v1z"></path></svg>
        </button>
      </div>
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
