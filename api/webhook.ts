// api/webhook.ts — Ayesha Bot v6 | MahadNet WhatsApp Support
// Dynamic packages from Supabase + Router catalog with images + session state

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';
const IMG_BASE = 'https://raw.githubusercontent.com/mahadahmad82-source/Isp-Billing/main/public/whatsapp-images';

// ══════════════════════════════════════════════════════
// ⚙️  MAHADNET CONFIG
// ══════════════════════════════════════════════════════
const CONFIG = {
  businessName: 'MahadNet',
  supportNumber: '0304-2773453',
  ownerName: 'Mahad',

  fiberPricePerMeter: 30,

  fiberInfo: `🌐 *Naya Fiber Connection*

💵 Fiber cable (2-core): *Rs. 30/meter*
📏 Final fiber charges ghar tak ki length pe depend karenge — hamara technician site visit pe exact reading le kar confirm karega.

Sirf yeh chahiye aap ke paas:
• Fiber Optic ONU/Router (GPON device)
• Fiber patch cord

Agar yeh nahi hai aap ke paas, koi masla nahi — hum se naya router ya fiber purchase kar sakte hain! Router dekhne ke liye *"router"* likh kar bhejein. 📡

📍 Apna area batain, coverage check karke confirm karti hoon!`,

  routers: {
    '2.4g': [
      {
        model: 'GS3101',
        company: 'China Mobile',
        band: '2.4GHz Single Band',
        price: 3000,
        image: `${IMG_BASE}/gs3101.jpg`,
        specs: `📡 *GS3101 — China Mobile*
💰 Price: Rs. 3,000

🔧 *Specs:*
• Chipset: EcoNet EN7526F @ 900MHz
• Memory: 256MB RAM + 256MB Flash
• Ports: 1x Gigabit + 3x Fast Ethernet
• Fiber: GPON/EPON auto-detect
• WiFi: 2.4GHz (802.11 b/g/n)
• Extra: 1x VoIP port + 1x USB 2.0

📶 *Range:* 1-2 rooms (30-40 feet), 1 deewar cross karta hai achi tarah
✅ *Best for:* Budget-friendly, single room/small space use, stable connection`,
      },
      {
        model: 'HG8546M',
        company: 'Huawei EchoLife',
        band: '2.4GHz Single Band',
        price: 3500,
        image: `${IMG_BASE}/huawei-hg8546m.jpg`,
        specs: `📡 *Huawei EchoLife HG8546M*
💰 Price: Rs. 3,500

🔧 *Specs:*
• PON: XPON (GPON/EPON adaptive)
• Ports: 1x Gigabit + 3x Fast Ethernet
• WiFi: 2.4GHz only (802.11 b/g/n, 2x2 MIMO)
• Antennas: 2x External (5dBi)
• Extra: 1x Telephone port + 1x USB 2.0

📶 *Range:* Open space mein 60-80 feet, indoor 1 deewar easily, 2+ deewaron ke baad weak
✅ *Best for:* 10 marla ghar ka 1 floor (center mein lagayein)`,
      },
    ],
    '5g': [
      {
        model: 'Q2 Dual Band',
        company: 'Huawei',
        band: '5GHz + 2.4GHz Dual Band',
        price: 6000,
        image: `${IMG_BASE}/huawei-q2.jpg`,
        specs: `📡 *Huawei Q2 — Dual Band 5G*
💰 Price: Rs. 6,000 _(Refurbished)_
📦 Box mein: Router + Original Power Adapter

🔧 *Specs:*
• Dedicated Gigabit WAN — full speed, no drop
• 5GHz Ultra-Speed WiFi — low ping, 4K streaming
• Heavy bandwidth handling, 24/7 use
• 64 devices ek sath connect ho sakte hain

📶 *Range:* Moti deewaron ke through bhi 50-80 feet — 2-3 kamron ya pure medium flat ke liye perfect
✅ *Best for:* Gaming, multiple devices, bara ghar/flat`,
      },
    ],
  } as Record<string, Array<{ model: string; company: string; band: string; price: number; image: string; specs: string }>>,

  bankAccounts: `💳 *Payment Options:*

🏦 *Askari Bank*
   Title: MAHAD AHMAD KHAN LODHI
   Account: 0032060001238
   IBAN: PK32ASCM000032060001238

🏦 *Meezan Bank*
   Title: MAHAD AHMAD KHAN LODHI
   Account: 00300112164874
   IBAN: PK82MEZN0000300112164874

💚 *NayaPay*
   IBAN: PK42NAYA1234503282200943

📱 *EasyPaisa / JazzCash:* 03042773453

✅ Payment ke baad screenshot is number pe zaroor bhejein!`,
};

