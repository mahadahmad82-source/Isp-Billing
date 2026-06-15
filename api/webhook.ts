// api/webhook.ts — Ayesha Bot Final (No External AI needed)
// Smart Roman Urdu ISP Support Bot for MahadNet

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// Payment details
const BANK_INFO = `💳 *Payment Options:*

🏦 *Askari Bank*
  Naam: MAHAD AHMAD KHAN LODHI
  Account: 0032060001238
  IBAN: PK32ASCM000032060001238

🏦 *Meezan Bank*
  Naam: MAHAD AHMAD KHAN LODHI
  Account: 00300112164874
  IBAN: PK82MEZN0000300112164874

💚 *NayaPay*
  IBAN: PK42NAYA1234503282200943

📱 *EasyPaisa / JazzCash:* 03042773453

Payment ke baad screenshot zaroor bhejein! 🙏`;

// Pick random item from array (natural variation)
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// Normalize phone
const normPhone = (p: string) => p.replace(/\D/g, '').slice(-10);

// ─── Supabase: find customer ──────────────────────────────────────────────────
async function findCustomer(from: string) {
  const norm = normPhone(from);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    for (const row of rows) {
      const user = (row.data?.users || []).find((u: any) =>
        u && u.status !== 'deleted' &&
        (normPhone(u.phone || '') === norm || normPhone(u.phone2 || '') === norm)
      );
      if (user) {
        const receipts = (row.data?.receipts || [])
          .filter((r: any) => r.userId === user.id && r.status === 'Success')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { managerId: row.manager_id, data: row.data, user, receipts };
      }
    }
  } catch (e: any) { console.error('[findCustomer]', e?.message); }
  return null;
}

// ─── Save complaint ───────────────────────────────────────────────────────────
async function saveComplaint(managerId: string, rowData: any, user: any, issue: string) {
  try {
    const complaints = [...(rowData.complaints || [])];
    const t = issue.toLowerCase();
    const priority = /urgent|emergency|2\s*din|3\s*din|kal\s*se|bilkul\s*nahi/.test(t) ? 'high'
      : /slow|thoda|kabhi\s*kabhi/.test(t) ? 'low' : 'medium';
    const ticketId = `WA-${Date.now()}`;
    complaints.push({
      id: ticketId, customerId: user.id, customerName: user.name,
      customerPhone: user.phone, title: `WA: ${issue.slice(0, 60)}`,
      description: issue, status: 'open', priority,
      createdAt: new Date().toISOString(), createdBy: 'ayesha_bot',
    });
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...rowData, complaints } }),
    });
    return ticketId;
  } catch (e: any) { console.error('[saveComplaint]', e?.message); return `WA${Date.now()}`; }
}

// ─── Intent Detection ─────────────────────────────────────────────────────────
type Intent = 'greeting' | 'bill' | 'payment_how' | 'payment_history' | 'complaint' | 'expiry' | 'new_conn' | 'personal';

function detectIntent(t: string): Intent {
  const s = t.toLowerCase();
  if (/as+ala+m+|aoa|^salam|^hi\b|^hello|^hey|walaikum|good\s*(morning|evening)|kya\s*hal/.test(s) && s.length < 50) return 'greeting';
  if (/kese\s*pay|kaise\s*pay|payment\s*kaise|kahan\s*pay|account\s*number|bank\s*detail|easypaisa|jazzcash|nayapay|transfer\s*kaise|paisa\s*kaise/.test(s)) return 'payment_how';
  if (/history|pichle\s*pay|kin\s*kin|purani|payment\s*list|kitni\s*baar/.test(s)) return 'payment_history';
  if (/expir|khatam|kab\s*band|band\s*hoga|end\s*date|package\s*kab|kitne\s*din/.test(s)) return 'expiry';
  if (/complaint|shikayat|internet\s*(?:nahi|band|slow|down)|net\s*(?:nahi|band|slow)|speed\s*(?:slow|kam)|wifi\s*(?:nahi|band)|masla|problem|issue|kharab|chal\s*nahi|nahi\s*chal/.test(s)) return 'complaint';
  if (/bill|balance|dues|arrear|baqi|kitna\s*banta|kitna\s*hai|monthly|fees?|kya\s*banta/.test(s)) return 'bill';
  if (/nay[ai]\s*conn|new\s*conn|install|lagwana|connection\s*chahiye|naya\s*lena|package\s*price|kitna\s*hoga/.test(s)) return 'new_conn';
  return 'personal';
}

