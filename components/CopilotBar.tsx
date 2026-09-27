import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UserRecord, CopilotLogEntry } from '../types';

interface CopilotReply {
  action: 'open_tab' | 'customer_lookup' | 'generate_receipt' | 'unclear';
  tab?: string;
  customerName?: string;
  reply?: string;
}

interface CopilotBarProps {
  users: UserRecord[];
  onOpenTab: (tab: string) => void;
  onPrepareReceipt: (userId: string) => void;
  /** Persisted conversation log (dual-saved by the parent like the rest of AppState). */
  history?: CopilotLogEntry[];
  /** Called with the updated, capped log any time a new message is added — the
   * parent is expected to save it (localStorage + Supabase) just like any
   * other state change, so the conversation survives reloads/relogins. */
  onHistoryChange?: (log: CopilotLogEntry[]) => void;
}

const MAX_HISTORY = 50;

// Resolves a spoken/typed customer reference against the manager's own
// already-loaded customer list. Runs entirely client-side — no customer PII
// is ever sent to the AI classify call itself.
function findCustomer(users: UserRecord[], query: string): UserRecord | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let match = users.find(u => u.username?.toLowerCase() === q);
  if (match) return match;
  match = users.find(u => u.name?.toLowerCase() === q);
  if (match) return match;
  match = users.find(u => u.name && (u.name.toLowerCase().includes(q) || q.includes(u.name.toLowerCase())));
  if (match) return match;
  match = users.find(u => u.username?.toLowerCase().includes(q));
  return match || null;
}

// Modern sparkle/assistant mark — a large 4-point star with a small
// companion star, a common, license-free way to signal "AI assistant"
// without borrowing any specific product's trademarked logo.
const CopilotIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2c.3 2.7 1 4.6 2.1 5.9C15.4 9 17.3 9.7 20 10c-2.7.3-4.6 1-5.9 2.1C12.7 13.4 12 15.3 12 18c-.3-2.7-1-4.6-2.1-5.9C8.6 11 6.7 10.3 4 10c2.7-.3 4.6-1 5.9-2.1C11 6.6 11.7 4.7 12 2z" />
    <path d="M19 14c.15 1.1.5 1.9 1.05 2.45.55.55 1.35.9 2.45 1.05-1.1.15-1.9.5-2.45 1.05-.55.55-.9 1.35-1.05 2.45-.15-1.1-.5-1.9-1.05-2.45C17.4 18 16.6 17.65 15.5 17.5c1.1-.15 1.9-.5 2.45-1.05.55-.55.9-1.35 1.05-2.45z" />
  </svg>
);

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function CopilotBar({ users, onOpenTab, onPrepareReceipt, history, onHistoryChange }: CopilotBarProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<CopilotLogEntry[]>(history || []);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const hydratedRef = useRef(false);

  // Hydrate once from the persisted history prop when it first arrives
  // (e.g. right after initial load from Supabase/localStorage completes).
  useEffect(() => {
    if (!hydratedRef.current && history && history.length > 0) {
      setLog(history);
      hydratedRef.current = true;
    }
  }, [history]);

  const appendLog = useCallback((entry: CopilotLogEntry) => {
    setLog(prev => {
      const next = [...prev, entry].slice(-MAX_HISTORY);
      onHistoryChange?.(next);
      return next;
    });
  }, [onHistoryChange]);

  const speechSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const runCommand = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    appendLog({ from: 'user', text, ts: Date.now() });
    setInput('');
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        appendLog({ from: 'copilot', text: 'Your session expired — please log in again.', ts: Date.now() });
        return;
      }
      const recentHistory = log.slice(-6).map(h => ({ from: h.from, text: h.text }));
      const res = await fetch('/api/admin-maintenance?action=copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ command: text, history: recentHistory }),
      });
      const data: CopilotReply = await res.json();

      if (data.action === 'open_tab' && data.tab) {
        onOpenTab(data.tab);
        appendLog({ from: 'copilot', text: data.reply || `Opened ${data.tab}.`, ts: Date.now() });
      } else if (data.action === 'customer_lookup') {
        const customer = findCustomer(users, data.customerName || '');
        if (!customer) {
          appendLog({ from: 'copilot', text: `Couldn't find a customer named "${data.customerName || text}".`, ts: Date.now() });
        } else {
          const summary = `${customer.name} — ${customer.plan}, Rs.${customer.monthlyFee}/month, Balance: Rs.${customer.balance}, Expiry: ${customer.expiryDate}, Status: ${customer.status}`;
          appendLog({ from: 'copilot', text: summary, ts: Date.now() });
        }
      } else if (data.action === 'generate_receipt') {
        const customer = findCustomer(users, data.customerName || '');
        if (!customer) {
          appendLog({ from: 'copilot', text: `Couldn't find a customer named "${data.customerName || text}".`, ts: Date.now() });
        } else {
          onPrepareReceipt(customer.id);
          appendLog({ from: 'copilot', text: `Opened the Receipt tab for ${customer.name} — confirm and save when ready.`, ts: Date.now() });
        }
      } else {
        appendLog({ from: 'copilot', text: data.reply || "Sorry, I didn't understand that. Please try again.", ts: Date.now() });
      }
    } catch {
      appendLog({ from: 'copilot', text: 'Something went wrong — please try again.', ts: Date.now() });
    } finally {
      setBusy(false);
    }
  }, [users, onOpenTab, onPrepareReceipt, busy, log, appendLog]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) runCommand(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [runCommand]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Copilot"
        className="fixed bottom-6 left-5 z-[360] flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
      >
        <CopilotIcon />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 left-5 z-[360] w-[calc(100vw-2.5rem)] max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      style={{ maxHeight: '70vh' }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0">
        <div className="flex items-center gap-2 font-bold text-sm">
          <CopilotIcon /> Copilot
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm" style={{ minHeight: '80px' }}>
        {log.length === 0 && (
          <p className="text-gray-400 text-xs">
            e.g. "open customer list", "what's Ali's balance", "generate a receipt for Sara"
          </p>
        )}
        {log.map((entry, i) => (
          <div key={i} className={entry.from === 'user' ? 'text-right' : 'text-left'}>
            <span
              className={`inline-block px-3 py-2 rounded-xl max-w-[85%] ${
                entry.from === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 dark:text-gray-100'
              }`}
            >
              {entry.text}
            </span>
          </div>
        ))}
        {busy && <p className="text-gray-400 text-xs">Thinking...</p>}
      </div>
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runCommand(input); }}
          placeholder="Type a command..."
          className="flex-1 px-3 py-2 rounded-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {speechSupported && (
          <button
            onClick={listening ? stopListening : startListening}
            aria-label="Voice"
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors shrink-0 ${
              listening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            }`}
          >
            <MicIcon />
          </button>
        )}
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
