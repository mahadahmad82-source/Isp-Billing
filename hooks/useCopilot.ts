// ─── Offline-first Copilot ──────────────────────────────────────────────────
// The local parser (utils/agent) is the PRIMARY path: text commands are
// classified and executed entirely on-device — no customer PII and no
// operational commands ever leave the device for classification.
// When the local parser cannot understand a command (intent 'unclear'), the
// raw command text + the last few chat turns are sent to the AI classifier
// (?action=copilot) so natural phrasing works; its answer is mapped back into
// the same ParseResult and run through the same executors (writes stay
// confirmation-gated). If the AI is unreachable the local 'unclear' reply is used. Voice
// transcription still uses the backend audio→text endpoint, but the resulting
// text is parsed locally like any typed command.
//
// Write/destructive operations are ALWAYS gated behind an explicit user
// confirmation (the pending state below). Reads execute immediately.
// All writes go through the app's existing dual-save handlers
// (localStorage + Supabase retry), so offline behavior is unchanged.

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateId } from '../utils/storage';
import type {
  UserRecord, Receipt, BusinessExpense, ComplaintTicket, TeamMessage, CopilotLogEntry,
} from '../types';
import { copilotReceiptBridge } from '../utils/copilotBridge';
import {
  parse, helpText, type ParseResult, type Intent,
} from '../utils/agent/parser';
import { resolveCustomer, isAffirmative, isNegative, extractOrdinal, type CustomerRef } from '../utils/agent/slots';
import { normalize, hasWord, rs, periodLabel, displayDate } from '../utils/agent/normalize';

export interface UseCopilotOptions {
  users: UserRecord[];
  receipts?: Receipt[];
  expenses?: BusinessExpense[];
  complaints?: ComplaintTicket[];
  subManagers?: Array<{ id: string; username: string; name: string }>;
  onOpenTab: (tab: string) => void;
  /** Opens ReceiptGenerator pre-filled. The manager still confirms/saves — a
   * voice/text command never creates a receipt on its own. */
  onPrepareReceipt: (userId: string, opts?: { amount?: number; note?: string }) => void;
  /** Enable/disable a customer. Must go through the app's dual-save handler. */
  onSetUserStatus?: (userId: string, status: 'active' | 'suspended') => void;
  /** False for sub-managers (status control is explicit opt-in for them). */
  canChangeStatus?: boolean;
  // ── Offline agent write actions (all dual-saved by the parent handlers) ──
  // Optional during migration: if a handler is missing, the agent explains
  // that the action needs the App.tsx wiring instead of crashing.
  onAddUser?: (user: UserRecord) => void;
  onUpdateUser?: (userId: string, update: Partial<UserRecord>) => void;
  onAddExpense?: (e: Omit<BusinessExpense, 'id' | 'createdAt'>) => void;
  onResolveComplaint?: (ticketId: string, details: string) => void;
  onSendTeamMessage?: (message: TeamMessage) => void;
  managerUsername?: string;
  /** Persisted conversation log (dual-saved by the parent like the rest of AppState). */
  history?: CopilotLogEntry[];
  onHistoryChange?: (log: CopilotLogEntry[]) => void;
}

const MAX_HISTORY = 50;
const VOICE_KEY = 'copilot_voice_reply_v1';

// Exact short "save it" phrases — only honoured while a receipt form is open.
const SAVE_PHRASES = /^(please )?(save|confirm|generate)( (it|this|receipt|the receipt))?( kar do| karo| kardo| kr do)?$|^(receipt )?(save|generate) (kar do|karo|kardo|kr do)$/;
function isSavePhrase(text: string): boolean {
  return SAVE_PHRASES.test(text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim());
}

interface AiResult {
  action: string; tab?: string; customerName?: string; amount?: number; note?: string;
  status?: string; metric?: string; filter?: string; op?: string; reply?: string;
}

/** Ask the backend AI to understand a command the local parser could not.
 * Sends only the raw command text and the last few chat turns — never customer
 * records. Returns null on any failure so the caller falls back to local replies. */
async function classifyWithAI(command: string, turns: CopilotLogEntry[], receiptFormOpen: boolean): Promise<AiResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const history = turns.slice(-7, -1).map(h => ({ from: h.from, text: h.text }));
    const res = await fetch('/api/admin-maintenance?action=copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ command, history, receiptFormOpen }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data.action === 'string' ? (data as AiResult) : null;
  } catch {
    return null;
  }
}

