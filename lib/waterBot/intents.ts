// Water-supplier WhatsApp bot: deterministic intent detection (Roman Urdu / English / Urdu script).
// Pure functions, no I/O. Deliberately NO LLM: a water bot must never invent amounts or promises.
// Lesson from the Copilot confirmation bug: negations are checked BEFORE affirmative-looking words.

export type WaterIntent =
  | 'order' | 'cancel_order' | 'balance' | 'bottles_out' | 'order_status'
  | 'complaint' | 'greeting' | 'thanks' | 'menu' | 'unknown';

export interface WaterParse { intent: WaterIntent; qty: number | null }

const URDU_DIGITS = '\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9';
const ARABIC_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';

export function normalizeWaterText(input: string): string {
  let s = (input || '').toLowerCase();
  s = s.replace(/[\u06f0-\u06f9]/g, c => String(URDU_DIGITS.indexOf(c)))
       .replace(/[\u0660-\u0669]/g, c => String(ARABIC_DIGITS.indexOf(c)));
  s = s.replace(/[\u064b-\u065f\u0670]/g, '');            // Arabic diacritics
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');                // punctuation / emoji -> space
  return s.replace(/\s+/g, ' ').trim();
}

// Roman Urdu number words + Urdu script
const WORD_NUMBERS: Record<string, number> = {
  ek: 1, aik: 1, one: 1, '\u0627\u06cc\u06a9': 1,
  do: 2, two: 2, '\u062f\u0648': 2,
  teen: 3, tin: 3, three: 3, '\u062a\u06cc\u0646': 3,
  char: 4, chaar: 4, four: 4, '\u0686\u0627\u0631': 4,
  paanch: 5, panch: 5, five: 5, '\u067e\u0627\u0646\u0686': 5,
  chhe: 6, che: 6, chay: 6, six: 6, '\u0686\u06c1': 6,
  saat: 7, seven: 7, '\u0633\u0627\u062a': 7,
  aath: 8, ath: 8, eight: 8, '\u0622\u0679\u06be': 8,
  nau: 9, nine: 9, '\u0646\u0648': 9,
  das: 10, ten: 10, '\u062f\u0633': 10,
};

const MAX_AUTO_QTY = 100;
const BOTTLE_UNITS = ['bottle', 'bottles', 'botal', 'botel', 'bottel', 'botlein', 'botlain', 'can', 'cans', 'gallon', 'jar', '\u0628\u0648\u062a\u0644'];

function hasWord(t: string, words: string[]): boolean {
  const set = new Set(t.split(' '));
  return words.some(w => (w.includes(' ') ? ` ${t} `.includes(` ${w} `) : set.has(w)));
}

export function parseQty(text: string): number | null {
  const t = normalizeWaterText(text);
  const digits = t.match(/(?:^|\s)(\d{1,4})(?:\s|$|x)/);
  if (digits) {
    const n = parseInt(digits[1], 10);
    return n >= 1 && n <= MAX_AUTO_QTY ? n : null;
  }
  const attached = t.match(/(\d{1,4})\s?(?:bottle|bottles|botal|botel|bottel|can|cans|gallon|jar|\u0628\u0648\u062a\u0644)/);
  if (attached) {
    const n = parseInt(attached[1], 10);
    return n >= 1 && n <= MAX_AUTO_QTY ? n : null;
  }
  // Number WORDS only count when they sit directly before a bottle word ("teen bottle").
  // Otherwise "bhej DO" (= "send") would be read as the number two.
  const toks = t.split(' ');
  for (let i = 0; i < toks.length - 1; i++) {
    if (WORD_NUMBERS[toks[i]] && BOTTLE_UNITS.includes(toks[i + 1])) return WORD_NUMBERS[toks[i]];
  }
  return null;
}

const BOTTLE_WORDS = ['bottle', 'bottles', 'botal', 'botel', 'bottel', 'botlein', 'botlain', 'can', 'cans', 'gallon', 'jar', 'pani', 'water', 'paani', '\u0628\u0648\u062a\u0644', '\u067e\u0627\u0646\u06cc'];

const GREETING = ['salam', 'salaam', 'assalam', 'assalamualaikum', 'aoa', 'hi', 'hello', 'hey', 'helo', 'hy', '\u0633\u0644\u0627\u0645', '\u0627\u0644\u0633\u0644\u0627\u0645'];
const THANKS = ['shukriya', 'shukria', 'thanks', 'thank', 'jazakallah', 'jazak', 'meherbani', '\u0634\u06a9\u0631\u06cc\u06c1'];
const MENU = ['menu', 'help', 'madad', 'options', 'kya kar sakte'];