// ══════════════════════════════════════════════════════
// 🔧 SUPABASE HELPERS
// ══════════════════════════════════════════════════════
const normPhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

async function findCustomer(from: string) {
  const norm = normPhone(from);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) { console.error('[Supabase] fetch failed:', res.status); return null; }
    const rows: any[] = await res.json();

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const users: any[] = row.data?.users || [];
      const user = users.find((u: any) =>
        u && u.status !== 'deleted' &&
        (normPhone(u.phone) === norm || normPhone(u.phone2) === norm)
      );
      if (user) {
        const receipts: any[] = (row.data?.receipts || [])
          .filter((r: any) => r.userId === user.id && r.status === 'Success')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
        const planPrices: Record<string, number> = row.data?.settings?.planPrices || {};
        console.log(`✅ Customer found: ${user.name} | bal=${user.balance}`);
        return { managerId: row.manager_id, rowData: row.data, user, receipts, planPrices };
      }
    }
    console.log(`⚠️ No customer for: ${norm}`);
  } catch (e: any) { console.error('[findCustomer]', e?.message); }
  return null;
}

// Get planPrices from ANY manager (used when sender isn't a known customer yet)
async function getAnyPlanPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data&manager_id=eq.mahadnet`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    if (rows?.[0]?.data?.settings?.planPrices) return rows[0].data.settings.planPrices;
  } catch (e: any) { console.error('[getAnyPlanPrices]', e?.message); }
  return {};
}

async function saveComplaint(managerId: string, rowData: any, user: any, issue: string) {
  const t = issue.toLowerCase();
  const priority = /urgent|emergency|2\s*din|3\s*din|kal\s*se|bilkul\s*nahi|completely/.test(t)
    ? 'high' : /slow|thoda|kabhi/.test(t) ? 'low' : 'medium';
  const ticketId = `WA-${Date.now()}`;
  const complaints = [...(rowData.complaints || []), {
    id: ticketId, customerId: user.id, customerName: user.name,
    customerPhone: user.phone, title: `WA: ${issue.slice(0, 60)}`,
    description: issue, status: 'open', priority,
    createdAt: new Date().toISOString(), createdBy: 'ayesha_bot',
  }];
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...rowData, complaints } }),
    });
    console.log(`✅ Complaint saved: ${ticketId} (${priority})`);
    await notifyManager(managerId, { ...rowData, complaints }, {
      title: '🛠️ Nayi Complaint (WhatsApp)',
      message: `${user.name}: ${issue.slice(0, 100)}`,
      priority: priority === 'high' ? 'HIGH' : priority === 'low' ? 'LOW' : 'MEDIUM',
    });
  } catch (e: any) { console.error('[saveComplaint]', e?.message); }
  return ticketId;
}

async function getManagerRow(managerId: string): Promise<any | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=data&manager_id=eq.${managerId}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    return rows?.[0]?.data || null;
  } catch (e: any) { console.error('[getManagerRow]', e?.message); return null; }
}

async function notifyManager(managerId: string, rowData: any, notif: { title: string; message: string; priority?: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  try {
    const newNotif = {
      id: `wa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'SYSTEM',
      priority: notif.priority || 'MEDIUM',
      title: notif.title,
      message: notif.message,
      timestamp: new Date().toISOString(),
    };
    const pending = [...(rowData.pendingManagerNotifications || []), newNotif];
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...rowData, pendingManagerNotifications: pending } }),
    });
  } catch (e: any) { console.error('[notifyManager]', e?.message); }
}

async function saveLead(managerId: string, rowData: any, lead: { name: string; phone: string; address: string; area?: string; interestedPlan?: string; note?: string; source: string }) {
  const now = new Date().toISOString();
  const newLead = {
    id: `lead-${Date.now()}`,
    name: lead.name, phone: lead.phone, address: lead.address, area: lead.area,
    interestedPlan: lead.interestedPlan, status: 'new', note: lead.note,
    source: lead.source, createdAt: now, updatedAt: now,
  };
  const leads = [...(rowData.leads || []), newLead];
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...rowData, leads } }),
    });
  } catch (e: any) { console.error('[saveLead]', e?.message); }
  return newLead.id;
}