interface PendingWrite {
  /** Human-readable confirmation prompt shown to the user. */
  label: string;
  run: () => void;
}

interface AwaitingSlot {
  intent: Intent;
  slots: ParseResult;
  missing: string;
  raw: string;
}

export function useCopilot(opts: UseCopilotOptions) {
  const {
    users, receipts = [], expenses = [], complaints = [], subManagers = [],
    onOpenTab, onPrepareReceipt, onSetUserStatus, canChangeStatus = false,
    onAddUser, onUpdateUser, onAddExpense, onResolveComplaint, onSendTeamMessage,
    managerUsername = '', history, onHistoryChange,
  } = opts;

  const [input, setInput] = useState('');
  const [log, setLog] = useState<CopilotLogEntry[]>(history || []);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [voiceReply, setVoiceReply] = useState<boolean>(() => { try { return localStorage.getItem(VOICE_KEY) === '1'; } catch { return false; } });
  const [pending, setPending] = useState<PendingWrite | null>(null);

  const hydratedRef = useRef(false);
  const busyRef = useRef(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const handsFreeRef = useRef(false);
  const voiceReplyRef = useRef(voiceReply);
  const viaVoiceRef = useRef(false);
  const pendingRef = useRef<PendingWrite | null>(null);
  const awaitingRef = useRef<AwaitingSlot | null>(null);
  const runCommandRef = useRef<(raw: string, viaVoice?: boolean) => void>(() => {});
  const startRecordingRef = useRef<() => void>(() => {});
  // Latest state for use inside callbacks without stale closures.
  const stateRef = useRef({ users, receipts, expenses, complaints, subManagers, managerUsername });
  stateRef.current = { users, receipts, expenses, complaints, subManagers, managerUsername };
  const cbRef = useRef({ onOpenTab, onPrepareReceipt, onSetUserStatus, onAddUser, onUpdateUser, onAddExpense, onResolveComplaint, onSendTeamMessage });
  cbRef.current = { onOpenTab, onPrepareReceipt, onSetUserStatus, onAddUser, onUpdateUser, onAddExpense, onResolveComplaint, onSendTeamMessage };
  const logRef = useRef(log);
  logRef.current = log;
  const permRef = useRef({ canChangeStatus });
  permRef.current = { canChangeStatus };

  handsFreeRef.current = handsFree;
  voiceReplyRef.current = voiceReply;
  pendingRef.current = pending;

  useEffect(() => {
    if (!hydratedRef.current && history && history.length > 0) {
      setLog(history);
      hydratedRef.current = true;
    }
  }, [history]);

  // Keep this instance in sync when ANOTHER Copilot instance (floating widget
  // vs. Copilot tab) appended newer turns.
  useEffect(() => {
    if (!history || history.length === 0) return;
    const lastTs = (l: CopilotLogEntry[]) => (l.length ? l[l.length - 1].ts || 0 : 0);
    setLog(prev => (lastTs(history) > lastTs(prev) ? history : prev));
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

  // ── Customer resolution ──────────────────────────────────────────────────
  // Returns the customer, or null after telling the user what's wrong
  // (not found / ambiguous). Ambiguity offers a numbered choice.
  const resolve = useCallback((ref: CustomerRef | undefined, rawText: string): UserRecord | null => {
    const st = stateRef.current;
    const r = resolveCustomer(ref || null, st.users);
    if (r.kind === 'one' && r.customer) {
      return st.users.find(u => u.id === r.customer!.id) || null;
    }
    if (r.kind === 'ambiguous' && r.candidates) {
      const names = r.candidates.map((c, i) => `${i + 1}. ${c.name} (@${c.username})`).join('\n');
      awaitingRef.current = { intent: 'customer_lookup', slots: { intent: 'customer_lookup' }, missing: 'disambiguate', raw: rawText };
      (awaitingRef.current as any).candidates = r.candidates;
      say(`Kaun sa customer?\n${names}\nReply with the number (1, 2, 3) or "pehla".`);
      return null;
    }
    say(`Couldn't find a customer matching "${ref?.value || rawText}".`);
    return null;
  }, [say]);

  // ── Confirmation ─────────────────────────────────────────────────────────
  const askConfirm = useCallback((label: string, run: () => void) => {
    setPending({ label, run });
    say(`${label} Tap Confirm below to proceed, or Cancel.`);
  }, [say]);

  // ── Intent executors ─────────────────────────────────────────────────────
  const execute = useCallback((parsed: ParseResult, rawText: string) => {
    const st = stateRef.current;
    const live = st.users.filter(u => u.status !== 'deleted');

    switch (parsed.intent) {
      case 'open_tab': {
        if (parsed.tab) {
          cbRef.current.onOpenTab(parsed.tab);
          say(`Opened ${parsed.tab}.`);
        } else say("Which tab should I open?");
        return;
      }

      case 'help': {
        say(helpText());
        return;
      }

      case 'customer_lookup': {
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        say(`${customer.name} (@${customer.username}) — ${customer.plan || 'no plan'}, ${rs(customer.monthlyFee)}/month, Balance: ${rs(customer.balance)}, Expiry: ${displayDate(customer.expiryDate)}, Status: ${customer.status}`);
        return;
      }

      case 'receipt_history': {
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        const ur = st.receipts
          .filter(r => r.userId === customer.id || r.username === customer.username)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 3);
        if (!ur.length) { say(`${customer.name} ki koi payment record nahi mili.`); return; }
        say(`${customer.name} ki akhri payments:\n` + ur.map(r =>
          `• ${rs(r.paidAmount)} — ${r.period} (${displayDate(r.date)})`
        ).join('\n'));
        return;
      }

      case 'customer_list': {
        const t = normalize(rawText);
        let list = live;
        if (parsed.filter) {
          const today0 = new Date(); today0.setHours(0, 0, 0, 0);
          const dte = (u: UserRecord): number | null => {
            const e = new Date(u.expiryDate);
            if (isNaN(e.getTime())) return null;
            e.setHours(0, 0, 0, 0);
            return Math.ceil((e.getTime() - today0.getTime()) / 86400000);
          };
          const period = periodLabel();
          const paidNow = (u: UserRecord) => st.receipts.some(r =>
            (r.userId === u.id || r.username === u.username) && String(r.status) === 'Success' && r.period === period);
          const labels: Record<string, string> = {
            paid: `${period} ki payment kar chuke`, pending: `${period} ki payment pending`, balance: 'balance wale',
            expired: 'expired', expiring_soon: 'agle 7 din mein expire hone wale', suspended: 'disabled', active: 'active', all: 'tamam',
          };
          switch (parsed.filter) {
            case 'paid': list = list.filter(paidNow); break;
            case 'pending': list = list.filter(u => !paidNow(u)); break;
            case 'balance': list = list.filter(u => (u.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0)); break;
            case 'expired': list = list.filter(u => { const d = dte(u); return d !== null && d < 0; }); break;
            case 'expiring_soon': list = list.filter(u => { const d = dte(u); return d !== null && d >= 0 && d <= 7; }); break;
            case 'suspended': list = list.filter(u => u.status === 'suspended'); break;
            case 'active': list = list.filter(u => u.status === 'active'); break;
            default: break;
          }
          if (!list.length) { say(`Koi customer (${labels[parsed.filter] || parsed.filter}) nahi mila.`); return; }
          const totalDue = list.reduce((s, u) => s + (Number(u.balance) || 0), 0);
          say(`${labels[parsed.filter] || parsed.filter}: ${list.length} customers` + (totalDue > 0 ? ` (kul balance ${rs(totalDue)})` : '') + ':\n' +
            list.slice(0, 8).map(u => `• ${u.name} (@${u.username}) — Balance ${rs(u.balance)}, expiry ${displayDate(u.expiryDate)}`).join('\n') +
            (list.length > 8 ? `\n…aur ${list.length - 8} mazeed.` : ''));
          return;
        }
        if (hasWord(t, 'balance') || hasWord(t, 'udhaar') || hasWord(t, 'بقایا')) {
          list = list.filter(u => (u.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0));
        } else if (hasWord(t, 'band') || hasWord(t, 'suspended') || hasWord(t, 'disabled')) {
          list = list.filter(u => u.status === 'suspended');
        } else if (hasWord(t, 'active') || hasWord(t, 'chalu')) {
          list = list.filter(u => u.status === 'active');
        }
        if (!list.length) { say('Koi customer is filter mein nahi mila.'); return; }
        const top = list.slice(0, 5);
        say(`${list.length} customers:\n` + top.map(u =>
          `• ${u.name} (@${u.username}) — Balance ${rs(u.balance)}, ${u.status}`
        ).join('\n') + (list.length > 5 ? `\n…aur ${list.length - 5} mazeed.` : ''));
        return;
      }

      case 'summary': {
        say(summaryMetric(parsed.metric || 'total_customers', st));
        return;
      }

      case 'complaint_list': {
        const open = st.complaints.filter(c => c.status === 'open' || c.status === 'assigned');
        if (!open.length) { say('Koi open complaint nahi hai. Sab clear!'); return; }
        say(`${open.length} open complaints:\n` + open.slice(0, 5).map(c =>
          `• ${c.title} — ${c.customerName} (${c.status})`
        ).join('\n') + (open.length > 5 ? `\n…aur ${open.length - 5} mazeed.` : ''));
        return;
      }

      case 'expense_summary': {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthExp = st.expenses.filter(e => (e.date || '').startsWith(ym));
        const total = monthExp.reduce((s, e) => s + (e.amount || 0), 0);
        say(`Is month ka total kharcha: ${rs(total)} (${monthExp.length} entries).`);
        return;
      }

      // ── Confirmation-gated writes ──────────────────────────────────────
      case 'record_payment': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        const amount = parsed.amount!;
        // Payments go through the authoritative ReceiptGenerator: pre-fill the
        // form with the confirmed amount and open the Receipt tab. The manager
        // reviews and taps Generate — balance/arrears math stays in one place.
        askConfirm(`Record ${rs(amount)} payment from ${customer.name}?`,
          () => {
            cbRef.current.onPrepareReceipt(customer.id, { amount, note: `Via Copilot (${periodLabel()})` });
            say(`Receipt form ready for ${customer.name} — review and tap Generate.`);
          });
        return;
      }

      case 'generate_receipt': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        cbRef.current.onPrepareReceipt(customer.id, { amount: parsed.amount });
        say(`Opened the Receipt tab for ${customer.name}${parsed.amount ? ` with ${rs(parsed.amount)}` : ''} — review it, then tap Generate.`);
        return;
      }

      case 'set_status': {
        if (!permRef.current.canChangeStatus || !cbRef.current.onSetUserStatus) {
          say('Changing customer status needs manager access.');
          return;
        }
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        const status = parsed.status!;
        if (customer.status === 'deleted') { say(`${customer.name} is deleted — status can't be changed.`); return; }
        if (customer.status === status) {
          say(`${customer.name} is already ${status === 'suspended' ? 'disabled' : 'active'}.`);
          return;
        }
        askConfirm(`${status === 'suspended' ? 'Disable' : 'Enable'} ${customer.name}?`,
          () => {
            cbRef.current.onSetUserStatus!(customer.id, status);
            say(`Done — ${customer.name} ${status === 'suspended' ? 'disabled' : 'enabled'}.`);
          });
        return;
      }

      case 'add_customer': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const name = parsed.customer?.value || '';
        const phone = (parsed as any).phone as string | undefined;
        const fee = (parsed as any).monthlyFee as number | undefined;
        const base = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'customer';
        let username = base;
        let n = 1;
        const taken = new Set(st.users.map(u => (u.username || '').toLowerCase()));
        while (taken.has(username)) username = `${base}${++n}`;
        const now = new Date().toISOString();
        const user: UserRecord = {
          id: generateId(), username, name, phone: phone || '', address: '',
          plan: '', monthlyFee: fee || 0, balance: 0,
          lastPaymentDate: '', expiryDate: '', createdAt: now, status: 'active',
        };
        askConfirm(`Add new customer ${name} (@${username}), phone ${phone}, fee ${rs(fee || 0)}?`,
          () => {
            if (!cbRef.current.onAddUser) { say('Customer add karne ke liye App update chahiye.'); return; }
            cbRef.current.onAddUser(user);
            say(`Done — ${name} added as @${username}.`);
          });
        return;
      }

      case 'edit_customer': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        const field = parsed.editField!;
        const value = parsed.editValue!;
        const update: Partial<UserRecord> = field === 'monthlyFee'
          ? { monthlyFee: Number(value) || 0 }
          : { [field]: value } as Partial<UserRecord>;
        askConfirm(`Change ${customer.name}'s ${field} to "${value}"?`,
          () => {
            if (!cbRef.current.onUpdateUser) { say('Update ke liye App update chahiye.'); return; }
            cbRef.current.onUpdateUser(customer.id, update);
            say(`Done — ${customer.name}'s ${field} updated.`);
          });
        return;
      }

      case 'add_expense': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const amount = parsed.amount!;
        const title = parsed.expenseTitle || 'Kharcha';
        const category = parsed.expenseCategory || 'other';
        askConfirm(`Add expense ${rs(amount)} — ${title} (${category})?`,
          () => {
            if (!cbRef.current.onAddExpense) { say('Expense add karne ke liye App update chahiye.'); return; }
            cbRef.current.onAddExpense({
              title, amount, category,
              date: new Date().toISOString().split('T')[0], notes: 'Via Copilot',
            });
            say(`Done — ${rs(amount)} expense recorded.`);
          });
        return;
      }

      case 'resolve_complaint': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        const open = st.complaints.filter(c =>
          c.customerId === customer.id && (c.status === 'open' || c.status === 'assigned'));
        if (!open.length) { say(`${customer.name} ki koi open complaint nahi hai.`); return; }
        const ticket = open[0];
        const detail = parsed.complaintDetail || 'Resolved via Copilot';
        askConfirm(`Mark "${ticket.title}" (${customer.name}) as resolved?`,
          () => {
            if (!cbRef.current.onResolveComplaint) { say('Complaint resolve ke liye App update chahiye.'); return; }
            cbRef.current.onResolveComplaint(ticket.id, detail);
            say(`Done — complaint marked resolved.`);
          });
        return;
      }

      case 'mark_reminded': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const customer = resolve(parsed.customer, rawText);
        if (!customer) return;
        askConfirm(`Mark ${customer.name} as reminded?`,
          () => {
            if (!cbRef.current.onUpdateUser) { say('Reminder mark karne ke liye App update chahiye.'); return; }
            cbRef.current.onUpdateUser(customer.id, { lastReminderSentAt: new Date().toISOString() });
            say(`Done — ${customer.name} marked as reminded.`);
          });
        return;
      }

      case 'send_team_message': {
        if (parsed.missing?.length) { askForSlot(parsed, rawText); return; }
        const text = parsed.teamText!;
        const sms = st.subManagers;
        if (!sms.length) { say('Koi team member (sub-manager) add nahi hai.'); return; }
        // If the command names a team member, target them; otherwise ask.
        const named = sms.find(s =>
          hasWord(normalize(rawText), s.name.toLowerCase()) ||
          hasWord(normalize(rawText), s.username.toLowerCase()));
        const target = named || (sms.length === 1 ? sms[0] : null);
        if (!target) {
          awaitingRef.current = { intent: 'send_team_message', slots: parsed, missing: 'recipient', raw: rawText };
          say(`Kis team member ko bhejna hai?\n` + sms.map((s, i) => `${i + 1}. ${s.name} (@${s.username})`).join('\n'));
          return;
        }
        if (!cbRef.current.onSendTeamMessage) { say('Team message ke liye App update chahiye.'); return; }
        askConfirm(`Send to ${target.name}: "${text}"?`,
          () => {
            cbRef.current.onSendTeamMessage!({
              id: generateId(),
              managerUsername: st.managerUsername,
              senderUsername: st.managerUsername,
              senderRole: 'manager',
              recipientUsername: target.username,
              text,
              createdAt: new Date().toISOString(),
            });
            say(`Done — message sent to ${target.name}.`);
          });
        return;
      }

      default: {
        say('Maaf kijiye, samajh nahi aaya. "help" likhein to dikhaun main kya kar sakta hoon.');
        return;
      }
    }
  }, [say, resolve, askConfirm]);

  // ── Slot filling ─────────────────────────────────────────────────────────
  const askForSlot = useCallback((parsed: ParseResult, rawText: string) => {
    const missing = (parsed.missing || [])[0];
    if (!missing) { execute({ ...parsed, missing: [] }, rawText); return; }
    awaitingRef.current = { intent: parsed.intent, slots: parsed, missing, raw: rawText };
    const prompts: Record<string, string> = {
      customer: 'Kis customer ke liye? Naam ya @username batao.',
      amount: 'Kitni amount? (e.g. 1500)',
      expenseTitle: 'Kharcha kis cheez ka tha? (e.g. diesel)',
      teamText: 'Kya message bhejna hai?',
      editField: 'Kya change karna hai? (number, address, plan, fee)',
      phone: 'Customer ka phone number kya hai?',
      monthlyFee: 'Monthly fee kitni hai?',
      recipient: 'Kis team member ko bhejna hai?',
    };
    say(prompts[missing] || 'Thori aur detail batao.');
  }, [say, execute]);

  // Fill an awaited slot from the user's reply, then re-execute.
  const fillSlot = useCallback((rawText: string): boolean => {
    const aw = awaitingRef.current;
    if (!aw) return false;

    // Disambiguation choice ("1", "pehla", "dusra").
    if (aw.missing === 'disambiguate') {
      const idx = extractOrdinal(rawText);
      const candidates = (aw as any).candidates as Array<{ id: string; name: string; username: string }>;
      if (idx !== null && candidates && candidates[idx]) {
        const chosen = candidates[idx];
        awaitingRef.current = null;
        say(`${chosen.name} selected.`);
        // Re-run as a direct lookup on the chosen username.
        execute({ intent: 'customer_lookup', customer: { kind: 'username', value: chosen.username } }, rawText);
        return true;
      }
      say('Please reply with 1, 2 or 3.');
      return true;
    }

    if (aw.missing === 'recipient') {
      const st = stateRef.current;
      const idx = extractOrdinal(rawText);
      const t = normalize(rawText);
      const target = (idx !== null && st.subManagers[idx]) ||
        st.subManagers.find(s => hasWord(t, s.name.toLowerCase()) || hasWord(t, s.username.toLowerCase()));
      if (!target) { say('Kaun sa team member? Number ya naam batao.'); return true; }
      awaitingRef.current = null;
      const text = aw.slots.teamText!;
      if (!cbRef.current.onSendTeamMessage) { say('Team message ke liye App update chahiye.'); return true; }
      askConfirm(`Send to ${target.name}: "${text}"?`,
        () => {
          cbRef.current.onSendTeamMessage!({
            id: generateId(),
            managerUsername: st.managerUsername,
            senderUsername: st.managerUsername,
            senderRole: 'manager',
            recipientUsername: target.username,
            text,
            createdAt: new Date().toISOString(),
          });
          say(`Done — message sent to ${target.name}.`);
        });
      return true;
    }

    const slots = { ...aw.slots };
    let filled = false;
    if (aw.missing === 'customer') {
      const m = rawText.match(/@([\p{L}\p{N}_.-]+)/u);
      const value = m ? m[1] : rawText.trim();
      slots.customer = m ? { kind: 'username', value } : { kind: 'name', value };
      filled = !!value;
    } else if (aw.missing === 'amount' || aw.missing === 'monthlyFee') {
      const m = rawText.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const n = Number(m[1]);
        if (aw.missing === 'amount') slots.amount = n; else (slots as any).monthlyFee = n;
        filled = true;
      }
    } else if (aw.missing === 'phone') {
      const m = rawText.match(/(\d{7,})/);
      if (m) { (slots as any).phone = m[1]; filled = true; }
    } else if (aw.missing === 'expenseTitle') {
      if (rawText.trim().length > 1) { slots.expenseTitle = rawText.trim(); filled = true; }
    } else if (aw.missing === 'teamText') {
      if (rawText.trim().length > 1) { slots.teamText = rawText.trim(); filled = true; }
    } else if (aw.missing === 'editField') {
      const t = normalize(rawText);
      const field = ['number', 'phone'].some(w => hasWord(t, w)) ? 'phone'
        : hasWord(t, 'address') || hasWord(t, 'pata') ? 'address'
        : hasWord(t, 'plan') || hasWord(t, 'package') ? 'plan'
        : hasWord(t, 'fee') ? 'monthlyFee'
        : hasWord(t, 'naam') || hasWord(t, 'name') ? 'name' : null;
      if (field) {
        slots.editField = field;
        const vm = field === 'monthlyFee'
          ? rawText.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
          : field === 'phone' ? rawText.match(/(\d{7,})/) : null;
        if (vm) slots.editValue = vm[1];
        else if (field === 'address' || field === 'plan' || field === 'name') {
          // Value comes in the next turn.
          awaitingRef.current = { intent: aw.intent, slots, missing: 'editValue', raw: rawText };
          say(`Nayi ${field} kya hai?`);
          return true;
        }
        if (slots.editValue) filled = true;
        else { awaitingRef.current = { intent: aw.intent, slots, missing: 'editValue', raw: rawText }; say('Nayi value kya hai?'); return true; }
      }
    } else if (aw.missing === 'editValue') {
      if (rawText.trim()) { slots.editValue = rawText.trim(); filled = true; }
    }

    if (!filled) { say('Samajh nahi aaya — dobara batao.'); return true; }
    const stillMissing = (slots.missing || []).filter(m => m !== aw.missing);
    // add_customer chains phone → monthlyFee.
    if (aw.intent === 'add_customer' && aw.missing === 'phone' && !(slots as any).monthlyFee) {
      stillMissing.push('monthlyFee');
    }
    awaitingRef.current = null;
    if (stillMissing.length) { askForSlot({ ...slots, missing: stillMissing }, rawText); return true; }
    execute({ ...slots, missing: [] }, rawText);
    return true;
  }, [say, execute, askForSlot]);

  // ── Main entry ───────────────────────────────────────────────────────────
  const runCommand = useCallback(async (raw: string, viaVoice = false) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    viaVoiceRef.current = viaVoice;
    busyRef.current = true;
    appendLog({ from: 'user', text, ts: Date.now() });
    setInput('');
    setBusy(true);
    try {
      // Receipt-form "save it" shortcut (unchanged).
      if (copilotReceiptBridge.isOpen() && isSavePhrase(text)) {
        const r = await copilotReceiptBridge.run({ type: 'save' });
        say(r.message);
        return;
      }

      // Pending confirmation: yes / no.
      if (pendingRef.current) {
        if (isAffirmative(text)) {
          const p = pendingRef.current;
          setPending(null);
          p.run();
          return;
        }
        if (isNegative(text)) {
          setPending(null);
          awaitingRef.current = null;
          say('Cancelled.');
          return;
        }
        // Anything else while a confirmation is open: treat as cancel + new command.
        setPending(null);
      }

      // Conversational slot filling.
      if (awaitingRef.current) {
        if (isNegative(text)) {
          awaitingRef.current = null;
          say('Cancelled.');
          return;
        }
        if (fillSlot(text)) return;
      }

      // Offline parse → execute. No network, no PII leaves the device.
      const parsed = parse(text);

      // Local parser did not understand → let the AI interpret natural phrasing,
      // then run its answer through the same executors (writes stay gated).
      if (parsed.intent === 'unclear') {
        const ai = await classifyWithAI(text, logRef.current, copilotReceiptBridge.isOpen());
        if (ai) {
          const toRef = (name?: string): CustomerRef | undefined => {
            const v = String(name || '').trim().replace(/^@/, '');
            if (!v) return undefined;
            const isUsername = stateRef.current.users.some(u => (u.username || '').toLowerCase() === v.toLowerCase());
            return { kind: isUsername ? 'username' : 'name', value: v };
          };
          switch (ai.action) {
            case 'open_tab':
              if (ai.tab) { execute({ intent: 'open_tab', tab: ai.tab }, text); return; }
              break;
            case 'customer_lookup':
            case 'receipt_history': {
              const ref = toRef(ai.customerName);
              if (ref) { execute({ intent: ai.action as Intent, customer: ref }, text); return; }
              break;
            }
            case 'customer_list':
              if (ai.filter) { execute({ intent: 'customer_list', filter: ai.filter }, text); return; }
              break;
            case 'summary':
              if (ai.metric) { execute({ intent: 'summary', metric: ai.metric }, text); return; }
              break;
            case 'generate_receipt': {
              const ref = toRef(ai.customerName);
              if (ref) {
                execute({ intent: 'generate_receipt', customer: ref, amount: typeof ai.amount === 'number' ? ai.amount : undefined, missing: [] }, text);
                return;
              }
              break;
            }
            case 'set_status': {
              const ref = toRef(ai.customerName);
              if (ref && (ai.status === 'active' || ai.status === 'suspended')) {
                execute({ intent: 'set_status', customer: ref, status: ai.status, missing: [] }, text);
                return;
              }
              break;
            }
            case 'receipt_form':
              if (copilotReceiptBridge.isOpen() && (ai.op === 'save' || ai.op === 'edit' || ai.op === 'read')) {
                const r = await copilotReceiptBridge.run(
                  ai.op === 'edit' ? { type: 'edit', amount: ai.amount, note: ai.note } : { type: ai.op },
                );
                say(r.message);
                return;
              }
              break;
            default:
              break;
          }
          // chat / unclear / incomplete mapping → show the AI's own reply.
          if (ai.reply) { say(ai.reply); return; }
        }
      }
      execute(parsed, text);
    } catch {
      say('Something went wrong — please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      continueLoop();
    }
  }, [appendLog, say, execute, fillSlot, continueLoop]);
  runCommandRef.current = runCommand;

  const confirmPending = () => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    p.run();
    continueLoop();
  };
  const cancelPending = () => {
    setPending(null);
    awaitingRef.current = null;
    say('Cancelled.');
    continueLoop();
  };

  // ── Voice (unchanged): audio → backend transcribe → local parse ──────────
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
    handsFree, voiceReply, pending: !!pending,
    runCommand, toggleMic, toggleHandsFree, toggleVoiceReply,
    confirmPending, cancelPending, stopVoice,
  };
}

