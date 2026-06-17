// api/webhook.ts — Ayesha Bot v5 | MahadNet WhatsApp Support

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// ══════════════════════════════════════════════════════
// ⚙️  MAHADNET CONFIG — Update karo apni info ke mutabiq
// ══════════════════════════════════════════════════════
const CONFIG = {
  businessName: 'MahadNet',
  supportNumber: '0304-2773453',
  ownerName: 'Mahad',

  packages: [
    { name: 'Basic',    speed: '10 Mbps',  price: 1500,  details: 'Ghar ke regular use ke liye best' },
    { name: 'Standard', speed: '20 Mbps',  price: 2500,  details: 'Work from home aur HD streaming' },
    { name: 'Premium',  speed: '50 Mbps',  price: 4000,  details: 'Gaming + multiple devices' },
    { name: 'Ultra',    speed: '100 Mbps', price: 6500,  details: 'Office aur heavy users ke liye' },
  ],

  routers: [
    { model: 'TP-Link TL-WR841N', speed: '300 Mbps WiFi', price: 2500,  best: 'Basic package' },
    { model: 'Tenda F3',          speed: '300 Mbps WiFi', price: 2200,  best: 'Budget choice' },
    { model: 'TP-Link Archer C6', speed: 'AC1200 Dual Band', price: 5500, best: 'Standard/Premium' },
    { model: 'TP-Link Archer AX23', speed: 'WiFi 6 AX1800', price: 9500, best: 'Ultra package' },
  ],

  fiberInfo: `🌐 *MahadNet Fiber Connection:*
• Pure Fiber Optic cable ghar tak
• No speed drop during peak hours
• 99.9% uptime guarantee
• Free installation (limited areas)
• 1 mahina free trial available

📍 Coverage: Apna area batain, main check karti hoon!`,

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
        console.log(`✅ Customer found: ${user.name} | bal=${user.balance}`);
        return { managerId: row.manager_id, rowData: row.data, user, receipts };
      }
    }
    console.log(`⚠️ No customer for: ${norm}`);
  } catch (e: any) { console.error('[findCustomer]', e?.message); }
  return null;
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
  } catch (e: any) { console.error('[saveComplaint]', e?.message); }
  return ticketId;
}

// ══════════════════════════════════════════════════════
// 🧠 INTENT DETECTION
// ══════════════════════════════════════════════════════
type Intent =
  | 'greeting' | 'menu_complaint' | 'menu_bill' | 'menu_payment'
  | 'menu_expiry' | 'menu_new_conn' | 'menu_packages'
  | 'complaint' | 'bill' | 'payment_how' | 'payment_history'
  | 'expiry' | 'new_conn' | 'packages' | 'router_info' | 'personal';

