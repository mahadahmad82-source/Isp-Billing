// ─── Offline agent: intent parser ───────────────────────────────────────────
// Deterministic, fully offline replacement for the Gemini classify call.
// Input: raw command text (+ already-loaded customers). Output: a ParseResult
// describing ONE intent and its slots. The hook executes the intent against
// real app handlers; writes are always gated behind user confirmation.

import { normalize, romanizeUrdu, hasWord, hasAny, countHits, esc, rs } from './normalize';
import { TRIGGERS, TABS, NAV_VERBS, MONTHS, EN_MONTHS, EXPENSE_CATS, TODAY_WORDS } from './vocab';
import {
  extractAmount, stripAmount, extractCustomerRef, cleanFreeText, type CustomerRef,
} from './slots';

export type Intent =
  | 'open_tab' | 'customer_lookup' | 'customer_list' | 'summary' | 'receipt_history'
  | 'complaint_list' | 'expense_summary' | 'record_payment' | 'generate_receipt'
  | 'add_customer' | 'edit_customer' | 'set_status' | 'add_expense'
  | 'resolve_complaint' | 'send_team_message' | 'mark_reminded' | 'help' | 'unclear';

export interface ParseResult {
  intent: Intent;
  customer?: CustomerRef;
  amount?: number;
  status?: 'active' | 'suspended';
  tab?: string;
  metric?: string;
  /** Which slots are still missing (for conversational slot-filling). */
  missing?: string[];
  message?: string;
  expenseTitle?: string;
  expenseCategory?: 'salary' | 'equipment' | 'rent' | 'utilities' | 'marketing' | 'other';
  complaintDetail?: string;
  teamText?: string;
  editField?: string;
  editValue?: string;
  receiptMonth?: string;
  /** customer_list filter chosen by the AI layer: paid | pending | balance | expired | expiring_soon | suspended | active | all. */
  filter?: string;
}

const R = (intent: Intent, extra: Partial<ParseResult> = {}): ParseResult => ({ intent, ...extra });

const SET_STATUS_VERBS = [
  ...TRIGGERS.suspend_words, ...TRIGGERS.activate_words,
  'karo', 'kar do', 'kardo', 'kr do', 'do', 'de', 'bana', 'bana do',
];

// ─── Open tab ───────────────────────────────────────────────────────────────
// "open/ show/ dikhao <tab>" or "expense tab kholo" — order-independent,
// navigation verb optional when a tab name is obvious ("receipts page").
function parseOpenTab(t: string, raw: string): ParseResult | null {
  const low = ' ' + raw + ' ';
  let matched: { id: string; name: string } | null = null;
  for (const tab of TABS) {
    for (const n of tab.names) {
      if (hasWord(raw, n) && (!matched || n.length > matched.name.length)) matched = { id: tab.id, name: n };
    }
  }
  if (!matched) return null;
  const hasVerb = hasAny(raw, NAV_VERBS);
  if (!hasVerb && countHits(t, ['kholo', 'open']) === 0) {
    // Bare tab name ("receipts") is still an open-tab command.
    if (!['dashboard', 'users', 'receipts', 'expenses', 'complaints', 'team', 'settings', 'recoveries', 'expiries', 'analytics'].includes(matched.id)) return null;
  }
  // Don't hijack richer intents that mention a tab name.
  if (hasAny(raw, [...TRIGGERS.record_payment, ...TRIGGERS.resolve_verbs, ...TRIGGERS.message_verbs])) return null;
  if (hasAny(raw, LIST_FILTER_WORDS)) return null; // "jin ka balance zyada hai" → customer_list
  if (hasWord(raw, 'add') || hasWord(raw, 'customer add') || hasWord(raw, 'kharcha add')) return null;
  return R('open_tab', { tab: matched.id });
}

// ─── Customer lookup ────────────────────────────────────────────────────────
// "Ali ka balance batao", "Ali ki expiry", "Ali". "Ali ki akhri payment"
// → receipt_history. "Ali ki payments dikhao" → receipt_history.
// Filtered lists ("jin ka balance zyada hai") are NOT lookups.
const LIST_FILTER_WORDS = ['jin', 'jinka', 'jinke', 'unki', 'unko', 'wale', 'wali', 'walon', 'zyada', 'kam'] as const;

