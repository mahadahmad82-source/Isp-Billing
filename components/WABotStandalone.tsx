import React, { useEffect, useRef, useState } from 'react';
import { AppState } from '../types';
import { getAccounts, getActiveSession, loadState, saveState, setActiveSession } from '../utils/storage';
import { saveStateToSupabase, smartLoadAndSync } from '../utils/supabaseSync';
import WABotInbox from './WABotInbox';

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

type ChatLine = { from: 'bot' | 'user'; text: string };
type Phase = 'splash' | 'login' | 'loading' | 'ready' | 'error';

export default function WABotStandalone() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [username, setUsername] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [chatLog, setChatLog] = useState<ChatLine[]>([
    { from: 'bot', text: 'Hey there! 👋' },
    { from: 'bot', text: "I'm Ayesha." },
    { from: 'bot', text: "What's your username?" },
  ]);
  const [step, setStep] = useState<'username' | 'password'>('username');
  const [input, setInput] = useState('');
  const pendingUserRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Swap manifest + title while this screen is mounted, restore on unmount
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const prevHref = link?.getAttribute('href') || 'manifest.json';
    const prevTitle = document.title;
    if (link) link.setAttribute('href', '/wabot-manifest.json');
    document.title = 'Ayesha — WABot';
    return () => {
      if (link) link.setAttribute('href', prevHref);
      document.title = prevTitle;
    };
  }, []);

  // Skip straight past login if a session already exists (WhatsApp-style "stay logged in")
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
        const local = loadState(username);
        const merged = await smartLoadAndSync(username, local);
        setState(merged);
        setPhase('ready');
      } catch (e: any) {
        console.error('[WABotStandalone load]', e?.message);
        setErrorMsg('Data load nahi ho saka. Dobara try karein.');
        setPhase('error');
      }
    })();
  }, [phase, username]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatLog]);

  const handleSend = () => {
    const value = input.trim();
    if (!value) return;
    setInput('');

    if (step === 'username') {
      pendingUserRef.current = value;
      setChatLog(prev => [...prev, { from: 'user', text: value }, { from: 'bot', text: 'And your password?' }]);
      setStep('password');
      return;
    }

    // password step
    const accounts = getAccounts();
    const acc = accounts.find(
      a => a.username.toLowerCase() === pendingUserRef.current.toLowerCase() && a.password === value
    );
    if (!acc) {
      setChatLog(prev => [
        ...prev,
        { from: 'user', text: '••••••' },
        { from: 'bot', text: "That doesn't match. What's your username?" },
      ]);
      setStep('username');
      return;
    }
    setChatLog(prev => [...prev, { from: 'user', text: '••••••' }, { from: 'bot', text: `Welcome back, ${acc.businessName || acc.username}! 🎉` }]);
    setTimeout(() => {
      setActiveSession(acc.username);
      setUsername(acc.username);
      setPhase('loading');
    }, 500);
  };

  // ── SPLASH ────────────────────────────────────────────────────────────────
  if (phase === 'splash') {
    return (
      <div
        style={{ background: 'linear-gradient(180deg, #eef2f9 0%, #d7e0ee 100%)' }}
        className="min-h-screen flex flex-col items-center justify-between px-8 py-12"
      >
        <div />
        <div className="flex flex-col items-center gap-5 text-center">
          <Avatar size={128} />
          <div>
            <h1 className="text-2xl font-black text-slate-900">Ayesha</h1>
            <p className="text-sm text-slate-500 mt-1">MahadNet's WhatsApp Assistant</p>
          </div>
        </div>
        <div className="w-full max-w-xs flex flex-col items-center gap-4">
          <button
            onClick={() => setPhase('login')}
            className="w-full bg-white border-2 border-indigo-500 text-indigo-600 py-3 rounded-full font-semibold shadow-sm active:scale-95 transition-all"
          >
            Get Started
          </button>
          <button onClick={() => setPhase('login')} className="text-sm text-slate-500">
            Already have an account?{' '}
            <span className="text-indigo-600 font-semibold">Log In</span>
          </button>
        </div>
      </div>
    );
  }

  // ── LOGIN (conversational) ───────────────────────────────────────────────
  if (phase === 'login') {
    return (
      <div
        style={{ background: 'linear-gradient(180deg, #eef2f9 0%, #d7e0ee 100%)' }}
        className="min-h-screen flex flex-col"
      >
        <div className="flex items-center gap-3 px-6 pt-8 pb-4">
          <Avatar size={44} />
          <div>
            <p className="font-bold text-slate-900 text-sm">Ayesha</p>
            <p className="text-[11px] text-slate-400">MahadNet WABot</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2 flex flex-col gap-2">
          {chatLog.map((line, i) =>
            line.from === 'bot' ? (
              <div key={i} className="bg-white rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-700 shadow-sm self-start max-w-[80%]">
                {line.text}
              </div>
            ) : (
              <div key={i} className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm shadow-sm self-end max-w-[80%]">
                {line.text}
              </div>
            )
          )}
        </div>

        <div className="px-5 pb-8 pt-3 flex items-center gap-2">
          <input
            autoFocus
            type={step === 'password' ? 'password' : 'text'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={step === 'username' ? 'Username' : 'Password'}
            className="flex-1 bg-white rounded-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border border-slate-200 focus:outline-none focus:border-indigo-400 shadow-sm"
          />
          <button
            onClick={handleSend}
            className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center text-white shadow-sm active:scale-95 transition-all shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (phase === 'loading' || (phase === 'ready' && !state)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0b1120' }}>
        <Avatar size={64} />
        <p className="text-slate-400 text-xs uppercase tracking-widest animate-pulse">Loading Ayesha…</p>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: '#0b1120' }}>
        <Avatar size={64} />
        <p className="text-slate-300 text-sm">{errorMsg}</p>
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
  const botName = activeCompany?.settings?.ayeshaBotName || state.settings?.ayeshaBotName || 'Ayesha';
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

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <Avatar size={36} />
        <div>
          <p className="font-bold text-sm text-slate-900">{botName}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">MahadNet WABot</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <WABotInbox
          managerId={username || 'mahadnet'}
          customers={filteredUsers}
          onOpenReceiptGenerator={() => {}}
          botName={botName}
          onUpdateBotName={handleUpdateBotName}
        />
      </div>
    </div>
  );
}
