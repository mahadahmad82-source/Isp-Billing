import React, { useEffect, useState } from 'react';
import { AppState, RouterCatalog, BotTemplate } from '../types';
import { getAccounts, getActiveSession, loadState, saveAccount, saveState, setActiveSession } from '../utils/storage';
import { saveStateToSupabase, smartLoadAndSync } from '../utils/supabaseSync';
import { subscribeToPush } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import WABotInbox from './WABotInbox';

// ── Shared gradient-ring avatar (NetBot brand mark) ─────────────────────────
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

type Phase = 'login' | 'loading' | 'ready' | 'error';

export default function WABotStandalone() {
  const [phase, setPhase] = useState<Phase>('login');
  const [username, setUsername] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

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

  // Skip straight past login if a session already exists (WhatsApp-style "stay logged in").
  useEffect(() => {
    const session = getActiveSession();
    if (session) {
      setUsername(session);
      setPhase('loading');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'loading' || !username) return;
    (async () => {
      try {
        const account = getAccounts().find(a => a.username === username);
        // BUG FIX: this used to call smartLoadAndSync(username, ...) directly
        // — for a sub-manager, `username` is their own agent login (e.g.
        // "agent_xyz"), which has NO manager_data row of its own. Sub-manager
        // data lives under their manager's row. That meant the "remote"
        // fetch found nothing and this silently fell back to whatever stale
        // local cache happened to be on that device — the exact "sub-manager
        // sees cached data" bug. Resolve the real data owner first, and force
        // a real-time-only pull (no local merge/push-back) for sub-managers,
        // same fix as the main App.tsx login path.
        const dataOwner = (account?.role === 'sub-manager' && account.managerUsername) ? account.managerUsername : username;
        const local = loadState(username);
        const merged = await smartLoadAndSync(dataOwner, local, { forceRemote: account?.role === 'sub-manager' });

        if (account?.role === 'sub-manager' && account.managerUsername) {
          const allowed = await checkWabotAccess(account.managerUsername, account.username);
          if (!allowed) {
            setErrorMsg('Aapko WABot access nahi diya gaya. Apne manager se rabta karein.');
            setPhase('error');
            return;
          }
        }

        setState(merged);
        setPhase('ready');
        subscribeToPush(username, 'wabot').catch(() => {});
      } catch (e: any) {
        console.error('[WABotStandalone load]', e?.message);
        setErrorMsg('Data load nahi ho saka. Dobara try karein.');
        setPhase('error');
      }
    })();
  }, [phase, username]);

  const [loggingIn, setLoggingIn] = useState(false);

  // This standalone /wabot route had NO permission gate at all — unlike the
  // main App.tsx, which fully excludes sub-managers from the WABot tab. A
  // sub-manager logging in here (via the local-cache fast path) got full,
  // unrestricted WABot access regardless of their accessRights.wabot setting.
  const checkWabotAccess = async (managerId: string, agentUsername: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_agent_permission', {
        p_manager_id: managerId,
        p_agent_username: agentUsername,
        p_module: 'wabot',
        p_action: 'view',
      });
      if (error) { console.error('[checkWabotAccess]', error.message); return false; }
      return data === true;
    } catch (e: any) {
      console.error('[checkWabotAccess]', e?.message);
      return false;
    }
  };

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
      const authEmail = typed.includes('@') ? typed : `${typed}@myisp.local`;
      let { data, error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password: loginPass });
      if ((authError || !data?.user) && !typed.includes('@')) {
        // BUG FIX: the manager's actual Supabase Auth account isn't always
        // registered under the synthetic username@myisp.local pattern — some
        // accounts (e.g. mahadnet's own login) were created with a real email
        // instead. The main web Login.tsx already handles this via the
        // resolve_login_email RPC; this standalone login never had that
        // fallback, so a 100% correct username+password always failed with
        // "incorrect" here even though the same credentials work fine on the
        // main dashboard.
        const { data: resolvedEmail } = await supabase.rpc('resolve_login_email', { p_identifier: typed });
        if (resolvedEmail) {
          const retry = await supabase.auth.signInWithPassword({ email: resolvedEmail, password: loginPass });
          data = retry.data;
          authError = retry.error;
        }
      }
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
    <div style={{ height: '100dvh' }} className="w-full flex flex-col bg-slate-50 overflow-hidden relative">
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
          managerId={state.currentManager || username || 'mahadnet'}
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

