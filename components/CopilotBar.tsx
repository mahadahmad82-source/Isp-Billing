import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UserRecord, CopilotLogEntry } from '../types';

interface CopilotReply {
  action: 'open_tab' | 'customer_lookup' | 'generate_receipt' | 'set_status' | 'summary' | 'unclear';
  tab?: string;
  customerName?: string;
  amount?: number;
  note?: string;
  status?: 'active' | 'suspended';
  metric?: string;
  reply?: string;
}

interface CopilotBarProps {
  users: UserRecord[];
  onOpenTab: (tab: string) => void;
  /** Opens ReceiptGenerator pre-filled. The manager still confirms/saves — a
   * voice/text command never creates a receipt on its own. */
  onPrepareReceipt: (userId: string, opts?: { amount?: number; note?: string }) => void;
  /** Enable/disable a customer. Must go through the app's dual-save handler. */
  onSetUserStatus?: (userId: string, status: 'active' | 'suspended') => void;
  /** False for sub-managers (status control is explicit opt-in for them). */
  canChangeStatus?: boolean;
  /** Persisted conversation log (dual-saved by the parent like the rest of AppState). */
  history?: CopilotLogEntry[];
  onHistoryChange?: (log: CopilotLogEntry[]) => void;
}

const MAX_HISTORY = 50;
const POS_KEY = 'copilot_pos_v1';
const VOICE_KEY = 'copilot_voice_reply_v1';
const FAB = 56;

// UI preferences only (widget position / voice-reply toggle) — not business
// data, so they intentionally live in localStorage alone, not in AppState.
const panelSize = () => ({
  w: Math.min(384, window.innerWidth - 16),
  h: Math.min(Math.round(window.innerHeight * 0.7), 480),
});
const clampPos = (x: number, y: number, w: number, h: number) => ({
  x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
  y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8)),
});
const loadPos = () => {
  try {
    const r = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (r && typeof r.x === 'number' && typeof r.y === 'number') return clampPos(r.x, r.y, FAB, FAB);
  } catch { /* ignore */ }
  return clampPos(20, window.innerHeight - 24 - FAB, FAB, FAB);
};

// Resolves a spoken/typed customer reference against the manager's own
// already-loaded customer list. Runs entirely client-side — no customer PII
// is ever sent to the AI classify call itself. Returns ALL plausible matches
// so callers can refuse to act when the reference is ambiguous.
function findCandidates(users: UserRecord[], query: string): UserRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exactUser = users.filter(u => u.username?.toLowerCase() === q);
  if (exactUser.length === 1) return exactUser;
  const exactName = users.filter(u => u.name?.toLowerCase() === q);
  if (exactName.length) return exactName;
  return users.filter(u =>
    (u.name && (u.name.toLowerCase().includes(q) || q.includes(u.name.toLowerCase()))) ||
    u.username?.toLowerCase().includes(q)
  );
}

// Local, zero-latency router for plain "open <tab>" commands — no LLM round
// trip. Anything with leftover words (e.g. "show Ali's receipt") falls through
// to the AI classifier.
const FAST_TABS: Array<[string, string]> = [
  ['recovery ledger', 'recoveries'], ['customer list', 'users'], ['customers', 'users'], ['customer', 'users'],
  ['users', 'users'], ['receipts', 'receipts'], ['receipt', 'receipts'], ['rasid', 'receipts'],
  ['recoveries', 'recoveries'], ['recovery', 'recoveries'], ['ledger', 'recoveries'],
  ['expiries', 'expiries'], ['expiry', 'expiries'], ['expiring', 'expiries'], ['settings', 'settings'],
  ['dashboard', 'dashboard'], ['complaints', 'complaints'], ['complaint', 'complaints'],
  ['reports', 'reports'], ['report', 'reports'], ['expenses', 'expenses'], ['expense', 'expenses'],
  ['leads', 'leads'], ['team', 'team'], ['staff', 'team'], ['analytics', 'analytics'], ['equipment', 'equipment'],
];
const FILLER = /\b(open|show|go to|goto|kholo|khol|dikhao|dikha|jao|tab|section|page|screen|ka|ki|ko|ke|the|my|list|wala|wali|please|do|karo|kr|kar|me|mein|to)\b/g;
function fastTab(text: string): string | null {
  let t = ' ' + text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (!/\b(open|show|go to|goto|kholo|khol|dikhao|dikha|jao)\b/.test(t)) return null;
  let tab: string | null = null;
  for (const [k, v] of FAST_TABS) {
    const re = new RegExp(`\\b${k}\\b`);
    if (re.test(t)) { tab = v; t = t.replace(re, ' '); break; }
  }
  if (!tab) return null;
  t = t.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  return t ? null : tab;
}

const CopilotIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2c.3 2.7 1 4.6 2.1 5.9C15.4 9 17.3 9.7 20 10c-2.7.3-4.6 1-5.9 2.1C12.7 13.4 12 15.3 12 18c-.3-2.7-1-4.6-2.1-5.9C8.6 11 6.7 10.3 4 10c2.7-.3 4.6-1 5.9-2.1C11 6.6 11.7 4.7 12 2z" />
    <path d="M19 14c.15 1.1.5 1.9 1.05 2.45.55.55 1.35.9 2.45 1.05-1.1.15-1.9.5-2.45 1.05-.55.55-.9 1.35-1.05 2.45-.15-1.1-.5-1.9-1.05-2.45C17.4 18 16.6 17.65 15.5 17.5c1.1-.15 1.9-.5 2.45-1.05.55-.55.9-1.35 1.05-2.45z" />
  </svg>
);
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'w-5 h-5' };
const MicIcon = () => (<svg {...svgProps}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>);
const SendIcon = () => (<svg {...svgProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const CloseIcon = () => (<svg {...svgProps}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
const SpeakerIcon = ({ off }: { off?: boolean }) => (<svg {...svgProps}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />{off ? (<><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>) : (<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />)}</svg>);
const LoopIcon = () => (<svg {...svgProps}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>);

export default function CopilotBar({ users, onOpenTab, onPrepareReceipt, onSetUserStatus, canChangeStatus = false, history, onHistoryChange }: CopilotBarProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<CopilotLogEntry[]>(history || []);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [voiceReply, setVoiceReply] = useState<boolean>(() => { try { return localStorage.getItem(VOICE_KEY) === '1'; } catch { return false; } });
  const [pending, setPending] = useState<{ userId: string; name: string; status: 'active' | 'suspended' } | null>(null);
  const [pos, setPos] = useState(loadPos);

  const hydratedRef = useRef(false);
  const busyRef = useRef(false);
  const posRef = useRef(pos);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const handsFreeRef = useRef(false);
  const voiceReplyRef = useRef(voiceReply);
  const viaVoiceRef = useRef(false);
  const pendingRef = useRef(pending);
  const runCommandRef = useRef<(raw: string, viaVoice?: boolean) => void>(() => {});
  const startRecordingRef = useRef<() => void>(() => {});
  const logEndRef = useRef<HTMLDivElement>(null);

  handsFreeRef.current = handsFree;
  voiceReplyRef.current = voiceReply;
  pendingRef.current = pending;
  posRef.current = pos;

  useEffect(() => {
    if (!hydratedRef.current && history && history.length > 0) {
      setLog(history);
      hydratedRef.current = true;
    }
  }, [history]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }); }, [log, pending, open]);

  useEffect(() => {
    const onResize = () => {
      const s = open ? panelSize() : { w: FAB, h: FAB };
      setPos(p => clampPos(p.x, p.y, s.w, s.h));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  useEffect(() => () => {
    recRef.current?.stop();
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  const appendLog = useCallback((entry: CopilotLogEntry) => {
    setLog(prev => {
      const next = [...prev, entry].slice(-MAX_HISTORY);
      onHistoryChange?.(next);
      return next;
    });
  }, [onHistoryChange]);

  const speak = useCallback((text: string) => {
    if (!(voiceReplyRef.current || viaVoiceRef.current || handsFreeRef.current)) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, []);

  const say = useCallback((text: string) => {
    appendLog({ from: 'copilot', text, ts: Date.now() });
    speak(text);
  }, [appendLog, speak]);

  // Hands-free loop: once the reply has finished speaking, listen again.
  // Paused while a confirmation is waiting; exits on toggle-off.
  const continueLoop = useCallback(() => {
    if (!handsFreeRef.current || pendingRef.current) return;
    const tick = () => {
      if (!handsFreeRef.current || pendingRef.current) return;
      let speaking = false;
      try { speaking = !!window.speechSynthesis?.speaking; } catch { /* ignore */ }
      if (speaking) { setTimeout(tick, 300); return; }
      startRecordingRef.current();
    };
    setTimeout(tick, 350);
  }, []);

  const runCommand = useCallback(async (raw: string, viaVoice = false) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    viaVoiceRef.current = viaVoice;
    busyRef.current = true;
    appendLog({ from: 'user', text, ts: Date.now() });
    setInput('');
    setBusy(true);
    try {
      const fast = fastTab(text);
      if (fast) {
        onOpenTab(fast);
        say(`Opened ${fast}.`);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        say('Your session expired — please log in again.');
        return;
      }
      const recentHistory = log.slice(-6).map(h => ({ from: h.from, text: h.text }));
      const res = await fetch('/api/admin-maintenance?action=copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ command: text, history: recentHistory }),
      });
      const data: CopilotReply = await res.json();

      const resolve = (): UserRecord | null => {
        const c = findCandidates(users, data.customerName || '');
        if (c.length === 0) { say(`Couldn't find a customer named "${data.customerName || text}".`); return null; }
        if (c.length > 1) {
          const names = c.slice(0, 3).map(u => u.name).join(', ');
          say(`Multiple customers match (${names}${c.length > 3 ? ', …' : ''}) — please be more specific.`);
          return null;
        }
        return c[0];
      };

      if (data.action === 'open_tab' && data.tab) {
        onOpenTab(data.tab);
        say(data.reply || `Opened ${data.tab}.`);
      } else if (data.action === 'customer_lookup') {
        const customer = resolve();
        if (customer) {
          say(`${customer.name} — ${customer.plan}, Rs.${customer.monthlyFee}/month, Balance: Rs.${customer.balance}, Expiry: ${customer.expiryDate}, Status: ${customer.status}`);
        }
      } else if (data.action === 'generate_receipt') {
        const customer = resolve();
        if (customer) {
          onPrepareReceipt(customer.id, { amount: data.amount, note: data.note });
          say(`Opened the Receipt tab for ${customer.name}${data.amount ? ` with Rs.${data.amount}` : ''} — confirm and save when ready.`);
        }
      } else if (data.action === 'set_status' && data.status) {
        if (!canChangeStatus || !onSetUserStatus) {
          say('Changing customer status needs manager access.');
        } else {
          const customer = resolve();
          if (customer) {
            if (customer.status === 'deleted') {
              say(`${customer.name} is deleted — status can't be changed.`);
            } else if (customer.status === data.status) {
              say(`${customer.name} is already ${data.status === 'suspended' ? 'disabled' : 'active'}.`);
            } else {
              setPending({ userId: customer.id, name: customer.name, status: data.status });
              say(`Confirm: ${data.status === 'suspended' ? 'disable' : 'enable'} ${customer.name}? Tap Confirm below.`);
            }
          }
        }
      } else if (data.action === 'summary') {
        const live = users.filter(u => u.status !== 'deleted');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = (u: UserRecord) => {
          const e = new Date(u.expiryDate); if (isNaN(e.getTime())) return null;
          e.setHours(0, 0, 0, 0);
          return Math.ceil((e.getTime() - today.getTime()) / 86400000);
        };
        let msg = '';
        switch (data.metric) {
          case 'total_customers': msg = `Total customers: ${live.length}.`; break;
          case 'active': msg = `Active customers: ${live.filter(u => u.status === 'active').length}.`; break;
          case 'suspended': msg = `Disabled customers: ${live.filter(u => u.status === 'suspended').length}.`; break;
          case 'expired': msg = `Expired customers: ${live.filter(u => { const d = days(u); return d !== null && d < 0; }).length}.`; break;
          case 'expiring_today': msg = `Expiring today: ${live.filter(u => days(u) === 0).length}.`; break;
          case 'total_balance': msg = `Total outstanding balance: Rs.${live.reduce((s, u) => s + (Number(u.balance) || 0), 0)}.`; break;
          default: msg = data.reply || "Sorry, I didn't understand that.";
        }
        say(msg);
      } else {
        say(data.reply || "Sorry, I didn't understand that. Please try again.");
      }
    } catch {
      say('Something went wrong — please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      continueLoop();
    }
  }, [users, onOpenTab, onPrepareReceipt, onSetUserStatus, canChangeStatus, log, appendLog, say, continueLoop]);
  runCommandRef.current = runCommand;

  const confirmPending = () => {
    const p = pendingRef.current;
    if (!p || !onSetUserStatus || !canChangeStatus) return;
    onSetUserStatus(p.userId, p.status);
    setPending(null);
    say(`Done — ${p.name} ${p.status === 'suspended' ? 'disabled' : 'enabled'}.`);
    continueLoop();
  };
  const cancelPending = () => {
    setPending(null);
    say('Cancelled.');
    continueLoop();
  };

  // Push-to-talk: tap the mic, speak, it stops itself after a short silence
  // (or tap again to stop). Audio goes to the same Gemini/Whisper transcriber
  // the Android app uses, so Urdu script / Roman Urdu / mixed speech works —
  // the browser Web Speech API only did en-US.
  const startRecording = useCallback(async () => {
    if (recRef.current || busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof (window as any).MediaRecorder === 'undefined') {
      say('Voice input is not supported on this browser.');
      setHandsFree(false);
      return;
    }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      say('Microphone permission was denied.');
      setHandsFree(false);
      return;
    }
    const MR = (window as any).MediaRecorder;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MR.isTypeSupported?.(m)) || '';
    const rec: MediaRecorder = new MR(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e: BlobEvent) => { if (e.data.size) chunks.push(e.data); };

    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext | null = AC ? new AC() : null;
    let analyser: AnalyserNode | null = null;
    if (ctx) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
    }
    const buf = new Uint8Array(1024);
    let heard = false, silentSince = 0;
    const startedAt = Date.now();
    const stop = () => { if (rec.state !== 'inactive') rec.stop(); };
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (analyser) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.04) { heard = true; silentSince = 0; }
        else if (heard) { if (!silentSince) silentSince = now; else if (now - silentSince > 1400) stop(); }
        else if (now - startedAt > 6000) stop();
      }
      if (now - startedAt > 15000) stop();
    }, 100);

    rec.onstop = async () => {
      clearInterval(timer);
      stream.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => {});
      recRef.current = null;
      setListening(false);
      // With no analyser (very old browsers) we can't tell silence from speech — send anyway.
      if ((analyser && !heard) || !chunks.length) {
        if (handsFreeRef.current) setHandsFree(false);
        return;
      }
      setTranscribing(true);
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const b64: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(',')[1] || '');
          r.onerror = () => reject(new Error('read failed'));
          r.readAsDataURL(blob);
        });
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { say('Your session expired — please log in again.'); return; }
        const res = await fetch('/api/admin-maintenance?action=copilot-transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ audioBase64: b64, mimeType: (blob.type || 'audio/webm').split(';')[0] }),
        });
        const data = await res.json();
        setTranscribing(false);
        if (data?.transcript) runCommandRef.current(String(data.transcript), true);
        else { say("Couldn't hear that clearly — please try again."); if (handsFreeRef.current) setHandsFree(false); }
      } catch {
        say('Voice transcription failed — please try again.');
        if (handsFreeRef.current) setHandsFree(false);
      } finally {
        setTranscribing(false);
      }
    };

    recRef.current = { stop };
    setListening(true);
    rec.start();
  }, [say]);
  startRecordingRef.current = startRecording;

  const toggleMic = () => {
    if (recRef.current) recRef.current.stop();
    else startRecording();
  };
  const toggleHandsFree = () => {
    const next = !handsFreeRef.current;
    setHandsFree(next);
    handsFreeRef.current = next;
    if (next) startRecording();
    else recRef.current?.stop();
  };
  const toggleVoiceReply = () => {
    const next = !voiceReply;
    setVoiceReply(next);
    try { localStorage.setItem(VOICE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (!next) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
  };

  // ── Drag (FAB and panel header share the same handlers) ──
  const dragStart = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false };
  };
  const dragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const s = open ? panelSize() : { w: FAB, h: open ? 56 : FAB };
    const np = clampPos(d.ox + dx, d.oy + dy, s.w, open ? 56 : s.h);
    posRef.current = np;
    setPos(np);
  };
  const dragEnd = (): boolean => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) { try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ } }
    return !!d?.moved;
  };

  const openPanel = () => {
    const s = panelSize();
    const np = clampPos(posRef.current.x, posRef.current.y, s.w, s.h);
    posRef.current = np;
    setPos(np);
    try { localStorage.setItem(POS_KEY, JSON.stringify(np)); } catch { /* ignore */ }
    setOpen(true);
  };
  const closePanel = () => {
    recRef.current?.stop();
    setHandsFree(false);
    handsFreeRef.current = false;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const np = clampPos(posRef.current.x, posRef.current.y, FAB, FAB);
    posRef.current = np;
    setPos(np);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={() => { if (!dragEnd()) openPanel(); }}
        onPointerCancel={() => { dragEnd(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPanel(); }}
        aria-label="Copilot"
        style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
        className="fixed z-[9999] flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-2xl shadow-indigo-600/30 cursor-grab active:cursor-grabbing select-none"
      >
        <CopilotIcon />
      </button>
    );
  }

  const ps = panelSize();
  return (
    <div
      className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: ps.w, height: ps.h }}
    >
      <div
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={() => { dragEnd(); }}
        onPointerCancel={() => { dragEnd(); }}
        style={{ touchAction: 'none' }}
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <CopilotIcon /> Copilot
        </div>
        <div className="flex items-center gap-3" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={toggleHandsFree} aria-label="Hands-free mode" title="Hands-free" className={handsFree ? 'text-yellow-300' : 'text-white/80'}><LoopIcon /></button>
          <button onClick={toggleVoiceReply} aria-label="Voice reply" title="Voice reply" className={voiceReply ? 'text-yellow-300' : 'text-white/80'}><SpeakerIcon off={!voiceReply} /></button>
          <button onClick={closePanel} aria-label="Close"><CloseIcon /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm" style={{ minHeight: '80px' }}>
        {log.length === 0 && (
          <p className="text-gray-400 text-xs">
            e.g. "open customer list", "Ali ka balance batao", "Sara ki receipt 1500 ki banao", "Ali ko disable karo". Tap the mic to speak in Urdu, Roman Urdu or English.
          </p>
        )}
        {log.map((entry, i) => (
          <div key={i} className={entry.from === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block px-3 py-2 rounded-xl max-w-[85%] text-left ${entry.from === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 dark:text-gray-100'}`}>
              {entry.text}
            </span>
          </div>
        ))}
        {pending && (
          <div className="flex gap-2">
            <button onClick={confirmPending} className="px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-bold">Confirm</button>
            <button onClick={cancelPending} className="px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 dark:text-gray-100 text-xs font-bold">Cancel</button>
          </div>
        )}
        {busy && <p className="text-gray-400 text-xs">Thinking...</p>}
        {listening && <p className="text-red-500 text-xs animate-pulse">Listening...</p>}
        {transcribing && <p className="text-gray-400 text-xs">Transcribing...</p>}
        <div ref={logEndRef} />
      </div>
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runCommand(input); }}
          placeholder="Type a command..."
          className="flex-1 min-w-0 px-3 py-2 rounded-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={toggleMic}
          disabled={transcribing}
          aria-label="Voice"
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors shrink-0 disabled:opacity-40 ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
        >
          <MicIcon />
        </button>
        <button
          onClick={() => runCommand(input)}
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40 shrink-0"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