function parseCustomerLookup(t: string, raw: string): ParseResult | null {
  if (hasAny(raw, LIST_FILTER_WORDS)) return null;
  const paymentWords: string[] = ['payment', 'payments'];
  const particles = ['ka', 'ki', 'ko', 'ke', 'se', 'ne', 'mei', 'mein', 'me', 'ki', 'کی', 'کا', 'سے', 'نے', 'کو', 'hai', 'hain', 'ho', 'total', 'kya'];
  if (hasAny(raw, TRIGGERS.receipt_history) || (hasAny(raw, paymentWords) && hasAny(raw, TRIGGERS.show_verbs))) {
    const ref = extractCustomerRef(stripAmount(raw), [...TRIGGERS.customer_lookup, ...particles], [...TRIGGERS.receipt_history, ...paymentWords, ...TRIGGERS.show_verbs, ...SET_STATUS_VERBS]);
    if (ref) return R('receipt_history', { customer: ref });
  }
  if (hasAny(raw, TRIGGERS.customer_lookup)) {
    const ref = extractCustomerRef(
      stripAmount(raw),
      [...TRIGGERS.customer_lookup, ...QUESTION_WORDS, ...particles],
      [...SET_STATUS_VERBS, ...TRIGGERS.receipt_history],
    );
    if (ref) return R('customer_lookup', { customer: ref });
  }
  return null;
}

// ─── Receipt generation ─────────────────────────────────────────────────────
// "Ali ki 1500 ki receipt banao", "Sara ki receipt 1500 ki banao".
// Payment verbs (wasool/diye/mile) belong to record_payment, not here.
function parseGenerateReceipt(t: string, raw: string): ParseResult | null {
  if (!hasWord(raw, 'receipt') && !hasWord(raw, 'rasid') && !hasWord(raw, 'raseed') && !hasWord(raw, 'رسید')) return null;
  if (!hasAny(raw, TRIGGERS.receipt_verbs)) return null;
  const amount = extractAmount(raw);
  const ref = extractCustomerRef(
    stripAmount(raw),
    [...TRIGGERS.receipt_verbs, 'receipt', 'rasid', 'raseed', 'رسید', 'ki', 'ka', 'ko', 'ke', 'ki', 'کی', 'کا'],
    SET_STATUS_VERBS,
  );
  const missing = ref ? [] : ['customer'];
  return R('generate_receipt', { customer: ref || undefined, amount: amount || undefined, missing });
}

// ─── Record payment ─────────────────────────────────────────────────────────
// "Ali se 1500 wasool hue", "Ali ne 1500 diye", "1500 receive hue Ali se".
// Guarded so questions ("aaj ki collection kitni hui") and history requests
// ("Ali ki payments dikhao") never land here.
const RECEIVE_VERBS = [
  'wasool', 'wasuli', 'wasooliyan', 'mile', 'mil gaye', 'mil gay', 'diye',
  'de diye', 'de diya', 'jama', 'jamaa', 'receive', 'received', 'ada',
  'adaigi', 'collection', 'collected', 'وصول', 'ادا', 'جمع',
] as const;
const QUESTION_WORDS = ['kitna', 'kitne', 'kitni', 'kul', 'hisab', 'hisaab', 'کتنا', 'کتنے', 'کتنی'] as const;

function parseRecordPayment(t: string, raw: string): ParseResult | null {
  if (!hasAny(raw, TRIGGERS.record_payment)) return null;
  const amount = extractAmount(raw);
  // A bare question about money ("aaj ki collection kitni hui") is a summary.
  if (!amount && hasAny(raw, QUESTION_WORDS)) return null;
  // "Ali ki payments dikhao" is a history request, not a recording.
  if (!amount && !hasAny(raw, RECEIVE_VERBS)) return null;
  const ref = extractCustomerRef(
    stripAmount(raw),
    [...TRIGGERS.record_payment, ...MONEY_TRIGGERS_STRIP(), ...TRIGGERS.expense_fillers,
      'hue', 'hui', 'huay', 'huwe', 'huyi',
      'se', 'ne', 'ko', 'ki', 'ka', 'ke', 'mei', 'mein', 'me', 'سے', 'نے'],
    SET_STATUS_VERBS,
  );
  const missing: string[] = [];
  if (!amount) missing.push('amount');
  if (!ref) missing.push('customer');
  return R('record_payment', { customer: ref || undefined, amount: amount || undefined, missing });
}
function MONEY_TRIGGERS_STRIP(): string[] {
  return ['rs', 'rupay', 'rupee', 'rupees', 'pkr', 'روپے', 'رقم'];
}

