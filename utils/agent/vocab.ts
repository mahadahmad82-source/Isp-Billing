// ─── Offline agent: trilingual vocabulary ────────────────────────────────────
// English + Roman Urdu + Urdu script trigger words. Everything is matched
// against normalized (lowercased, punctuation-stripped) text with Unicode
// word boundaries, so "ali" never matches inside "wali" and Urdu-script
// words like وصول match correctly.

export const CANCEL_WORDS = [
  'cancel', 'rehne do', 'rehne de', 'rehnay do', 'chor do', 'chhor do',
  'ruk jao', 'bas karo', 'nahi karna', 'no', 'nahe', 'نہیں کرنا',
] as const;

export const SKIP_WORDS = ['skip', 'koi nahi', 'rehne do', 'nahi hai', 'pata nahi'] as const;

export const MONEY_WORDS = ['rs', 'rupay', 'rupee', 'rupees', 'pkr', 'روپے', 'رقم'] as const;

export const TODAY_WORDS = ['aaj', 'aj', 'today', 'آج'] as const;

// ─── Navigation verbs ───────────────────────────────────────────────────────
export const NAV_VERBS = [
  'khol', 'kholo', 'kholen', 'open', 'show', 'dikha', 'dikhao', 'dikhaen',
  'jao', 'jaye', 'jauen', 'go', 'goto', 'tab', 'page', 'screen', 'chalo',
  'کھولو', 'دکھاؤ',
] as const;

// ─── Tabs (id must match App.tsx Tabs list) ─────────────────────────────────
export interface TabSyn { id: string; names: string[] }
export const TABS: TabSyn[] = [
  { id: 'dashboard', names: ['dashboard', 'home', 'dash board', 'main page'] },
  { id: 'users', names: ['customer list', 'customers', 'customer', 'users', 'user', 'clients', 'client list', 'customer directory', 'khata', 'گاہک'] },
  { id: 'receipts', names: ['receipts', 'receipt', 'rasid', 'raseed', 'raseedein', 'payments', 'payment', 'wasooli', 'رسید'] },
  { id: 'recoveries', names: ['recovery ledger', 'recoveries', 'recovery', 'ledger', 'wasooliyan', 'defaulters', 'udhaar', 'بقایا'] },
  { id: 'expiries', names: ['expiries', 'expiry', 'expiring', 'expire hone wale', 'khatam hone wale', 'renewal'] },
  { id: 'reports', names: ['reports', 'report', 'hisab', 'hisaab'] },
  { id: 'team', names: ['team', 'staff', 'agents', 'sub managers', 'submanagers', 'amel', 'عملہ'] },
  { id: 'complaints', names: ['complaints', 'complaint', 'shikayat', 'shikayatein', 'tickets', 'شکایت'] },
  { id: 'communication', names: ['communication', 'messages', 'sms', 'whatsapp messages', 'bulk sms'] },
  { id: 'expenses', names: ['expenses', 'expense', 'kharcha', 'kharche', 'kharchay', 'akharajat', 'خرچہ', 'کھرچہ'] },
  { id: 'analytics', names: ['analytics', 'analysis', 'charts', 'graphs'] },
  { id: 'leads', names: ['leads', 'lead', 'prospects', 'naye leads'] },
  { id: 'equipment', names: ['equipment', 'devices', 'stock', 'saman', 'inventory'] },
  { id: 'dealer-sales', names: ['dealer sales', 'dealer', 'dealers'] },
  { id: 'payment-verify', names: ['payment verify', 'verify payments', 'pending payments', 'approve payments'] },
  { id: 'outage', names: ['outage', 'outages', 'down', 'issue', 'network down', 'area down'] },
  { id: 'area', names: ['area', 'areas', 'zones', 'ilaka', 'ilakay'] },
  { id: 'reminders', names: ['reminders', 'reminder', 'yaad dehani', 'sms reminders'] },
  { id: 'invoice', names: ['invoice', 'invoices', 'bill book'] },
  { id: 'templates', names: ['templates', 'template', 'message templates', 'sms templates'] },
  { id: 'systemlogs', names: ['system logs', 'logs', 'activity log', 'history log'] },
  { id: 'settings', names: ['settings', 'setting', 'config', 'configuration', 'setup'] },
  // Admin tabs (rendering is already role-gated in App.tsx)
  { id: 'admin', names: ['admin', 'admin panel'] },
  { id: 'admin-overview', names: ['admin overview'] },
  { id: 'admin-managers', names: ['admin managers', 'all managers'] },
  { id: 'admin-customers', names: ['admin customers'] },
  { id: 'admin-activity', names: ['admin activity'] },
  { id: 'admin-system', names: ['admin system'] },
  { id: 'admin-subscriptions', names: ['admin subscriptions', 'subscriptions'] },
  { id: 'admin-pricing', names: ['admin pricing', 'pricing'] },
  { id: 'admin-wabot-saas', names: ['wabot saas', 'netbot saas'] },
];