function detectIntent(text: string): Intent {
  const t = text.trim().toLowerCase();

  // Numbered menu responses
  if (/^1$|^one$/.test(t)) return 'menu_complaint';
  if (/^2$|^two$/.test(t)) return 'menu_bill';
  if (/^3$|^three$/.test(t)) return 'menu_payment';
  if (/^4$|^four$/.test(t)) return 'menu_expiry';
  if (/^5$|^five$/.test(t)) return 'menu_new_conn';
  if (/^6$|^six$/.test(t)) return 'menu_packages';

  // Greeting
  if (/^(as+ala+m+[\w\s]*|aoa|a\.?o\.?a\.?|salam+|hi+|hey+|hello+|good\s*(morning|evening|night|afternoon)|kya\s*hal|assalamu)/.test(t) && t.length < 60)
    return 'greeting';

  // Specific intents
  if (/router|device|modem|equipment|hardware/.test(t)) return 'router_info';
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
// 💬 STATIC REPLY BUILDERS (No AI needed)
// ══════════════════════════════════════════════════════

function welcomeMenu(name?: string): string {
  const greet = name
    ? `Walaikum Assalam, *${name}*! 😊`
    : `Walaikum Assalam! 😊 MahadNet Support mein aap ka swaagat hai!`;
  return `${greet}

Main *Ayesha* hoon, aap ki dedicated support executive.

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

function packagesReply(): string {
  const pkgList = CONFIG.packages.map(p =>
    `📦 *${p.name}* — ${p.speed}\n   💰 Rs. ${p.price.toLocaleString()}/month\n   ✅ ${p.details}`
  ).join('\n\n');

  return `MahadNet ke *Internet Packages* 🌐\n\n${pkgList}\n\n${CONFIG.fiberInfo}\n\nPackage choose karna hai? Ya naya connection chahiye? Batain! 😊`;
}

function routerReply(): string {
  const list = CONFIG.routers.map(r =>
    `🔌 *${r.model}*\n   📶 ${r.speed}\n   💰 Rs. ${r.price.toLocaleString()}\n   ✅ Best for: ${r.best}`
  ).join('\n\n');

  return `*Available Routers — MahadNet* 📡\n\n${list}\n\n_Router ke sath package bhi lena hai? Apna area batain — main check karti hoon coverage! 😊_`;
}

function newConnReply(): string {
  return `MahadNet mein khushamdeed! 🎉

Naya connection ke liye bas yeh 3 cheezein batain:

1️⃣ *Aap ka naam*
2️⃣ *Area / Mohalla / Gali*
3️⃣ *Package preference*
   (10 Mbps / 20 Mbps / 50 Mbps / 100 Mbps)

Packages dekhne hain? *"6"* likh kar bhejein 📦

Hamara team 24 ghante mein coverage check kar ke aap se rabta karega! 📡`;
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

Agar aap hamare customer hain:
👉 Apna *username* bhejein (jaise: *ali01*)

Naye customer hain?
👉 *"5"* likh kar bhejein — naya connection ka process batati hoon!

Koi sawaal? Call karein: *${CONFIG.supportNumber}* 🙏`;
}

// ══════════════════════════════════════════════════════
// 🤖 GROQ (Sirf complex/open-ended queries ke liye)
// ══════════════════════════════════════════════════════
async function askGroq(customerName: string | null, customerData: string, userMessage: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('No GROQ key');

  const system = `Tu Ayesha hai — MahadNet ISP ki customer support executive. Ek real Pakistani larki ki tarah baat kar.

LANGUAGE — SIRF PAKISTANI ROMAN URDU:
Hindi ke ye words BILKUL FORBIDDEN hain:
dhanyawad→shukriya | kripya→meherbani | samasya→masla | samadhan→hal | seva→khidmat | uplabdh→available | sunishchit→pakka | jankaari→baat | turant→foran | vyavastha→intezam | prayas→koshish | uttar→jawab | pradan→dena

SAHI WORDS: shukriya, haan ji, acha, theek hai, bilkul, zaroor, foran, masla, hal, batao, dekhti hoon, chalo

BANNED PHRASES (har reply mein same nahi aana chahiye):
- "aray bura laga" — BAND
- "sun ke bura hua" — BAND  
- "main aap ki madad ke liye haazir hoon" — BAND
- Har reply alag honi chahiye

TONE: Warm, caring, human. Jaise ek real office support girl baat kar rahi ho.
- Short replies — max 4-5 lines
- 1-2 emoji max
- Kabhi "As an AI" ya "I'm a bot" mat kaho

CUSTOMER INFO: ${customerData}
COMPANY: MahadNet | Support: ${CONFIG.supportNumber}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 350,
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq empty');
  return text;
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
    if (!r.ok) console.error('❌ Meta:', JSON.stringify(d).slice(0, 200));
    else console.log('✅ Sent to', to);
  } catch (e: any) { console.error('❌ sendText:', e?.message); }
}

// ══════════════════════════════════════════════════════
// 🚀 MAIN HANDLER
// ══════════════════════════════════════════════════════
export default async function handler(req: any, res: any) {
  // Webhook verification
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

      // ── Voice ──
      if (type === 'audio' || type === 'voice') {
        await sendText(from, `Assalam o Alaikum! 😊 Voice note mili — lekin main abhi audio process nahi kar sakti.\n\nApna masla text mein likhein ya call karein: *${CONFIG.supportNumber}* 📞`);
        continue;
      }

      // ── Non-text ──
      if (type !== 'text' || !text) continue;

      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      // ── Greetings — always show welcome menu ──
      if (intent === 'greeting') {
        const found = await findCustomer(from);
        await sendText(from, welcomeMenu(found?.user?.name));
        continue;
      }

      // ── Menu number shortcuts (no DB needed) ──
      if (intent === 'menu_payment')  { await sendText(from, CONFIG.bankAccounts); continue; }
      if (intent === 'menu_packages') { await sendText(from, packagesReply()); continue; }
      if (intent === 'menu_new_conn') { await sendText(from, newConnReply()); continue; }
      if (intent === 'packages')      { await sendText(from, packagesReply()); continue; }
      if (intent === 'router_info')   { await sendText(from, routerReply()); continue; }
      if (intent === 'new_conn')      { await sendText(from, newConnReply()); continue; }
      if (intent === 'payment_how')   { await sendText(from, CONFIG.bankAccounts); continue; }

      // ── DB required intents ──
      const found = await findCustomer(from);

      // ── Menu numbers that need DB ──
      if (intent === 'menu_complaint') {
        if (!found) { await sendText(from, unknownCustomerReply()); continue; }
        await sendText(from, `Ji ${found.user.name}! Apna masla likhein — main abhi note kar leti hoon aur team ko bhejti hoon. 🛠️\n\nKya ho raha hai internet mein?`);
        continue;
      }
      if (intent === 'menu_bill') {
        if (!found) { await sendText(from, unknownCustomerReply()); continue; }
        await sendText(from, billReply(found.user, found.receipts));
        continue;
      }
      if (intent === 'menu_expiry') {
        if (!found) { await sendText(from, unknownCustomerReply()); continue; }
        await sendText(from, expiryReply(found.user));
        continue;
      }

      // ── Direct intents with DB ──
      if (!found) {
        // Could be personal contact
        if (intent === 'personal') { await sendText(from, personalReply()); continue; }
        await sendText(from, unknownCustomerReply());
        continue;
      }

      const { managerId, rowData, user, receipts } = found;

      if (intent === 'bill')             { await sendText(from, billReply(user, receipts)); continue; }
      if (intent === 'payment_history')  { await sendText(from, paymentHistoryReply(user, receipts)); continue; }
      if (intent === 'expiry')           { await sendText(from, expiryReply(user)); continue; }

      if (intent === 'complaint') {
        const tid = await saveComplaint(managerId, rowData, user, text);
        await sendText(from, complaintAckReply(user, tid, text));
        continue;
      }

      if (intent === 'personal') {
        await sendText(from, personalReply(user.name));
        continue;
      }

      // ── Fallback: ask Groq for anything complex ──
      const custData = `Customer: ${user.name} | Package: ${user.plan} | Balance: Rs.${user.balance ?? 0} | Expiry: ${user.expiryDate || 'N/A'}`;
      try {
        const reply = await askGroq(user.name, custData, text);
        await sendText(from, reply);
      } catch (e: any) {
        console.error('Groq fallback failed:', e?.message);
        await sendText(from, `Ji ${user.name}! Is waqt thodi delay aa rahi hai.\nCall karein: *${CONFIG.supportNumber}* — main foran help karungi! 😊`);
      }
    }
  } catch (err: any) { console.error('[webhook error]', err?.message); }

  return res.status(200).json({ status: 'ok' });
}
