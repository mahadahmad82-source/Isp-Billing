import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UserRecord, CopilotLogEntry } from '../types';
import { copilotReceiptBridge } from '../utils/copilotBridge';

// Shared Copilot conversation logic — used by BOTH the floating CopilotBar
// widget and the full-screen Copilot tab so the two never drift apart.
// Neither surface sends customer PII to the AI classify call: only the raw
// command text + the last 6 turns of history go to ?action=copilot, and the
// client resolves customer records locally against its already-loaded list.

export interface CopilotReply {
  action: 'open_tab' | 'customer_lookup' | 'generate_receipt' | 'set_status' | 'summary' | 'receipt_form' | 'unclear';
  op?: 'save' | 'edit' | 'read';
  tab?: string;
  customerName?: string;
  amount?: number;
  note?: string;
  status?: 'active' | 'suspended';
  metric?: string;
  reply?: string;
}

export interface UseCopilotOptions {
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
const VOICE_KEY = 'copilot_voice_reply_v1';

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
// Exact short "save it" phrases — only honoured while a receipt form is open.
const SAVE_PHRASES = /^(please )?(save|confirm|generate)( (it|this|receipt|the receipt))?( kar do| karo| kardo| kr do)?$|^(receipt )?(save|generate) (kar do|karo|kardo|kr do)$/;
function isSavePhrase(text: string): boolean {
  return SAVE_PHRASES.test(text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim());
}

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

export function useCopilot({ users, onOpenTab, onPrepareReceipt, onSetUserStatus, canChangeStatus = false, history, onHistoryChange }: UseCopilotOptions) {
  const [input, setInput] = useState('');
  const [log, setLog] = useState<CopilotLogEntry[]>(history || []);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [voiceReply, setVoiceReply] = useState<boolean>(() => { try { return localStorage.getItem(VOICE_KEY) === '1'; } catch { return false; } });
  const [pending, setPending] = useState<{ userId: string; name: string; status: 'active' | 'suspended' } | null>(null);

  const hydratedRef = useRef(false);
  const busyRef = useRef(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const handsFreeRef = useRef(false);
  const voiceReplyRef = useRef(voiceReply);
  const viaVoiceRef = useRef(false);
  const pendingRef = useRef(pending);
  const runCommandRef = useRef<(raw: string, viaVoice?: boolean) => void>(() => {});
  const startRecordingRef = useRef<() => void>(() => {});

  handsFreeRef.current = handsFree;
  voiceReplyRef.current = voiceReply;
  pendingRef.current = pending;

  useEffect(() => {
    if (!hydratedRef.current && history && history.length > 0) {
      setLog(history);
      hydratedRef.current = true;
    }
  }, [history]);

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
      if (copilotReceiptBridge.isOpen() && isSavePhrase(text)) {
        const r = await copilotReceiptBridge.run({ type: 'save' });
        say(r.message);
        return;
      }

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
        body: JSON.stringify({ command: text, history: recentHistory, receiptFormOpen: copilotReceiptBridge.isOpen() }),
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
          say(`Opened the Receipt tab for ${customer.name}${data.amount ? ` with Rs.${data.amount}` : ''} — review it, then say "save" (or tap Generate).`);
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
      } else if (data.action === 'receipt_form' && data.op) {
        const r = await copilotReceiptBridge.run(
          data.op === 'edit' ? { type: 'edit', amount: data.amount, note: data.note } : { type: data.op }
        );
        say(r.message);
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

  /** Stops any in-flight voice work — call when the surface is hidden/closed. */
  const stopVoice = useCallback(() => {
    recRef.current?.stop();
    setHandsFree(false);
    handsFreeRef.current = false;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  return {
    log, input, setInput, busy, listening, transcribing,
    handsFree, voiceReply, pending,
    runCommand, toggleMic, toggleHandsFree, toggleVoiceReply,
    confirmPending, cancelPending, stopVoice,
  };
}

export type UseCopilotApi = ReturnType<typeof useCopilot>;
