// ─── Offline agent: text normalization ───────────────────────────────────────
// Pure functions only — no DOM, no network, no dependencies. This module is
// intentionally portable so the same parser can later run inside the native
// Android app.

const URDU_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** Lowercase, Urdu/Arabic digits → Latin, strip punctuation, collapse spaces. */
export function normalize(text: string): string {
  let s = (text || '').toLowerCase();
  s = s.replace(/[۰-۹٠-٩]/g, d => URDU_DIGITS[d] || d);
  // Keep letters (any script) and digits; everything else becomes a space.
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Escape a literal for use inside a RegExp. */
export function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `word` appears in normalized text as a whole word/phrase.
 * Uses Unicode letter lookarounds instead of \b so Urdu-script words
 * (e.g. وصول) match correctly — \b is ASCII-only and never matches
 * around non-Latin letters.
 */
export function hasWord(text: string, word: string): boolean {
  if (!word) return false;
  return new RegExp(`(?<!\\p{L})${esc(word)}(?!\\p{L})`, 'u').test(text);
}

/** True when any of the words appears in the text. */
export function hasAny(text: string, words: readonly string[]): boolean {
  return words.some(w => hasWord(text, w));
}

/** Count how many of the words appear in the text (for scoring). */
export function countHits(text: string, words: readonly string[]): number {
  let n = 0;
  for (const w of words) if (hasWord(text, w)) n++;
  return n;
}

/** Classic Levenshtein edit distance (for typo-tolerant name matching). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

// ─── Urdu → Roman transliteration ───────────────────────────────────────────
// Lets Urdu-script names (علی) match Latin-script customer records (Ali Raza).
// Word-boundaried so running text is never garbled.

const URDU_ROMAN: Array<[string, string]> = [
  ['عبداللہ', 'abdullah'], ['محمد', 'muhammad'], ['احمد', 'ahmad'], ['محمود', 'mahmood'],
  ['فاطمہ', 'fatima'], ['عائشہ', 'ayesha'], ['مریم', 'maryam'], ['زین', 'zain'],
  ['حسن', 'hassan'], ['حسین', 'hussain'], ['رضا', 'raza'], ['علی', 'ali'],
  ['خان', 'khan'], ['بلال', 'bilal'], ['حمزہ', 'hamza'],
  ['طلحہ', 'talha'], ['دانش', 'danish'], ['عمران', 'imran'], ['سارہ', 'sara'],
  ['سارا', 'sara'], ['نور', 'noor'], ['عاصم', 'asim'], ['قاسم', 'qasim'],
  ['نعمان', 'noman'], ['شاہد', 'shahid'], ['جاوید', 'javed'], ['خالد', 'khalid'],
  ['سعید', 'saeed'], ['راشد', 'rashid'], ['وقاص', 'waqas'], ['فیصل', 'faisal'],
  ['کامران', 'kamran'], ['آصف', 'asif'], ['یاسر', 'yasir'], ['زبیر', 'zubair'],
  ['حارث', 'haris'], ['انس', 'anas'], ['معاذ', 'muaz'], ['ابوبکر', 'abubakar'],
  ['صدیق', 'siddiq'], ['فاروق', 'farooq'], ['عمر', 'umar'], ['عثمان', 'usman'],
  // command words
  ['آج', 'aaj'], ['کل', 'kal'], ['وصول', 'wasool'], ['کلیکشن', 'collection'],
  ['کتنی', 'kitni'], ['کتنا', 'kitna'], ['کتنے', 'kitne'], ['ہوئی', 'hui'],
  ['ہوئے', 'hue'], ['ہوا', 'hua'], ['کھولو', 'kholo'], ['دکھاؤ', 'dikhao'],
];

export function romanizeUrdu(text: string): string {
  let s = ` ${text} `;
  for (const [ur, ro] of URDU_ROMAN) {
    s = s.replace(new RegExp(`(?<!\\p{L})${esc(ur)}(?!\\p{L})`, 'gu'), ` ${ro} `);
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** "October 2026" style billing period for the given date. */
export function periodLabel(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
}

/** "15 October 2026" style display date. */
export function displayDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${periodLabel(d).split(' ')[0]} ${d.getFullYear()}`;
}

/** Rs.1,500 style amount. */
export function rs(n: number): string {
  return `Rs.${(Number(n) || 0).toLocaleString('en-US')}`;
}