export type UseCopilotApi = ReturnType<typeof useCopilot>;

// ─── Summary metrics (local, offline) ───────────────────────────────────────
function summaryMetric(
  metric: string,
  st: { users: UserRecord[]; receipts: Receipt[]; expenses: BusinessExpense[]; complaints: ComplaintTicket[] },
): string {
  const live = st.users.filter(u => u.status !== 'deleted');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToExpiry = (u: UserRecord): number | null => {
    const e = new Date(u.expiryDate);
    if (isNaN(e.getTime())) return null;
    e.setHours(0, 0, 0, 0);
    return Math.ceil((e.getTime() - today.getTime()) / 86400000);
  };
  const isToday = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  };
  const thisYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  switch (metric) {
    case 'total_customers': return `Total customers: ${live.length}.`;
    case 'active': return `Active customers: ${live.filter(u => u.status === 'active').length}.`;
    case 'suspended': return `Disabled customers: ${live.filter(u => u.status === 'suspended').length}.`;
    case 'expired': return `Expired customers: ${live.filter(u => { const d = daysToExpiry(u); return d !== null && d < 0; }).length}.`;
    case 'expiring_today': return `Aaj expire hone wale: ${live.filter(u => daysToExpiry(u) === 0).length}.`;
    case 'expiring_soon': return `Expiring in the next 7 days: ${live.filter(u => { const d = daysToExpiry(u); return d !== null && d >= 0 && d <= 7; }).length}.`;
    case 'total_balance': return `Total outstanding balance: ${rs(live.reduce((s, u) => s + (Number(u.balance) || 0), 0))}.`;
    case 'collection_today': {
      const sum = st.receipts.filter(r => isToday(r.date)).reduce((s, r) => s + (r.paidAmount || 0), 0);
      return `Aaj ki collection: ${rs(sum)}.`;
    }
    case 'collection_month': {
      const p = periodLabel();
      const sum = st.receipts.filter(r => r.period === p).reduce((s, r) => s + (r.paidAmount || 0), 0);
      return `Is month ki collection (${p}): ${rs(sum)}.`;
    }
    case 'expense_month': {
      const sum = st.expenses.filter(e => (e.date || '').startsWith(thisYM)).reduce((s, e) => s + (e.amount || 0), 0);
      return `Is month ka kharcha: ${rs(sum)}.`;
    }
    case 'complaint_open': {
      const n = st.complaints.filter(c => c.status === 'open' || c.status === 'assigned').length;
      return `Open complaints: ${n}.`;
    }
    default: return `Total customers: ${live.length}.`;
  }
}
