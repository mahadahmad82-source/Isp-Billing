import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AppState, RouterCatalog, BotTemplate } from '../types';
import { getAccounts, getActiveSession, loadState, saveAccount, saveState, setActiveSession } from '../utils/storage';
import { saveStateToSupabase, smartLoadAndSync } from '../utils/supabaseSync';
import { subscribeToPush } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import WABotInbox from './WABotInbox';

// ── Shared brand mark (same PNG that ships as the NetBot Android app icon /
// PWA icon — keeping this one real asset instead of a hand-redrawn SVG means
// Web and Android can never visually drift apart again) ────────────────────
const Avatar: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <img
    src="/wabot-icon-192.png"
    alt="NetBot"
    width={size}
    height={size}
    style={{ width: size, height: size }}
    className="rounded-full shadow-xl shrink-0 object-cover"
  />
);

// ── WhatsApp-Web-style numbered instruction row ("Scan to log in" list) ────
const StepRow: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex items-start gap-3">
    <span className="w-6 h-6 rounded-full border-2 border-slate-300 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
      {n}
    </span>
    <span className="text-sm text-slate-600 leading-relaxed">{children}</span>
  </li>
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
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const prevHref = link?.getAttribute('href') || 'manifest.json';
    const prevTitle = document.title;

    if (link) link.setAttribute('href', '/wabot-manifest.json');
    document.title = 'Bill Collector-BOT — WABot';

    return () => {
      if (link) link.setAttribute('href', prevHref);
      document.title = prevTitle;
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

  // ── QR login ("Link a Device", WhatsApp-Web style) ─────────────────────
  // NetBot Web shows the QR (this screen); the already-logged-in NetBot
  // Android app scans it (Settings → Link a Device) and approves via
  // api/wabot-pair-approve.ts. Reuses the SAME account/session that scanned
  // — never a different one — via a server-minted Supabase magic-link OTP,
  // so no password is ever exposed to this device. Real Supabase Auth
  // accounts only for now (managers + migrated sub-managers); legacy
  // (non-migrated) sub-manager agentToken accounts still use password login.
  const [loginMode, setLoginMode] = useState<'password' | 'qr'>('qr');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrStatus, setQrStatus] = useState<'loading' | 'pending' | 'expired' | 'error'>('loading');
  const [qrRegenKey, setQrRegenKey] = useState(0);

  useEffect(() => {
    if (phase !== 'login' || loginMode !== 'qr') return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      setQrStatus('loading');
      setQrDataUrl('');
      try {
        const r = await fetch('/api/wabot-pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        });
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok || !d?.token) { setQrStatus('error'); return; }

        const dataUrl = await QRCode.toDataURL(d.token, { margin: 1, width: 264, errorCorrectionLevel: 'H' });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        setQrStatus('pending');

        const expiresAt = new Date(d.expiresAt).getTime();
        pollTimer = setInterval(async () => {
          if (Date.now() > expiresAt) {
            if (pollTimer) clearInterval(pollTimer);
            if (!cancelled) setQrStatus('expired');
            return;
          }
          try {
            const pr = await fetch('/api/wabot-pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'poll', token: d.token }),
            });
            const pd = await pr.json();
            if (cancelled) return;
            if (pd.status === 'approved' && pd.tokenHash) {
              if (pollTimer) clearInterval(pollTimer);
              const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
                token_hash: pd.tokenHash,
                type: 'magiclink',
              });
              if (verifyErr || !verifyData?.user) { setQrStatus('error'); return; }
              setActiveSession(pd.username);
              setUsername(pd.username);
              setPhase('loading');
            } else if (pd.status === 'expired') {
              if (pollTimer) clearInterval(pollTimer);
              setQrStatus('expired');
            }
          } catch { /* one failed poll shouldn't kill the flow — try again in 2s */ }
        }, 2000);
      } catch {
        if (!cancelled) setQrStatus('error');
      }
    })();

    return () => { cancelled = true; if (pollTimer) clearInterval(pollTimer); };
  }, [phase, loginMode, qrRegenKey]);

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

  // ── LOGIN — WhatsApp-Web style: opens straight into "Scan to log in" ──────
  if (phase === 'login') {
    return (
      <div
        style={{ background: BG, minHeight: '100dvh' }}
        className="flex flex-col items-center px-4 sm:px-6 py-8 overflow-y-auto"
      >
        {/* Small brand row, top-left like whatsapp.com/download */}
        <div className="w-full max-w-3xl flex items-center gap-2 mb-5 px-1">
          <Avatar size={30} />
          <span className="text-[15px] font-bold text-slate-700">NetBot Web</span>
        </div>

        <div
          className={`w-full bg-white rounded-3xl shadow-xl transition-all ${
            loginMode === 'qr' ? 'max-w-3xl p-6 sm:p-10' : 'max-w-sm p-7'
          }`}
        >
          {loginMode === 'qr' ? (
            <div className="flex flex-col-reverse sm:flex-row items-center gap-8 sm:gap-10">
              {/* Steps */}
              <div className="flex-1 w-full flex flex-col gap-5">
                <h1 className="text-2xl font-black text-slate-900">Scan to log in</h1>
                <ol className="space-y-4">
                  <StepRow n={1}>NetBot Android app kholein</StepRow>
                  <StepRow n={2}>
                    Settings mein jaake <span className="font-bold text-slate-800">Link a Device</span> par tap karein
                  </StepRow>
                  <StepRow n={3}>Apne phone se is QR code ko point karke scan karein</StepRow>
                </ol>
                {loginError && <p className="text-rose-500 text-xs">{loginError}</p>}
                <button
                  type="button"
                  onClick={() => setLoginMode('password')}
                  className="text-sm text-indigo-600 font-semibold self-start"
                >
                  Username &amp; password se login karein
                </button>
              </div>

              {/* QR box */}
              <div className="flex-shrink-0 flex flex-col items-center gap-3">
                <div className="w-[220px] h-[220px] sm:w-[264px] sm:h-[264px] relative flex items-center justify-center bg-white rounded-2xl border-2 border-slate-100 overflow-hidden">
                  {qrStatus === 'pending' && qrDataUrl && (
                    <>
                      <img src={qrDataUrl} alt="QR" className="w-full h-full" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Avatar size={40} />
                      </div>
                    </>
                  )}
                  {qrStatus === 'loading' && (
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                      <p className="text-xs text-slate-400">QR ban raha hai…</p>
                    </div>
                  )}
                  {(qrStatus === 'expired' || qrStatus === 'error') && (
                    <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-3 px-4 text-center">
                      <p className="text-xs text-rose-500 font-semibold">
                        {qrStatus === 'expired' ? 'QR expire ho gaya' : 'Masla aa gaya'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setQrRegenKey(k => k + 1)}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg font-semibold active:scale-95 transition-all"
                      >
                        Dobara try karein
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <Avatar size={72} />
              <div className="text-center">
                <h1 className="text-xl font-black text-slate-900">Bill Collector-BOT</h1>
                <p className="text-sm text-slate-500 mt-1">MahadNet's WhatsApp Assistant</p>
              </div>
              <form onSubmit={handleLoginSubmit} className="w-full flex flex-col gap-3">
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
              <button
                type="button"
                onClick={() => { setLoginError(''); setQrRegenKey(k => k + 1); setLoginMode('qr'); }}
                className="text-xs text-indigo-600 font-medium"
              >
                QR code se login karein
              </button>
            </div>
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
  const botName = activeCompany?.settings?.ayeshaBotName || state.settings?.ayeshaBotName || 'NetBot';
  const routerCatalog: RouterCatalog | undefined = activeCompany?.settings?.routerCatalog || state.settings?.routerCatalog;
  const botTemplates: Record<string, BotTemplate> | undefined = activeCompany?.settings?.botTemplates || state.settings?.botTemplates;
  const botPersonaNotes: string | undefined = (activeCompany?.settings as any)?.botPersonaNotes || (state.settings as any)?.botPersonaNotes;
  const botBehaviorRules: any[] | undefined = (activeCompany?.settings as any)?.botBehaviorRules || (state.settings as any)?.botBehaviorRules;
  const ttsVoice: string | undefined = (activeCompany?.settings as any)?.ttsVoice || (state.settings as any)?.ttsVoice;
  const wabotAgents: any[] | undefined = (activeCompany?.settings as any)?.wabotAgents || (state.settings as any)?.wabotAgents;
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

  const handleUpdateBotPersonaNotes = (notes: string) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), botPersonaNotes: notes } as any;
      const newCompanies = (prev.companies || []).map(c =>
        c.id === (prev.activeCompanyId || c.id) ? { ...c, settings: newSettings } : c
      );
      const newState: AppState = { ...prev, settings: newSettings, companies: newCompanies };
      saveState(newState);
      saveStateToSupabase(username || 'mahadnet', newState);
      return newState;
    });
  };

  const handleUpdateBotBehaviorRules = (rules: any[]) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), botBehaviorRules: rules } as any;
      const newCompanies = (prev.companies || []).map(c =>
        c.id === (prev.activeCompanyId || c.id) ? { ...c, settings: newSettings } : c
      );
      const newState: AppState = { ...prev, settings: newSettings, companies: newCompanies };
      saveState(newState);
      saveStateToSupabase(username || 'mahadnet', newState);
      return newState;
    });
  };

  const handleUpdateTtsVoice = (voice: string) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), ttsVoice: voice } as any;
      const newCompanies = (prev.companies || []).map(c =>
        c.id === (prev.activeCompanyId || c.id) ? { ...c, settings: newSettings } : c
      );
      const newState: AppState = { ...prev, settings: newSettings, companies: newCompanies };
      saveState(newState);
      saveStateToSupabase(username || 'mahadnet', newState);
      return newState;
    });
  };

  const handleUpdateWabotAgents = (agents: any[]) => {
    setState(prev => {
      if (!prev) return prev;
      const newSettings = { ...(activeCompany?.settings || prev.settings), wabotAgents: agents } as any;
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
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">MahadNet NetBot</p>
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
          botPersonaNotes={botPersonaNotes}
          onUpdateBotPersonaNotes={handleUpdateBotPersonaNotes}
          botBehaviorRules={botBehaviorRules}
          onUpdateBotBehaviorRules={handleUpdateBotBehaviorRules}
          ttsVoice={ttsVoice}
          onUpdateTtsVoice={handleUpdateTtsVoice}
          wabotAgents={wabotAgents}
          onUpdateWabotAgents={handleUpdateWabotAgents}
          theme={state?.theme || (document.documentElement.classList.contains('dark') ? 'dark' : 'light')}
          onToggleTheme={() => {
            const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            document.documentElement.classList.toggle('dark', next === 'dark');
            if (state) {
              const ns = { ...state, theme: next };
              setState(ns);
              saveState(ns);
            }
          }}
        />
      </div>
    </div>
  );
}