// ── Lightweight session state (for 2.4G/5G sub-menu) ──────────────────────────
async function getSession(phone: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const sessions = rows?.[0]?.data?.sessions || {};
    return sessions[phone]?.state || null;
  } catch (e: any) { console.error('[getSession]', e?.message); return null; }
}

async function setSession(phone: string, state: string | null) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const existing = rows?.[0]?.data || { sessions: {} };
    const sessions = existing.sessions || {};
    if (state) sessions[phone] = { state, ts: Date.now() };
    else delete sessions[phone];

    if (rows?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ data: { ...existing, sessions } }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ manager_id: '_bot_sessions', data: { sessions } }),
      });
    }
  } catch (e: any) { console.error('[setSession]', e?.message); }
}

async function hasGreetedBefore(phone: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const greeted: string[] = rows?.[0]?.data?.greetedPhones || [];
    return greeted.includes(phone);
  } catch (e: any) { console.error('[hasGreetedBefore]', e?.message); return false; }
}

async function markGreetedBefore(phone: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const existing = rows?.[0]?.data || { sessions: {} };
    const greeted: string[] = existing.greetedPhones || [];
    if (!greeted.includes(phone)) greeted.push(phone);
    if (rows?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ data: { ...existing, greetedPhones: greeted } }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ manager_id: '_bot_sessions', data: { sessions: {}, greetedPhones: greeted } }),
      });
    }
  } catch (e: any) { console.error('[markGreetedBefore]', e?.message); }
}

// ══════════════════════════════════════════════════════
// 🧠 INTENT DETECTION
// ══════════════════════════════════════════════════════
type Intent =
  | 'greeting' | 'menu_complaint' | 'menu_bill' | 'menu_payment'
  | 'menu_expiry' | 'menu_new_conn' | 'menu_packages'
  | 'complaint' | 'bill' | 'payment_how' | 'payment_history'
  | 'expiry' | 'new_conn' | 'packages' | 'router_info'
  | 'router_24g' | 'router_5g' | 'personal'
  | 'password_change' | 'coverage';

function detectIntent(text: string): Intent {
  const t = text.trim().toLowerCase();

  // Router band selection (checked first — works regardless of session)
  if (/^1$|2\.?4\s*g(hz)?|single\s*band/.test(t) && /\b(2\.?4|g(hz)?|single)\b/.test(t)) {
    // handled separately with session check
  }
  if (/2\.?4\s*g(hz)?|single\s*band/.test(t)) return 'router_24g';
  if (/\b5\s*g(hz)?\b|dual\s*band/.test(t)) return 'router_5g';

  // Numbered main menu
  if (/^1$/.test(t)) return 'menu_complaint';
  if (/^2$/.test(t)) return 'menu_bill';
  if (/^3$/.test(t)) return 'menu_payment';
  if (/^4$/.test(t)) return 'menu_expiry';
  if (/^5$/.test(t)) return 'menu_new_conn';
  if (/^6$/.test(t)) return 'menu_packages';

  // Greeting
  if (/^(as+ala+m+[\w\s]*|aoa|a\.?o\.?a\.?|salam+|hi+|hey+|hello+|good\s*(morning|evening|night|afternoon)|kya\s*hal|assalamu)/.test(t) && t.length < 60)
    return 'greeting';

  if (/password\s*(bhool|change|reset|nahi\s*yaad|pata\s*nahi|update)|wifi\s*ka\s*password|router\s*(ka\s*)?password|password\s*(kese|kaise)/.test(t)) return 'password_change';
  if (/coverage|area\s*cover|cover\s*hota|service\s*available|yaha\s*available|hamare\s*area|apke\s*area|hamara\s*area/.test(t)) return 'coverage';
  if (/router|device|modem|equipment|hardware|onu/.test(t)) return 'router_info';
  if (/package|plan|price|pricing|kitna\s*hoga|rates?|speed|mbps|fiber/.test(t)) return 'packages';
  if (/history|pichle\s*pay|kin\s*kin|purani\s*pay|payment\s*list/.test(t)) return 'payment_history';
  if (/kese\s*pay|kaise\s*pay|payment\s*kaise|kahan\s*pay|account\s*num|bank\s*detail|easypaisa|jazzcash|nayapay|transfer/.test(t)) return 'payment_how';
  if (/expir|khatam|kab\s*band|band\s*hoga|kitne\s*din|end\s*date/.test(t)) return 'expiry';
  if (/complaint|shikayat|internet\s*(nahi|band|slow|down|problem)|net\s*(nahi|band|slow|down)|speed\s*(slow|kam)|wifi\s*(nahi|band)|masla|issue|kharab|chal\s*nahi|nahi\s*chal/.test(t)) return 'complaint';
  if (/bill|balance|dues|arrear|baqi|kitna\s*banta|kitna\s*hai|monthly|fees?/.test(t)) return 'bill';
  if (/nay[ai]\s*conn|new\s*conn|install|lagwana|connection\s*chahiye|naya\s*lena/.test(t)) return 'new_conn';

  return 'personal';
}