// ─── Reply Builders ───────────────────────────────────────────────────────────
function greetReply(name?: string) {
  const greets = name ? [
    `Walaikum Assalam, ${name}! 😊 Main Ayesha hoon, MahadNet Support. Batain, kya khidmat kar sakti hoon aap ki?`,
    `Walaikum Assalam ${name} bhai! 😊 Ayesha bol rahi hoon MahadNet se. Koi masla hai ya kuch poochna tha?`,
    `Ji Walaikum Assalam, ${name}! 🌟 Main Ayesha hoon. Aap ki kya madad kar sakti hoon aaj?`,
  ] : [
    `Walaikum Assalam! 😊 Main Ayesha hoon, MahadNet ki customer support. Aap ka number hamare system mein check kar rahi hoon...\n\nKya aap hamare customer hain? Agar haan, to apna masla likhein — main foran madad karungi! 🙏`,
    `Ji Walaikum Assalam! 🌸 Ayesha bol rahi hoon MahadNet Support se. Batain, kya khidmat kar sakti hoon?\n\n1️⃣ Bill / Balance\n2️⃣ Internet masla\n3️⃣ Naya connection\n4️⃣ Payment info`,
  ];
  return pick(greets);
}

function billReply(user: any, receipts: any[]) {
  const bal = user.balance ?? 0;
  const exp = user.expiryDate
    ? new Date(user.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Update nahi hai';
  const lastR = receipts[0];
  const balLine = bal > 0
    ? `🔴 *Pending: Rs. ${bal}* — Jaldi payment karein!`
    : bal < 0 ? `🟢 *Advance: Rs. ${Math.abs(bal)}* — Aap credit mein hain!`
    : `✅ *Balance Clear* — Kuch baqa nahi!`;

  return pick([
    `Ji ${user.name}! Main ne aap ka account check kiya 😊\n\n📋 *Account Details:*\n👤 ${user.username || user.name}\n📦 Package: ${user.plan || 'Standard'}\n💰 Monthly: Rs. ${user.monthlyFee || 0}\n${balLine}\n📅 Expiry: ${exp}${lastR ? `\n🧾 Last payment: Rs. ${lastR.paidAmount} — ${lastR.period}` : ''}\n\nKoi aur sawaal? Zaroor puchein! 🙏`,
    `${user.name}, aap ka record main ne dekh liya! ✅\n\n*📊 Account Summary*\n━━━━━━━━━━━━━━━\nPackage: ${user.plan || 'Standard'}\nMonthly fee: Rs. ${user.monthlyFee || 0}\n${balLine}\nExpiry: ${exp}${lastR ? `\nPichli payment: Rs. ${lastR.paidAmount} (${lastR.period})` : ''}\n━━━━━━━━━━━━━━━\nMadad chahiye to batain! 😊`,
  ]);
}

function paymentHowReply(user?: any) {
  const intro = user
    ? pick([`Ji zaroor ${user.name}! Payment ke liye yeh options hain:`, `${user.name}, payment aap in tariqon se kar sakte hain:`])
    : pick([`Ji bilkul! Payment ke liye hamare yeh accounts hain:`, `Zaroor! Yeh rahi hamare payment details:`]);
  return `${intro}\n\n${BANK_INFO}`;
}

function paymentHistoryReply(user: any, receipts: any[]) {
  if (!receipts.length) return pick([
    `${user.name}, abhi tak koi payment record nahi mila system mein. Mahad bhai se confirm karein. 🙏`,
    `Ji ${user.name}, hamare records mein aap ki koi payment nahi dikh rahi abhi. Agar payment ki hai to Mahad bhai ko batain. 🙏`,
  ]);
  const list = receipts.slice(0, 5).map((r: any, i: number) =>
    `${i + 1}. *${r.period}* — Rs. ${r.paidAmount} (${new Date(r.date).toLocaleDateString('en-PK')})`
  ).join('\n');
  return pick([
    `${user.name}, yeh rahi aap ki pichli payments 📋\n\n${list}\n\nTotal ${receipts.length} payments record mein hain. 🙏`,
    `Ji! Aap ki payment history yeh rahi:\n\n${list}\n\nKoi aur cheez poochhni ho to batain! 😊`,
  ]);
}

function expiryReply(user: any) {
  if (!user.expiryDate) return `${user.name}, expiry date abhi system mein update nahi hai. Mahad bhai se poochh lein. 🙏`;
  const exp = new Date(user.expiryDate);
  const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
  const dateStr = exp.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
  const daysMsg = days > 5 ? `✅ Abhi ${days} din baqi hain.` : days > 0 ? `⚠️ Sirf *${days} din* baqi! Jaldi renew karein.` : `🔴 Package expire ho gaya hai!`;
  return pick([
    `${user.name}, aap ka package info yeh raha:\n\n📦 *${user.plan || 'Standard'}*\n📅 Expiry: *${dateStr}*\n${daysMsg}\n\nRenewal ke liye: 0304-2773453 🙏`,
    `Ji ${user.name}! Package details:\n\n📅 Expiry date: *${dateStr}*\n${daysMsg}\n\nKuch aur jaanna ho? 😊`,
  ]);
}

function complaintReply(user: any, ticketId: string, issue: string) {
  const t = issue.toLowerCase();
  const priority = /urgent|emergency|2\s*din|3\s*din/.test(t) ? '🔴 High' : /slow|thoda/.test(t) ? '🟡 Low' : '🟠 Medium';
  return pick([
    `Arey ${user.name}, ye sun ke bura laga! 😟 Main abhi is masle ko urgent handle karti hoon.\n\n✅ *Complaint Register Ho Gayi!*\n🎫 Ticket: *${ticketId}*\n⚡ Priority: ${priority}\n\nHamara technical team jald aap se rabta karega. Urgent ho to: *0304-2773453* 📞\n\nShukriya patience ke liye! 🙏`,
    `${user.name}, bohot sorry is takleef ke liye! Main ne aap ki complaint darj kar li hai.\n\n🎫 *Ticket ID: ${ticketId}*\n⚡ Priority: ${priority}\n\nTeam ko inform kar diya gaya hai — jald theek ho jayega. 🛠️\nCall: *0304-2773453* 🙏`,
  ]);
}

function newConnReply() {
  return pick([
    `Walaikum Assalam! MahadNet mein khushamdeed! 🎉\n\nNaya connection ke liye yeh details bhejein:\n\n1️⃣ *Apna naam*\n2️⃣ *Apna area/mohalla*\n3️⃣ *Kaunsa package chahiye?*\n   (e.g. 10 Mbps / 20 Mbps)\n\nHamara team 24 ghante mein coverage check kar ke rabta karega! 📡`,
    `Ji bilkul! Naya connection lagwana chahte hain? Zabardast! 🌟\n\nBas yeh 3 cheezein bhejein:\n👤 Aap ka naam\n📍 Area/mohalla\n📦 Package preference\n\nHam jald aap se rabta karenge! 😊 *0304-2773453*`,
  ]);
}

function personalReply() {
  return pick([
    `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support.\n\nMahad bhai abhi available nahi hain, main unhe aap ka message pahuncha dungi.\n\nInternet, bill ya kisi aur masle mein madad chahiye to zaroor batain! 🙏`,
    `Ji! 😊 Main Ayesha hoon MahadNet se. Yeh number customer support ke liye hai.\n\nAgar internet, bill, ya kisi masle mein help chahiye to likh dein — main haazir hoon! 🌸`,
  ]);
}

function unknownReply() {
  return pick([
    `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support.\n\nAap ka number hamare system mein nahi mila. Kripya apna *username* bhejein (e.g. *ali01*) taake main aap ki detail dekh sakoon.\n\nYa naya connection chahiye to *"naya connection"* likhein! 🙏`,
    `Ji! Aap ka number register nahi mila system mein. 😊\n\nApna *username* bhejein ya *registered number* — main check karti hoon!\n\nNaye customer hain? *"Naya connection"* likhein. 📡`,
  ]);
}

function voiceReply() {
  return pick([
    `Assalam o Alaikum! 😊 Aap ki voice note mili — lekin main abhi audio process nahi kar sakti.\n\nApna masla *text* mein likhein, main foran madad karungi! ✍️\nYa call karein: *0304-2773453* 📞`,
    `Ji! Voice note receive hui 🎤 Lekin main text hi samajh sakti hoon abhi.\n\nMasla text mein likhein — jaldi response milega! 😊`,
  ]);
}

// ─── Send WhatsApp ────────────────────────────────────────────────────────────
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

// ─── Main Handler ─────────────────────────────────────────────────────────────
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

      // Voice / Audio
      if (type === 'audio' || type === 'voice') { await sendText(from, voiceReply()); continue; }

      // Non-text
      if (type !== 'text') { await sendText(from, `Ji! 😊 Main sirf text messages samajh sakti hoon. Apna masla likh kar bhejein! 🙏`); continue; }
      if (!text) continue;

      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      // No-DB intents
      if (intent === 'greeting') {
        const found = await findCustomer(from);
        await sendText(from, greetReply(found?.user?.name));
        continue;
      }
      if (intent === 'personal')  { await sendText(from, personalReply());  continue; }
      if (intent === 'new_conn')  { await sendText(from, newConnReply());   continue; }
      if (intent === 'payment_how' && !(await findCustomer(from))) {
        await sendText(from, paymentHowReply()); continue;
      }

      // DB required
      const found = await findCustomer(from);
      if (!found) { await sendText(from, unknownReply()); continue; }

      const { managerId, data, user, receipts } = found;

      if (intent === 'bill')            await sendText(from, billReply(user, receipts));
      else if (intent === 'payment_how')  await sendText(from, paymentHowReply(user));
      else if (intent === 'payment_history') await sendText(from, paymentHistoryReply(user, receipts));
      else if (intent === 'expiry')     await sendText(from, expiryReply(user));
      else if (intent === 'complaint') {
        const tid = await saveComplaint(managerId, data, user, text);
        await sendText(from, complaintReply(user, tid, text));
      }
    }
  } catch (err: any) { console.error('[webhook error]', err?.message); }

  return res.status(200).json({ status: 'ok' });
}