// ─── Set status ─────────────────────────────────────────────────────────────
// "Ali ko band kar do", "sara ko chalu kar do".
// "kitne band hain" is a summary question, not a status change.
function parseSetStatus(t: string, raw: string): ParseResult | null {
  const suspend = hasAny(raw, TRIGGERS.suspend_words);
  const activate = hasAny(raw, TRIGGERS.activate_words);
  if (!suspend && !activate) return null;
  if (suspend && activate) return null; // contradictory — ask for clarity
  if (hasAny(raw, QUESTION_WORDS)) return null; // "kitne band hain" → summary
  const ref = extractCustomerRef(
    stripAmount(raw),
    [...TRIGGERS.suspend_words, ...TRIGGERS.activate_words, 'karo', 'kar do', 'kardo', 'kr do', 'do', 'de', 'ko', 'ka', 'ki', 'ke', 'se', 'کو'],
    [],
  );
  const status = suspend ? 'suspended' : 'active';
  const missing = ref ? [] : ['customer'];
  return R('set_status', { customer: ref || undefined, status, missing });
}

// ─── Summary / metrics ──────────────────────────────────────────────────────
// "kitne customers", "aaj ki collection", "total balance", "kitne band".
function parseSummary(t: string, raw: string): ParseResult | null {
  if (!hasAny(raw, TRIGGERS.summary)) return null;
  // "Ali ka balance batao" is a lookup, not a total — but only when an actual
  // customer name survives stripping ("total balance kitna hai" has none).
  if (hasAny(raw, TRIGGERS.customer_lookup)) {
    const ref = extractCustomerRef(
      stripAmount(raw),
      [...TRIGGERS.summary, ...TRIGGERS.customer_lookup, ...QUESTION_WORDS,
        'total', 'kul', 'hai', 'hain', 'ho', 'kya', 'ka', 'ki', 'ko', 'ke', 'se', 'کی', 'کا'],
      SET_STATUS_VERBS,
    );
    if (ref) return null;
  }
  // A command carrying an actual amount ("Ali se 1500 wasool hue") records
  // money — it is never a summary question.
  if (extractAmount(raw) !== null && hasAny(raw, TRIGGERS.record_payment)) return null;

  const today = hasAny(raw, TODAY_WORDS);
  if (hasAny(raw, TRIGGERS.metric_collection) && today) return R('summary', { metric: 'collection_today' });
  if (hasAny(raw, TRIGGERS.metric_balance)) return R('summary', { metric: 'total_balance' });
  if (hasAny(raw, TRIGGERS.metric_collection)) return R('summary', { metric: 'collection_month' });
  if (hasAny(raw, TRIGGERS.metric_expense)) return R('summary', { metric: 'expense_month' });
  if (hasAny(raw, TRIGGERS.metric_complaint)) return R('summary', { metric: 'complaint_open' });
  if (hasAny(raw, TRIGGERS.metric_expired) || (hasAny(raw, TRIGGERS.metric_expiring) && hasWord(raw, 'expire'))) {
    return R('summary', { metric: hasAny(raw, TRIGGERS.metric_expiring) ? 'expiring_soon' : 'expired' });
  }
  if (hasAny(raw, TRIGGERS.metric_expiring)) return R('summary', { metric: 'expiring_soon' });
  if (hasAny(raw, TRIGGERS.metric_suspended)) return R('summary', { metric: 'suspended' });
  if (hasAny(raw, TRIGGERS.metric_active)) return R('summary', { metric: 'active' });
  // Plain counts: "kitne customers" → total.
  return R('summary', { metric: 'total_customers' });
}

// ─── Complaint list ─────────────────────────────────────────────────────────
// "complaints dikhao", "kitni shikayat open hain".
function parseComplaintList(t: string, raw: string): ParseResult | null {
  if (!hasAny(raw, TRIGGERS.resolve_complaint)) return null;
  if (hasAny(raw, TRIGGERS.resolve_verbs)) return null; // that's resolve_complaint
  if (hasAny(raw, TRIGGERS.message_verbs)) return null;
  return R('complaint_list');
}

// ─── Expense summary ────────────────────────────────────────────────────────
// "is month ka kharcha", "aaj ka kharcha kitna".
function parseExpenseSummary(t: string, raw: string): ParseResult | null {
  if (!hasAny(raw, TRIGGERS.add_expense)) return null;
  if (hasAny(raw, TRIGGERS.expense_verbs)) return null; // that's add_expense
  if (extractAmount(raw)) return null; // "kharcha 500 diesel" → add_expense
  if (hasAny(raw, QUESTION_WORDS)) return R('expense_summary');
  if (hasAny(raw, ['month', 'mahina', 'maheena', 'aaj', 'aj', 'today', 'hafte', 'hafta', 'week', 'آج'])) {
    return R('expense_summary');
  }
  return null;
}