// ══════════════════════════════════════════════════════
// 💬 STATIC REPLY BUILDERS
// ══════════════════════════════════════════════════════

function welcomeMenu(name?: string, isFirstTime?: boolean): string {
  const greet = name
    ? `Walaikum Assalam, *${name}*! 😊`
    : `Walaikum Assalam! 😊 MahadNet Support mein khushamdeed!`;
  const intro = isFirstTime ? `\n\nMain *Ayesha* hoon, aap ki dedicated support executive.` : '';
  return `${greet}${intro}

Aap kis cheez mein madad chahte hain? Neeche se option chunein:

1️⃣  Internet Complaint / Masla
2️⃣  Bill aur Balance Check
3️⃣  Payment Methods & Details
4️⃣  Package Expiry Date
5️⃣  Naya Connection
6️⃣  Packages, Pricing & Routers

Bas number likh kar bhej dein ya seedha apna masla bataein! 🙏`;
}

function billReply(user: any, receipts: any[]): string {
  const bal = user.balance ?? 0;
  const expDate = user.expiryDate
    ? new Date(user.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N/A';
  const last = receipts[0];

  const balMsg = bal > 0
    ? `🔴 *Pending: Rs. ${bal}*\n   ⚠️ Jaldi payment karein taake service active rahe!`
    : bal < 0
    ? `🟢 *Advance: Rs. ${Math.abs(bal)}*\n   ✨ Aap credit mein hain — koi fikar nahi!`
    : `✅ *Balance Clear* — kuch nahi baqa!`;

  return `Ji ${user.name}! Main ne abhi check kiya 😊

📋 *Aap ka Account:*
━━━━━━━━━━━━━━━
👤 Username: ${user.username || user.name}
📦 Package: *${user.plan || 'Standard'}*
💰 Monthly: Rs. ${user.monthlyFee || 0}
${balMsg}
📅 Expiry: ${expDate}
${last ? `\n🧾 Akhri payment: Rs. ${last.paidAmount} — ${last.period}` : ''}
━━━━━━━━━━━━━━━
Koi sawaal ho to zaroor poochein! 🙏`;
}

function paymentHistoryReply(user: any, receipts: any[]): string {
  if (!receipts.length)
    return `${user.name}, hamare records mein abhi koi payment nahi dikh rahi.\n\nAgar payment ki hai to ${CONFIG.ownerName} bhai se confirm karein: *${CONFIG.supportNumber}* 🙏`;

  const list = receipts.slice(0, 5).map((r: any, i: number) =>
    `${i + 1}. *${r.period}* — Rs. ${r.paidAmount}\n   📆 ${new Date(r.date).toLocaleDateString('en-PK')}`
  ).join('\n');

  return `Ji ${user.name}! Yeh rahi aap ki payment history 📋\n\n${list}\n\n_Total ${receipts.length} payment(s) record mein hain._\nKoi aur cheez? 😊`;
}

function expiryReply(user: any): string {
  if (!user.expiryDate)
    return `${user.name}, expiry date abhi system mein update nahi hai.\n\nBrahay mehr ${CONFIG.supportNumber} pe call karein — Mahad bhai directly help karenge! 🙏`;

  const exp = new Date(user.expiryDate);
  const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
  const dateStr = exp.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });

  const daysLine = days > 10
    ? `✅ Abhi *${days} din* baqi hain — no worries!`
    : days > 0
    ? `⚠️ Sirf *${days} din* baqi — jaldi renew karein!`
    : `🔴 Package *expire ho gaya* — foran renew karein!`;

  return `Ji ${user.name}! Package ki details yeh rahi:

📦 *${user.plan || 'Standard'}* Package
📅 Expiry: *${dateStr}*
${daysLine}

Renewal ke liye payment karein aur screenshot bhejein!
Bank details chahiye? *"3"* likh kar bhejein 😊`;
}