// ─── Intent trigger words ───────────────────────────────────────────────────
export const TRIGGERS = {
  help: ['help', 'madad', 'kya kar sakte', 'kya karsakte', 'commands', 'options', 'guide', 'tarika', 'kaise', 'مدد'],
  record_payment: ['wasool', 'wasuli', 'wasooliyan', 'receive', 'received', 'jama', 'jamaa', 'payment', 'payments', 'ada', 'adaigi', 'diye', 'de diye', 'mile', 'mil gaye', 'collection', 'collected', 'pay kia', 'pay kiya', 'وصول', 'ادا', 'جمع'],
  generate_receipt: ['receipt', 'rasid', 'raseed', 'رسید'],
  receipt_verbs: ['banao', 'bana', 'banade', 'bana de', 'generate', 'nikal', 'nikalo', 'create', 'bana do', 'بناؤ'],
  show_verbs: ['dikha', 'dikhao', 'dikhaen', 'show', 'list', 'dekho', 'دکھاؤ'],
  suspend_words: ['band', 'bnd', 'disable', 'disabled', 'suspend', 'suspended', 'block', 'blocked', 'deactivate', 'rok', 'roko', 'bund', 'kat', 'kaat', 'معطل'],
  activate_words: ['chalu', 'chala', 'chalao', 'enable', 'enabled', 'activate', 'activated', 'unblock', 'unblocked', 'bahal', 'kholo connection', 'بحال'],
  add_customer: ['naya customer', 'new customer', 'customer add', 'add customer', 'client add', 'naya client', 'register customer', 'نیا گاہک'],
  edit_customer: ['change', 'badlo', 'badal', 'update', 'edit', 'set kar', 'kar do number', 'theek karo'],
  customer_fields: ['number', 'phone', 'mobile', 'address', 'pata', 'patah', 'plan', 'package', 'pkg', 'fee', 'fees', 'monthly fee', 'naam', 'name', 'فون'],
  add_expense: ['kharcha', 'kharch', 'kharach', 'expense', 'expenses', 'akharajat', 'خرچہ', 'کھرچہ', 'کھرچا'],
  expense_verbs: ['add', 'hua', 'ho gaya', 'hogaya', 'dalo', 'daal', 'likho', 'entry', 'ہوا'],
  expense_fillers: ['hua', 'huwa', 'ho', 'gaya', 'gya', 'hogaya', 'tha', 'thi', 'the', 'ka', 'ki', 'ke', 'ko', 'par', 'mein', 'me'],
  resolve_complaint: ['complaint', 'complaints', 'shikayat', 'shikayatein', 'ticket', 'شکایت'],
  resolve_verbs: ['resolve', 'resolved', 'hal', 'hal ho', 'theek', 'theek ho', 'close', 'closed', 'khatam', 'done', 'clear'],
  resolve_fillers: ['kar', 'karo', 'kar do', 'kardo', 'do', 'de', 'ko'],
  mark_reminded: ['remind', 'reminder', 'reminded', 'yaad', 'yaaddehani', 'yaad dehani'],
  remind_verbs: ['bhej', 'bhejo', 'bhej diya', 'de diya', 'kar diya', 'send kia', 'dila', 'dilao'],
  send_team_message: ['team', 'staff', 'amel', 'agents'],
  message_verbs: ['message', 'msg', 'paigham', 'bhejo', 'bhej', 'send', 'keh do', 'bol do', 'inform'],
  message_fillers: ['bhejo', 'bhej', 'karo', 'kar', 'do', 'de', 'ko'],
  customer_lookup: ['balance', 'batao', 'bataen', 'bill', 'kitna', 'expiry', 'expire', 'detail', 'details', 'info', 'information', 'maloom', 'dekho', 'check', 'kya hai', 'بیلنس'],
  customer_list: ['jin', 'jinka', 'jinke', 'wale', 'wali', 'walon', 'list', 'saray', 'sare', 'sab'],
  list_filters: ['zyada', 'kam', 'se zyada', 'se kam', 'above', 'below', 'over', 'under'],
  receipt_history: ['akhri', 'aakhri', 'last', 'pichli', 'pichle', 'previous', 'recent'],
  summary: ['kitne', 'kitna', 'kitni', 'total', 'summary', 'hisab', 'hisaab', 'kul', 'tadaad', 'ginti', 'کتنے', 'کتنا', 'کتنی'],
  metric_active: ['active', 'chalu', 'live'],
  metric_suspended: ['suspended', 'band', 'disabled', 'blocked'],
  metric_expired: ['expired', 'expire', 'khatam'],
  metric_expiring: ['expiring', 'expire hone wale', 'khatam hone wale'],
  metric_balance: ['balance', 'udhaar', 'pending', 'due', 'baki', 'بقایا'],
  metric_collection: ['collection', 'wasooli', 'wasool', 'income', 'aamdani', 'kamai', 'کلیکشن'],
  metric_expense: ['kharcha', 'expense', 'akharajat'],
  metric_complaint: ['complaint', 'shikayat', 'شکایت'],
} as const;

