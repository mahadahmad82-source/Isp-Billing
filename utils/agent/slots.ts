// ─── Offline agent: slot extraction ─────────────────────────────────────────
// Amounts, customer references, ordinal selection, message/expense text.

import { normalize, hasWord, hasAny, esc } from './normalize';
import { MONEY_WORDS, ORDINALS } from './vocab';

/** Extract the first amount from text: "Rs.1,500", "1500 rupees", "1500". */
export function extractAmount(text: string): number | null {
  let t = text.replace(/,/g, '').replace(/-/g, ' ');
  const m1 = t.match(/(\d+(?:\.\d+)?)\s*(?:rs|rupay|rupee|rupees|pkr|روپے|رقم)/);
  if (m1) return Number(m1[1]);
  const m2 = t.match(/(?:rs|rupay|rupee|rupees|pkr|روپے|رقم)\s*(\d+(?:\.\d+)?)/);
  if (m2) return Number(m2[1]);
  const m3 = t.match(/\b(\d{3,}(?:\.\d+)?)\b/);
  if (m3) return Number(m3[1]);
  return null;
}

/**
 * Remove an already-extracted amount from text so it can't be re-extracted
 * as a customer reference or free text.
 */
export function stripAmount(text: string): string {
  let t = text.replace(/,/g, '');
  t = t.replace(/\b\d+(?:\.\d+)?\s*(?:rs|rupay|rupee|rupees|pkr|روپے|رقم)\b/g, ' ');
  t = t.replace(/\b(?:rs|rupay|rupee|rupees|pkr|روپے|رقم)\s*\d+(?:\.\d+)?\b/g, ' ');
  t = t.replace(/\b\d{3,}(?:\.\d+)?\b/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export interface CustomerRef { kind: 'name' | 'username' | 'phone'; value: string }

/**
 * Extract a customer reference. Prefers @username, then a phone (last 10
 * digits), then a name by removing command words. Ambiguity (multiple
 * matches, short names) is handled by resolveCustomer().
 */
export function extractCustomerRef(
  text: string,
  customerWords: readonly string[],
  statusWords: readonly string[],
  extraStrip: readonly string[] = [],
): CustomerRef | null {
  const um = text.match(/@([\p{L}\p{N}_.-]+)/u);
  if (um) return { kind: 'username', value: um[1] };
  const pm = text.match(/\b(\d{10,})\b/);
  if (pm) return { kind: 'phone', value: pm[1].slice(-10) };

  let rest = ' ' + text + ' ';
  // Longest phrases first so "bhej diya" is stripped before "bhej".
  const ordered = [...customerWords, ...statusWords, ...extraStrip, ...MONEY_WORDS]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const w of ordered) {
    rest = rest.replace(new RegExp(`(?<!\\p{L})${esc(w)}(?!\\p{L})`, 'gu'), ' ');
  }
  rest = rest.replace(/\s+/g, ' ').trim();
  const words = rest.split(' ').filter(w => w && w.length > 1 && !/^\d+$/.test(w));
  if (words.length === 0) return null;
  const value = words.slice(0, 3).join(' ');
  if (value.length < 2) return null;
  return { kind: 'name', value };
}

export interface ResolvedCustomer {
  kind: 'none' | 'one' | 'ambiguous';
  customer?: { id: string; name: string; username: string; phone?: string };
  candidates?: Array<{ id: string; name: string; username: string; phone?: string }>;
}

interface CustomerLike { id: string; name: string; username: string; phone?: string }

/**
 * Resolve a CustomerRef against the customer list.
 * - exact username → one
 * - exact name → one
 * - phone (last 10 digits) → one or none
 * - substring match → one / ambiguous / none
 * Short names (< 3 chars) are refused — too ambiguous.
 */
export function resolveCustomer(ref: CustomerRef | null, users: CustomerLike[]): ResolvedCustomer {
  if (!ref) return { kind: 'none' };
  if (ref.kind === 'username') {
    const q = ref.value.toLowerCase();
    const exact = users.filter(u => u.username?.toLowerCase() === q);
    if (exact.length === 1) return { kind: 'one', customer: exact[0] };
    const part = users.filter(u => u.username?.toLowerCase().includes(q));
    return matchResult(part);
  }
  if (ref.kind === 'phone') {
    const part = users.filter(u => (u.phone || '').replace(/\D/g, '').slice(-10) === ref.value);
    return matchResult(part);
  }
  const q = ref.value.toLowerCase();
  if (q.length < 3) return { kind: 'none' };
  const exact = users.filter(u => u.name?.toLowerCase() === q);
  if (exact.length === 1) return { kind: 'one', customer: exact[0] };
  const part = users.filter(u =>
    (u.name && (u.name.toLowerCase().includes(q) || q.includes(u.name.toLowerCase()))) ||
    u.username?.toLowerCase().includes(q)
  );
  return matchResult(part);
}

function matchResult(part: CustomerLike[]): ResolvedCustomer {
  if (part.length === 0) return { kind: 'none' };
  if (part.length === 1) return { kind: 'one', customer: part[0] };
  return { kind: 'ambiguous', candidates: part.slice(0, 3) };
}

/** Ordinal selection ("pehla", "dusra", "1") → index 0..2, or null. */
export function extractOrdinal(text: string): number | null {
  const t = normalize(text);
  for (const [w, n] of Object.entries(ORDINALS)) {
    if (hasWord(t, w)) return n - 1;
  }
  return null;
}

/** Remove filler words, return clean free-text for messages/expenses/resolutions. */
export function cleanFreeText(text: string, fillers: readonly string[], customerValue?: string): string {
  let t = ' ' + text + ' ';
  const ordered = [...fillers, ...MONEY_WORDS].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const w of ordered) {
    t = t.replace(new RegExp(`(?<!\\p{L})${esc(w)}(?!\\p{L})`, 'gu'), ' ');
  }
  if (customerValue) {
    t = t.replace(new RegExp(`(?<!\\p{L})${esc(customerValue)}(?!\\p{L})`, 'gu'), ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** True when the text is an affirmative confirmation. */
export function isAffirmative(text: string): boolean {
  const t = normalize(text);
  return hasAny(t, [
    'haan', 'han', 'jee', 'ji', 'yes', 'yeah', 'yep', 'ok', 'okay',
    'theek', 'kar do', 'kardo', 'confirm', 'save', 'bas', 'done',
    'ہاں', 'جی',
  ]);
}

/** True when the text is a cancellation. */
export function isNegative(text: string): boolean {
  const t = normalize(text);
  return hasAny(t, [
    'cancel', 'rehne do', 'rehne de', 'rehnay do', 'chor do', 'chhor do',
    'ruk jao', 'bas karo', 'nahi karna', 'no', 'nahe', 'نہیں کرنا',
  ]);
}