function packagesReply(planPrices: Record<string, number>): string {
  const entries = Object.entries(planPrices || {});
  const pkgList = entries.length
    ? entries.map(([name, price]) => `📦 *${name}* — Rs. ${price.toLocaleString()}/month`).join('\n')
    : `📦 Hamare packages ki updated list ${CONFIG.ownerName} bhai se confirm karein: *${CONFIG.supportNumber}*`;

  return `MahadNet ke *Internet Packages* 🌐\n\n${pkgList}\n\n${CONFIG.fiberInfo}\n\nRouter dekhna hai? Likhein *"router"* 📡`;
}

function routerChoicePrompt(): string {
  return `Router ke 2 types available hain MahadNet pe 📡

1️⃣  *2.4G* — Single band, budget-friendly, chhoti space ke liye
2️⃣  *5G* — Dual band, fast speed, bara coverage

Likhein *"2.4G"* ya *"5G"* — main detail bhej deti hoon! 😊`;
}

function newConnReply(): string {
  return `MahadNet mein khushamdeed! 🎉

Naya connection ke liye bas yeh batain:

1️⃣ *Aap ka naam*
2️⃣ *Area / Mohalla / Gali*
3️⃣ *Package preference*
4️⃣ *Router/ONU aur fiber cable already available hai ya nahi?*

Agar available nahi hai, koi masla nahi — hum se purchase kar sakte hain (fiber Rs. 30/meter, 2-core, length site visit pe measure hogi).

Packages dekhne hain? *"6"* likh kar bhejein 📦

Yeh details milte hi team 24 ghante mein coverage check kar ke rabta karegi! 📡`;
}

function coverageReply(): string {
  return `Zaroor pata karti hoon! 😊 Bas yeh batain:

1️⃣ *Aap ka naam*
2️⃣ *Pura address / area*
3️⃣ *Konsa package chahiye*

Yeh milte hi coverage check kar ke 24 ghante mein confirm kar dengi! 📍`;
}

function routerPasswordGuide(modelInput: string): string {
  const m = modelInput.toLowerCase();
  let ip = '192.168.1.1';
  let note = 'username/password device ke peeche sticker pe likha hota hai';
  if (/gs3101/.test(m)) { ip = '192.168.1.1'; note = 'default login *admin/admin* try karein'; }
  else if (/hg8546|echolife/.test(m)) { ip = '192.168.100.1'; note = 'default login *telecomadmin/admintelecom* ya *admin/admin* try karein'; }
  else if (/\bq2\b/.test(m)) { ip = '192.168.100.1'; note = 'login device ke sticker pe check karein'; }

  return `Theek hai! *${modelInput}* ke liye yeh steps follow karein 🔧

1️⃣ Mobile/laptop ko router ke WiFi se connect karein
2️⃣ Browser mein yeh address likhein: *${ip}*
3️⃣ Login karein — ${note}
4️⃣ *Wireless* ya *WLAN Settings* mein jayein
5️⃣ Naya WiFi password likhein aur *Save/Apply* karein
6️⃣ Router ek baar restart kar lein

Masla aaye to call karein: *${CONFIG.supportNumber}* 📞`;
}

function complaintAckReply(user: any, ticketId: string, issue: string): string {
  const t = issue.toLowerCase();
  const isUrgent = /urgent|emergency|2\s*din|3\s*din|bilkul\s*nahi/.test(t);
  const isSlow = /slow|thoda/.test(t);
  const priority = isUrgent ? '🔴 High' : isSlow ? '🟡 Low' : '🟠 Medium';

  const tip = /router|wifi|net/.test(t)
    ? '\n💡 *Quick tip:* Router ek baar off karke 30 sec baad on karein — aksar theek ho jata hai!'
    : '';

  return `${user.name}, complaint note kar li gai hai! 🛠️
${tip}

🎫 *Ticket:* ${ticketId}
⚡ *Priority:* ${priority}
📋 *Issue:* ${issue.slice(0, 70)}

Technical team ko foran inform kar diya gaya hai.
${isUrgent ? `\n🚨 Urgent case hai — direct call karein: *${CONFIG.supportNumber}*` : `\nAam tor pe 2-4 ghante mein hal ho jata hai.`}

Shukriya aap ki patience ke liye! 🙏`;
}