// ─── Months: English + Roman Urdu → 0-based index ───────────────────────────
export const MONTHS: Array<[string, number]> = [
  ['january', 0], ['janwari', 0], ['jan', 0],
  ['february', 1], ['farwari', 1], ['feb', 1],
  ['march', 2], ['mar', 2],
  ['april', 3], ['aprel', 3], ['apr', 3],
  ['may', 4], ['mae', 4],
  ['june', 5], ['jun', 5],
  ['july', 6], ['jul', 6],
  ['august', 7], ['agast', 7], ['aug', 7],
  ['september', 8], ['sitambar', 8], ['sep', 8], ['sept', 8],
  ['october', 9], ['aktobar', 9], ['oct', 9],
  ['november', 10], ['nawambar', 10], ['nov', 10],
  ['december', 11], ['disambar', 11], ['dec', 11],
];
export const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Expense categories ─────────────────────────────────────────────────────
export const EXPENSE_CATS: Array<[string, 'salary' | 'equipment' | 'rent' | 'utilities' | 'marketing' | 'other']> = [
  ['salary', 'salary'], ['tankhah', 'salary'], ['tankhwa', 'salary'], ['pay', 'salary'],
  ['equipment', 'equipment'], ['device', 'equipment'], ['saman', 'equipment'], ['cable', 'equipment'], ['router', 'equipment'],
  ['rent', 'rent'], ['kiraya', 'rent'], ['kiraaya', 'rent'],
  ['utilities', 'utilities'], ['bijli', 'utilities'], ['bill', 'utilities'], ['utility', 'utilities'],
  ['marketing', 'marketing'], ['ads', 'marketing'], ['advertising', 'marketing'],
];

// ─── Ordinals for disambiguation ("pehla", "1") ─────────────────────────────
export const ORDINALS: Record<string, number> = {
  '1': 1, 'pehla': 1, 'pehle': 1, 'first': 1,
  '2': 2, 'dusra': 2, 'dosra': 2, 'second': 2,
  '3': 3, 'teesra': 3, 'tisra': 3, 'third': 3,
};