const CANCEL = ['cancel', 'mat bhejna', 'mat bhejein', 'mat bhejo', 'nahi chahiye', 'nahi chahie', 'nai chahiye', 'nhi chahiye', 'rehne do', 'rahne do', 'order cancel', 'order khatam', 'mat lana', '\u0645\u062a \u0628\u06be\u06cc\u062c\u0646\u0627', '\u0646\u06c1\u06cc\u06ba \u0686\u0627\u06c1\u06cc\u06d2'];

const COMPLAINT = ['complaint', 'shikayat', 'shikaiyat', 'masla', 'masla', 'problem', 'ganda', 'gandi', 'kharab', 'badbu', 'leak', 'leaking', 'toot', 'tooti', 'toota', 'nahi aayi', 'nahi ayi', 'nahi aai', 'nahi aya', 'nahi aaya', 'nahi mili', 'nahi mila', 'nai aayi', 'nai aya', 'late', 'dair', 'deir', 'der se', 'kam bottle', 'kam deli', 'ghalat', 'galat', '\u0634\u06a9\u0627\u06cc\u062a', '\u0645\u0633\u0626\u0644\u06c1'];

const BALANCE = ['hisaab', 'hisab', 'hissab', 'balance', 'bill', 'baqi', 'baqaya', 'baaqi', 'baqaya', 'udhaar', 'udhar', 'due', 'paise', 'raqam', 'rupay', 'rupee', 'payment', 'kitne paise', 'kitna bill', 'total', '\u062d\u0633\u0627\u0628', '\u0628\u0644', '\u0628\u0627\u0642\u06cc'];

const BOTTLES_OUT = ['kitni bottle', 'kitni bottles', 'kitne bottle', 'kitni botal', 'kitni botlein', 'mere pas', 'mere paas', 'mere kol', 'baqi bottle', 'baqi bottles', 'empty kitni', 'empties', 'khali bottle', 'khali', 'bottles hain', 'bottle hain'];

const STATUS = ['kab aayega', 'kab ayega', 'kab aayegi', 'kab ayegi', 'kab ayen gi', 'kab tak', 'kitni der', 'kab pohnchegi', 'kab pohanchegi', 'kab milegi', 'kab milega', 'delivery status', 'status', 'order ka', 'mera order', 'kahan hai', 'kahan hain', 'aaj aayegi', 'aaj ayegi', 'aaj aaye gi', '\u06a9\u0628 \u0622\u0626\u06d2 \u06af\u06cc'];

const ORDER_VERBS = ['bhej', 'bhejo', 'bhejna', 'bhejein', 'bhijwa', 'bhijwao', 'mangwa', 'mangwao', 'chahiye', 'chahie', 'chahiyen', 'chahiyein', 'lagwa', 'send', 'need', 'want', 'order', 'dena', 'do', 'de', 'dijiye', 'dijye', 'bhijwana', 'lao', 'laana', 'lana', '\u0628\u06be\u06cc\u062c', '\u0686\u0627\u06c1\u06cc\u06d2'];

export function detectWaterIntent(text: string): WaterParse {
  const t = normalizeWaterText(text);
  if (!t) return { intent: 'unknown', qty: null };

  // 1) Cancellation first (it contains order-ish words like "bhejna"/"chahiye")
  if (hasWord(t, CANCEL)) return { intent: 'cancel_order', qty: null };

  // 2) Complaints before orders ("bottle nahi aayi" is a complaint, not an order)
  if (hasWord(t, COMPLAINT)) return { intent: 'complaint', qty: null };

  // 3) Questions about stock / status / money
  if (hasWord(t, BOTTLES_OUT)) return { intent: 'bottles_out', qty: null };
  if (hasWord(t, STATUS)) return { intent: 'order_status', qty: null };
  if (hasWord(t, BALANCE)) return { intent: 'balance', qty: null };

  // 4) Order: needs a bottle/water word OR a quantity, together with an order verb or bare "N bottle"
  const qty = parseQty(t);
  const mentionsBottle = hasWord(t, BOTTLE_WORDS);
  const hasVerb = hasWord(t, ORDER_VERBS);
  if ((mentionsBottle && (hasVerb || qty !== null)) || (qty !== null && hasVerb)) {
    return { intent: 'order', qty };
  }
  if (mentionsBottle) return { intent: 'order', qty };   // "pani" / "bottle" alone => treat as order, handler will ask/confirm qty

  // 5) Small talk
  if (hasWord(t, THANKS)) return { intent: 'thanks', qty: null };
  if (hasWord(t, MENU)) return { intent: 'menu', qty: null };
  if (hasWord(t, GREETING)) return { intent: 'greeting', qty: null };

  return { intent: 'unknown', qty: null };
}