// ─── Customer list with filters ──────────────────────────────────────────────
// "jin ka balance zyada hai", "band customers dikhao".
function parseCustomerList(t: string, raw: string): ParseResult | null {
  if (!hasAny(raw, TRIGGERS.customer_list)) return null;
  return R('customer_list');
}

// ─── Help ───────────────────────────────────────────────────────────────────
function parseHelp(t: string, raw: string): ParseResult | null {
  if (hasAny(raw, TRIGGERS.help)) return R('help');
  return null;
}

/** Main entry: parse a raw command into an intent + slots. */
export function parse(rawInput: string): ParseResult {
  const raw = romanizeUrdu(normalize(rawInput));
  const t = ' ' + raw + ' ';

  // 0. Direct status verbs on a name, help — highest precedence, least ambiguous.
  const help = parseHelp(t, raw); if (help) return help;
  const status = parseSetStatus(t, raw); if (status) return status;

  // 1. Complaints (list vs resolve disambiguated inside).
  if (hasAny(raw, TRIGGERS.resolve_complaint)) {
    if (hasAny(raw, TRIGGERS.resolve_verbs)) {
      const detail = cleanFreeText(raw, [...TRIGGERS.resolve_complaint, ...TRIGGERS.resolve_verbs, ...TRIGGERS.resolve_fillers, 'ki', 'ka', 'ko', 'ke', 'کی', 'کا']);
      const ref = extractCustomerRef(raw, [...TRIGGERS.resolve_complaint, ...TRIGGERS.resolve_verbs, ...TRIGGERS.resolve_fillers, 'ki', 'ka', 'ko', 'ke', 'کی', 'کا'], SET_STATUS_VERBS);
      return R('resolve_complaint', { customer: ref || undefined, complaintDetail: detail || undefined, missing: ref ? [] : ['customer'] });
    }
    const list = parseComplaintList(t, raw); if (list) return list;
  }

  // 2. Expenses (add vs summary).
  if (hasAny(raw, TRIGGERS.add_expense)) {
    const sum = parseExpenseSummary(t, raw); if (sum) return sum;
    const amount = extractAmount(raw);
    const cat = detectExpenseCategory(raw);
    const title = cleanFreeText(stripAmount(raw), [...TRIGGERS.add_expense, ...TRIGGERS.expense_verbs, ...TRIGGERS.expense_fillers, ...expenseCatWords()]);
    const missing: string[] = [];
    if (!amount) missing.push('amount');
    if (!title) missing.push('expenseTitle');
    return R('add_expense', { amount: amount || undefined, expenseTitle: title || undefined, expenseCategory: cat, missing });
  }

  // 3. Money verbs — receipt generation vs payment recording.
  const receipt = parseGenerateReceipt(t, raw); if (receipt) return receipt;
  const payment = parseRecordPayment(t, raw); if (payment) return payment;

  // 4. Team messages.
  if (hasAny(raw, TRIGGERS.send_team_message) && hasAny(raw, TRIGGERS.message_verbs)) {
    const teamText = cleanFreeText(raw, [...TRIGGERS.send_team_message, ...TRIGGERS.message_verbs, ...TRIGGERS.message_fillers, 'ko', 'ko', 'کی', 'کا']);
    return R('send_team_message', { teamText: teamText || undefined, missing: teamText ? [] : ['teamText'] });
  }

  // 5. Reminders.
  if (hasAny(raw, TRIGGERS.mark_reminded) && hasAny(raw, TRIGGERS.remind_verbs)) {
    const ref = extractCustomerRef(raw, [...TRIGGERS.mark_reminded, ...TRIGGERS.remind_verbs, 'ko', 'ka', 'ki', 'ke', 'ko', 'کو', 'کا'], SET_STATUS_VERBS);
    return R('mark_reminded', { customer: ref || undefined, missing: ref ? [] : ['customer'] });
  }

  // 6. Add customer.
  if (hasAny(raw, TRIGGERS.add_customer)) {
    const name = cleanFreeText(raw, [...TRIGGERS.add_customer, 'ka', 'ki', 'ko', 'ke', 'کا', 'کی']);
    return R('add_customer', { customer: name ? { kind: 'name', value: name } : undefined, missing: name ? ['phone', 'monthlyFee'] : ['customer', 'phone', 'monthlyFee'] });
  }

  // 7. Edit customer.
  if (hasAny(raw, TRIGGERS.edit_customer)) {
    const { field, value } = detectEditField(raw);
    const ref = extractCustomerRef(raw, [...TRIGGERS.edit_customer, ...(field ? [field] : []), 'ka', 'ki', 'ko', 'ke', 'ka', 'کی'], SET_STATUS_VERBS);
    const missing: string[] = [];
    if (!ref) missing.push('customer');
    if (!field || !value) missing.push('editField');
    return R('edit_customer', { customer: ref || undefined, editField: field || undefined, editValue: value || undefined, missing });
  }

  // 8. Customer lookup / receipt history (fixed precedence — lookup before summary).
  const lookup = parseCustomerLookup(t, raw); if (lookup) return lookup;

  // 9. Summary / metrics.
  const summary = parseSummary(t, raw); if (summary) return summary;

  // 10. Open tab (before customer_list so "Open customer list" navigates).
  const tab = parseOpenTab(t, raw); if (tab) return tab;

  // 11. Customer list with filters.
  const list = parseCustomerList(t, raw); if (list) return list;

  return R('unclear');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function expenseCatWords(): string[] {
  const words: string[] = [];
  for (const [w] of EXPENSE_CATS) words.push(w);
  return words;
}

function detectExpenseCategory(raw: string): 'salary' | 'equipment' | 'rent' | 'utilities' | 'marketing' | 'other' {
  for (const [w, cat] of EXPENSE_CATS) {
    if (hasWord(raw, w)) return cat;
  }
  return 'other';
}

const EDIT_FIELDS: Array<{ field: string; words: string[] }> = [
  { field: 'phone', words: ['number', 'phone', 'mobile', 'فون'] },
  { field: 'address', words: ['address', 'pata', 'patah'] },
  { field: 'plan', words: ['plan', 'package', 'pkg'] },
  { field: 'monthlyFee', words: ['fee', 'fees', 'monthly fee'] },
  { field: 'name', words: ['naam', 'name'] },
];

function detectEditField(raw: string): { field?: string; value?: string } {
  for (const { field, words } of EDIT_FIELDS) {
    if (hasAny(raw, words)) {
      let value = cleanFreeText(raw, [...words, ...TRIGGERS.edit_customer, 'ka', 'ki', 'ko', 'ke', 'ki', 'کا']);
      if (field === 'monthlyFee') {
        const amt = extractAmount(raw);
        if (amt) return { field, value: String(amt) };
      }
      if (field === 'phone') {
        const pm = raw.match(/\b(\d{7,})\b/);
        if (pm) return { field, value: pm[1] };
      }
      if (value) return { field, value };
      return { field };
    }
  }
  return {};
}

/** Detect "October 2026" style month from text, else current period. */
export function detectPeriod(rawInput: string): string {
  const raw = romanizeUrdu(normalize(rawInput));
  for (const [w, idx] of MONTHS) {
    if (hasWord(raw, w)) {
      const now = new Date();
      const year = raw.match(/\b(20\d{2})\b/)?.[1] || String(now.getFullYear());
      return `${EN_MONTHS[idx]} ${year}`;
    }
  }
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
}

/** Human-readable help listing every intent in plain English. */
export function helpText(): string {
  return [
    'Here is what I can do — in English, Roman Urdu or اردو:',
    '',
    '• Navigation: "Open customer list" · "Receipts kholo"',
    '• Customer info: "Ali ka balance batao" · "Ali ki expiry"',
    '• Payments: "Ali se 1500 wasool hue" · "Sara ki 1500 ki receipt banao"',
    '• Payment history: "Ali ki akhri payments dikhao"',
    '• Status: "Ali ko band kar do" · "Sara ko chalu kar do"',
    '• Add customer: "Naya customer Ali"',
    '• Edit customer: "Ali ka number change karo 03001234567"',
    '• Expenses: "Kharcha 500 diesel" · "Is month ka kharcha"',
    '• Complaints: "Complaints dikhao" · "Ali ki complaint resolve kar do"',
    '• Reminders: "Ali ko reminder bhej diya"',
    '• Team: "Team ko message bhejo kal meeting hai"',
    '• Reports: "Kitne customers hain" · "Aaj ki collection kitni hui" · "Total balance"',
  ].join('\n');
}

export { esc, rs };
