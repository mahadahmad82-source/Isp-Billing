import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { UserRecord } from '../types';

interface CopilotReply {
  action: 'open_tab' | 'customer_lookup' | 'generate_receipt' | 'unclear';
  tab?: string;
  customerName?: string;
  reply?: string;
}

interface CopilotLogEntry {
  from: 'user' | 'copilot';
  text: string;
}

interface CopilotBarProps {
  users: UserRecord[];
  onOpenTab: (tab: string) => void;
  onPrepareReceipt: (userId: string) => void;
}

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

const CopilotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="11" />
    <line x1="7.5" y1="16" x2="7.5" y2="16.01" />
    <line x1="16.5" y1="16" x2="16.5" y2="16.01" />
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

export default function CopilotBar({ users, onOpenTab, onPrepareReceipt }: CopilotBarProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<CopilotLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const speechSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const runCommand = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setLog(prev => [...prev, { from: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLog(prev => [...prev, { from: 'copilot', text: 'Session expired, dobara login karein.' }]);
        return;
      }
      const res = await fetch('/api/admin-maintenance?action=copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ command: text }),
      });
      const data: CopilotReply = await res.json();

      if (data.action === 'open_tab' && data.tab) {
        onOpenTab(data.tab);
        setLog(prev => [...prev, { from: 'copilot', text: data.reply || `${data.tab} khol diya.` }]);
      } else if (data.action === 'customer_lookup') {
        const customer = findCustomer(users, data.customerName || '');
        if (!customer) {
          setLog(prev => [...prev, { from: 'copilot', text: `"${data.customerName || text}" naam ka customer nahi mila.` }]);
        } else {
          const summary = `${customer.name} — ${customer.plan}, Rs.${customer.monthlyFee}/month, Balance: Rs.${customer.balance}, Expiry: ${customer.expiryDate}, Status: ${customer.status}`;
          setLog(prev => [...prev, { from: 'copilot', text: summary }]);
        }
      } else if (data.action === 'generate_receipt') {
        const customer = findCustomer(users, data.customerName || '');
        if (!customer) {
          setLog(prev => [...prev, { from: 'copilot', text: `"${data.customerName || text}" naam ka customer nahi mila.` }]);
        } else {
          onPrepareReceipt(customer.id);
          setLog(prev => [...prev, { from: 'copilot', text: `${customer.name} ke liye Receipt tab khol diya — confirm karke Save karein.` }]);
        }
      } else {
        setLog(prev => [...prev, { from: 'copilot', text: data.reply || 'Samajh nahi aaya, dobara try karein.' }]);
      }
    } catch {
      setLog(prev => [...prev, { from: 'copilot', text: 'Kuch masla hua, dobara try karein.' }]);
    } finally {
      setBusy(false);
    }
  }, [users, onOpenTab, onPrepareReceipt, busy]);

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
        className="fixed bottom-6 left-5 z-[360] flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
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
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
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
            e.g. "customer list kholo", "Ali ka balance batao", "Sara ke liye receipt banao"
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
        {busy && <p className="text-gray-400 text-xs">Soch raha hoon...</p>}
      </div>
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runCommand(input); }}
          placeholder="Command likhein..."
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