function personalReply(name?: string): string {
  return name
    ? `Assalam o Alaikum ${name}! 😊

Yeh number MahadNet ka official customer support hai.
${CONFIG.ownerName} bhai is waqt available nahi hain — aap ka message unhe pahuncha diya jayega.

Internet ya kisi service ke masle mein madad chahiye to zaroor batain! 🙏`
    : `Assalam o Alaikum! 😊

Yeh MahadNet Support ka WhatsApp hai.
${CONFIG.ownerName} bhai abhi available nahi hain.

Agar internet, bill ya kisi service ka masla ho to batain — main haazir hoon!
Ya call karein: *${CONFIG.supportNumber}* 📞`;
}

function unknownCustomerReply(): string {
  return `Assalam o Alaikum! 😊

Aap ka number hamare system mein registered nahi mila.

Thori detail bhej dein taake continue kar sakein:
👉 *Naam*
👉 *Address / Area*
👉 *Username ya Customer ID* (agar pehle se customer hain)

Naya connection chahiye? *"5"* likh kar bhejein!
Koi sawaal? Call karein: *${CONFIG.supportNumber}* 🙏`;
}

// ══════════════════════════════════════════════════════
// 🤖 GROQ (fallback for complex/open-ended queries)
// ══════════════════════════════════════════════════════
async function askGroq(custData: string, userMessage: string): Promise<{ onTopic: boolean; reply: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('No GROQ key');

  const system = `Tu Ayesha hai — MahadNet ISP ki customer support executive. Ek real Pakistani larki ki tarah baat kar, AI ya bot bilkul mat lago.

SCOPE: Sirf MahadNet ke internet/ISP business (connection, billing, complaint, package, router, fiber, coverage) se related sawalon ka khud jawab do.
Agar sawal in topics se bilkul mutaliq NAHI hai (jaise: jokes, siyasat, mazhab, Ayesha ke baray mein personal sawal, random chit-chat, kisi aur company ka topic), to "onTopic": false rakho aur reply mein politely batao ke yeh tumhara scope nahi, unka message note kar liya hai aur Mahad bhai ko inform kar degi — har dafa alag andaaz mein kaho.

TONE RULES (zaroori):
- Cooperative aur warm raho lekin ziyada chamchagiri ya overpraise mat karo ("great question", "you're amazing" jese phrases mana hain)
- Har reply mein wording badlo, ek hi stock jumla baar baar mat daalo
- "afsos hua", "bura laga", "main madad ke liye haazir hoon" jese generic fillers repeat mat karo
- Seedhi, samajhdaar, professional lekin insaan jesi baat karo

LANGUAGE — SIRF PAKISTANI ROMAN URDU:
Hindi ke ye words BILKUL FORBIDDEN hain:
dhanyawad→shukriya | kripya→meherbani | samasya→masla | samadhan→hal | seva→khidmat | uplabdh→available | sunishchit→pakka | jankaari→baat | turant→foran | vyavastha→intezam | prayas→koshish | uttar→jawab | pradan→dena

SAHI WORDS: shukriya, haan ji, acha, theek hai, bilkul, zaroor, foran, masla, hal, batao, dekhti hoon, chalo

OUTPUT: Hamesha SIRF valid JSON return karo, kuch aur nahi, koi markdown fence nahi:
{"onTopic": true ya false, "reply": "tumhari reply yahan, max 4-5 lines, 1-2 emoji max"}

CUSTOMER INFO: ${custData}
COMPANY: MahadNet | Support: ${CONFIG.supportNumber}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }],
      temperature: 0.8,
      max_tokens: 350,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Groq empty');

  try {
    const parsed = JSON.parse(raw);
    return { onTopic: parsed.onTopic !== false, reply: parsed.reply || raw };
  } catch {
    return { onTopic: true, reply: raw };
  }
}

// ══════════════════════════════════════════════════════
// 📤 WHATSAPP SEND
// ══════════════════════════════════════════════════════
async function sendText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ WA env missing'); return; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta text:', JSON.stringify(d).slice(0, 200));
  } catch (e: any) { console.error('❌ sendText:', e?.message); }
}

async function sendImage(to: string, imageUrl: string, caption: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) return;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'image',
        image: { link: imageUrl, caption },
      }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta image:', JSON.stringify(d).slice(0, 200));
  } catch (e: any) { console.error('❌ sendImage:', e?.message); }
}

async function sendRouterCatalog(to: string, band: '2.4g' | '5g') {
  const list = CONFIG.routers[band];
  for (const r of list) {
    await sendImage(to, r.image, `${r.model} — ${r.company}`);
    await sendText(to, r.specs);
  }
  await sendText(to, `Koi router pasand aaya? Order ke liye batain ya call karein: *${CONFIG.supportNumber}* 😊`);
}

// ══════════════════════════════════════════════════════
// 🚀 MAIN HANDLER
// ══════════════════════════════════════════════════════
export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const messages: any[] = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];

    for (const msg of messages) {
      const from: string = msg.from;
      const type: string = msg.type;
      const text: string = msg?.text?.body?.trim() || '';

      console.log(`📩 from=${from} type=${type} text="${text.slice(0, 80)}"`);

      if (type === 'audio' || type === 'voice') {
        await sendText(from, `Assalam o Alaikum! 😊 Voice note mili — lekin main abhi audio process nahi kar sakti.\n\nApna masla text mein likhein ya call karein: *${CONFIG.supportNumber}* 📞`);
        continue;
      }

      if (type !== 'text' || !text) continue;

      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      // ── Priority: mid-flow slot-filling sessions (unless user issues a fresh command) ──
      const session = await getSession(from);
      const isOverrideCommand = intent === 'greeting' || /^[1-6]$/.test(text.trim());

      if (session && !isOverrideCommand) {
        if (session === 'lead_awaiting_details') {
          await setSession(from, null);
          const t = text.toLowerCase();
          const missingRouter = /router\s*(nahi|nai|available\s*nahi)|no\s*router/.test(t);
          const missingFiber = /fiber\s*(nahi|nai|available\s*nahi)|no\s*fiber|cable\s*nahi/.test(t);
          const planPrices = await getAnyPlanPrices();
          const matchedPlan = Object.keys(planPrices).find(p => t.includes(p.toLowerCase()));
          const row = await getManagerRow('mahadnet');
          if (row) {
            await saveLead('mahadnet', row, {
              name: 'WhatsApp Lead', phone: from, address: text.slice(0, 200),
              interestedPlan: matchedPlan, note: text, source: 'WhatsApp Bot',
            });
            await notifyManager('mahadnet', row, {
              title: '🆕 Naya Connection Lead (WhatsApp)',
              message: `Number: ${from}\nDetails: ${text.slice(0, 150)}`,
              priority: 'MEDIUM',
            });
          }
          let offer = '';
          if (missingRouter) offer += `\n📡 Router chahiye? *"router"* likh kar bhejein, catalog bhej deti hoon!`;
          if (missingFiber) offer += `\n🌐 Fiber cable Rs. 30/meter (2-core) milta hai — installation ke waqt length measure ho jayegi.`;
          await sendText(from, `Shukriya! 😊 Aap ki details note kar li hain — team 24 ghante mein contact karegi.${offer}`);
          continue;
        }
        if (session === 'awaiting_router_model') {
          await setSession(from, null);
          await sendText(from, routerPasswordGuide(text));
          continue;
        }
        if (session === 'awaiting_unknown_details') {
          await setSession(from, null);
          const row = await getManagerRow('mahadnet');
          if (row) {
            await notifyManager('mahadnet', row, {
              title: '📩 Naya/Unknown Number Inquiry',
              message: `Number: ${from}\nDetails: ${text.slice(0, 150)}`,
              priority: 'LOW',
            });
          }
          await sendText(from, `Shukriya! 😊 Details mil gai hain, team verify kar ke aap se rabta karegi. Koi urgent masla ho to call karein: *${CONFIG.supportNumber}* 📞`);
          continue;
        }
      }

      // ── Greeting → menu (clear any pending session) ──
      if (intent === 'greeting') {
        await setSession(from, null);
        const found = await findCustomer(from);
        const firstTime = !(await hasGreetedBefore(from));
        if (firstTime) await markGreetedBefore(from);
        await sendText(from, welcomeMenu(found?.user?.name, firstTime));
        continue;
      }

      // ── Router band selection ──
      if (intent === 'router_24g') { await setSession(from, null); await sendRouterCatalog(from, '2.4g'); continue; }
      if (intent === 'router_5g')  { await setSession(from, null); await sendRouterCatalog(from, '5g');   continue; }

      // ── Router info request → show choice prompt ──
      if (intent === 'router_info') {
        await setSession(from, 'router_choice');
        await sendText(from, routerChoicePrompt());
        continue;
      }

      // ── Password change → ask router model first ──
      if (intent === 'password_change') {
        await setSession(from, 'awaiting_router_model');
        await sendText(from, `Zaroor madad karti hoon! 😊\n\nAap ka router/ONU konsa model hai? (jaise GS3101, HG8546M, Huawei Q2 — ya jo bhi likha ho device pe)`);
        continue;
      }

      // ── Menu shortcuts (no DB needed) ──
      if (intent === 'menu_payment')  { await sendText(from, CONFIG.bankAccounts); continue; }
      if (intent === 'menu_new_conn' || intent === 'new_conn') {
        await sendText(from, newConnReply());
        await setSession(from, 'lead_awaiting_details');
        continue;
      }
      if (intent === 'coverage') {
        await sendText(from, coverageReply());
        await setSession(from, 'lead_awaiting_details');
        continue;
      }
      if (intent === 'payment_how')   { await sendText(from, CONFIG.bankAccounts); continue; }

      if (intent === 'menu_packages' || intent === 'packages') {
        const found = await findCustomer(from);
        const planPrices = found?.planPrices && Object.keys(found.planPrices).length
          ? found.planPrices
          : await getAnyPlanPrices();
        await sendText(from, packagesReply(planPrices));
        continue;
      }

      // ── DB required intents ──
      const found = await findCustomer(from);

      if (intent === 'menu_complaint') {
        if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
        await sendText(from, `Ji ${found.user.name}! Apna masla likhein — main abhi note kar leti hoon aur team ko bhejti hoon. 🛠️\n\nKya ho raha hai internet mein?`);
        continue;
      }
      if (intent === 'menu_bill') {
        if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
        await sendText(from, billReply(found.user, found.receipts));
        continue;
      }
      if (intent === 'menu_expiry') {
        if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
        await sendText(from, expiryReply(found.user));
        continue;
      }

      if (!found) {
        if (intent === 'personal') { await sendText(from, personalReply()); continue; }
        await sendText(from, unknownCustomerReply());
        await setSession(from, 'awaiting_unknown_details');
        continue;
      }

      const { managerId, rowData, user, receipts } = found;

      if (intent === 'bill')            { await sendText(from, billReply(user, receipts)); continue; }
      if (intent === 'payment_history') { await sendText(from, paymentHistoryReply(user, receipts)); continue; }
      if (intent === 'expiry')          { await sendText(from, expiryReply(user)); continue; }

      if (intent === 'complaint') {
        const tid = await saveComplaint(managerId, rowData, user, text);
        await sendText(from, complaintAckReply(user, tid, text));
        continue;
      }

      if (intent === 'personal') { await sendText(from, personalReply(user.name)); continue; }

      // ── Fallback: Groq for open-ended questions (human-like, on-topic aware) ──
      const custData = `Customer: ${user.name} | Package: ${user.plan} | Balance: Rs.${user.balance ?? 0} | Expiry: ${user.expiryDate || 'N/A'}`;
      try {
        const result = await askGroq(custData, text);
        await sendText(from, result.reply);
        if (!result.onTopic) {
          await notifyManager(managerId, rowData, {
            title: '💬 Off-topic Message (WhatsApp)',
            message: `${user.name} (${from}): ${text.slice(0, 150)}`,
            priority: 'LOW',
          });
        }
      } catch (e: any) {
        await sendText(from, `Ji ${user.name}! Is waqt thodi delay aa rahi hai.\nCall karein: *${CONFIG.supportNumber}* — main foran help karungi! 😊`);
      }
    }
  } catch (err: any) { console.error('[webhook error]', err?.message); }

  return res.status(200).json({ status: 'ok' });
}
