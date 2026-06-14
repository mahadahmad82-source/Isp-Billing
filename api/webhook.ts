// api/webhook.ts — MahadNet "Ayesha" WhatsApp AI Bot (Production)

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// ─── Keywords ────────────────────────────────────────────────────────────────
const GREETING  = ['assalamu','assalam','salaam','aoa','hi','hello','helo','salam','hey','hii','helloo','السلام'];
const BILL      = ['bill','balance','payment','paisa','dues','fee','fees','amount','kitna','baqi','baki','paid','jama'];
const NET       = ['internet','net','wifi','speed','slow','band','nahi chal','masla','problem','down','issue','kaam nahi','light','signal'];
const COMPLAINT = ['complaint','complain','shikayat','kharab','slow','down','issue','masla','band','nahi aya','nahi chal'];
const CONNECT   = ['new','connection','naya','nayi','install','lena','chahiye','chahta','chahti','price','package','parcel','plan'];
const EXPIRY    = ['expiry','expire','kab','khatam','end','band hoga','date','kitne din'];

type Intent = 'bill' | 'complaint' | 'new_connection' | 'expiry' | 'greeting' | 'personal';

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').slice(-10);
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (GREETING.some(w => t.includes(w)) && t.length < 25) return 'greeting';
  if (COMPLAINT.some(w => t.includes(w))) return 'complaint';
  if (BILL.some(w => t.includes(w)))      return 'bill';
  if (EXPIRY.some(w => t.includes(w)))    return 'expiry';
  if (CONNECT.some(w => t.includes(w)))   return 'new_connection';
  if (NET.some(w => t.includes(w)))       return 'complaint';
  return 'personal';
}

// ─── Supabase: find customer by WhatsApp number ───────────────────────────────
async function findCustomerByPhone(from: string): Promise<{ managerId: string; user: any } | null> {
  const norm = normalizePhone(from);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    for (const row of rows) {
      const users: any[] = row.data?.users || [];
      const user = users.find((u: any) => {
        if (!u || u.status === 'deleted') return false;
        return normalizePhone(u.phone || '') === norm || normalizePhone(u.phone2 || '') === norm;
      });
      if (user) return { managerId: row.manager_id, user };
    }
  } catch (e: any) { console.error('Supabase lookup error:', e?.message); }
  return null;
}

// ─── Supabase: save complaint ─────────────────────────────────────────────────
async function saveComplaint(managerId: string, user: any, issue: string): Promise<string> {
  const ticketId = `WA-${Date.now()}`;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return ticketId;
    const rows = await res.json();
    if (!rows.length) return ticketId;
    const data = rows[0].data || {};
    const complaints = data.complaints || [];
    complaints.push({
      id: ticketId, userId: user.id, userName: user.name,
      phone: user.phone, issue, source: 'whatsapp',
      status: 'open', createdAt: new Date().toISOString(),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ data: { ...data, complaints } }),
    });
  } catch (e: any) { console.error('Save complaint error:', e?.message); }
  return ticketId;
}

// ─── WhatsApp: send reply ─────────────────────────────────────────────────────
async function sendReply(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID'); return; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    const d = await r.json();
    if (!r.ok) console.error(`❌ Meta ${r.status}:`, JSON.stringify(d));
    else console.log(`✅ Reply sent to ${to}`);
  } catch (e: any) { console.error('sendReply error:', e?.message); }
}

// ─── Reply builders ───────────────────────────────────────────────────────────
const greetingReply = () =>
  `Walaikum Assalam! 😊 Main Ayesha hoon, MahadNet ki virtual assistant.\n\n` +
  `Mujhe batayein main aap ki kya madad kar sakti hoon?\n\n` +
  `1️⃣  Bill / Balance check karna hai\n` +
  `2️⃣  Internet masla / Complaint darj karni hai\n` +
  `3️⃣  Naya connection lena hai\n` +
  `4️⃣  Package / Expiry date dekhni hai\n\n` +
  `Apna masla seedha likh dein, main samajh jaungi! 🙏`;

const billReply = (u: any) => {
  const bal    = u.balance ?? 0;
  const expiry = u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('en-PK') : 'N/A';
  let msg = `Assalam o Alaikum *${u.name}*! 😊\n\n📋 *Aap ka Account:*\n`;
  msg += `👤 Username: ${u.username || 'N/A'}\n`;
  msg += `📦 Package: ${u.plan || 'Standard'}\n`;
  msg += `💰 Monthly Fee: Rs. ${u.monthlyFee || 0}\n`;
  msg += `💳 Balance: Rs. ${Math.abs(bal)}`;
  msg += bal > 0 ? ' _(pending)_' : bal < 0 ? ' _(advance)_' : ' _(clear ✅)_';
  msg += `\n📅 Expiry: ${expiry}\n\n`;
  msg += bal > 0
    ? `⚠️ Aap ka bill pending hai. Jaldi payment karein taake service active rahe!\n\n`
    : `✅ Aap ka account bilkul clear hai, shukriya!\n\n`;
  msg += `Koi aur madad chahiye? 🙏`;
  return msg;
};

const complaintReply = (u: any, tid: string) =>
  `Aap ki complaint darj ho gayi *${u.name}*! 🛠️\n\n` +
  `🎫 *Ticket:* ${tid}\n` +
  `📞 Hamara team jald aap se rabta karega.\n\n` +
  `Agar urgent ho to Mahad bhai ko directly message karein.\n` +
  `Shukriya aap ki patience ke liye! 🙏`;

const expiryReply = (u: any) => {
  const expiry = u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('en-PK') : 'N/A';
  return (
    `Assalam o Alaikum *${u.name}*! 😊\n\n` +
    `📦 Package: *${u.plan || 'Standard'}*\n` +
    `📅 Expiry date: *${expiry}*\n\n` +
    `Renewal ke liye hamare office se rabta karein!\n` +
    `Koi aur cheez chahiye? 🙏`
  );
};

const newConnReply = () =>
  `Walaikum Assalam! MahadNet mein khushamdeed! 🎉\n\n` +
  `Main Ayesha hoon. Naye connection ke liye yeh details bhejein:\n\n` +
  `1️⃣  Aap ka *naam*\n` +
  `2️⃣  Aap ka *area / mohalla*\n` +
  `3️⃣  Kaunsa *package* chahiye? (10 Mbps / 20 Mbps / etc.)\n\n` +
  `Hamara team coverage check kar ke jald rabta karega! 📡`;

const personalReply = () =>
  `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support Bot.\n\n` +
  `Mahad bhai is waqt available nahi hain — main aap ka message unhe pahuncha dungi.\n\n` +
  `Agar internet, bill ya kisi masle mein madad chahiye to batayein! 🙏`;

const voiceReply = () =>
  `Assalam o Alaikum! Main Ayesha hoon. 😊\n\n` +
  `Aap ki voice note mili, lekin main abhi voice process nahi kar sakti.\n\n` +
  `Kripya apna masla *text* mein likhein — main foran madad karungi! ✍️`;

const unknownCustomerReply = () =>
  `Assalam o Alaikum! Main Ayesha hoon, MahadNet Support. 😊\n\n` +
  `Aap ka number hamare system mein nahi mila.\n\n` +
  `Kripya apna *username* bhejein (jo aap ke connection ka ID hai),\n` +
  `ya *"naya connection"* likhein agar pehli baar contact kar rahe hain! 🙏`;

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const messages: any[] = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];

    for (const msg of messages) {
      const from: string    = msg.from;
      const msgType: string = msg.type;
      const text: string    = msg?.text?.body || '';

      console.log(`📩 from=${from} type=${msgType} text="${text.slice(0,60)}"`);

      // Voice / audio
      if (msgType === 'audio' || msgType === 'voice') {
        await sendReply(from, voiceReply()); continue;
      }

      // Non-text (images, stickers, etc.) — acknowledge only
      if (msgType !== 'text') {
        await sendReply(from, `Assalam o Alaikum! Main Ayesha hoon 😊\nApna masla text mein likhein, main madad karungi! 🙏`);
        continue;
      }

      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      if (intent === 'greeting')        { await sendReply(from, greetingReply()); continue; }
      if (intent === 'personal')        { await sendReply(from, personalReply()); continue; }
      if (intent === 'new_connection')  { await sendReply(from, newConnReply());  continue; }

      // Business intents → Supabase lookup
      const found = await findCustomerByPhone(from);
      if (!found) { await sendReply(from, unknownCustomerReply()); continue; }

      const { managerId, user } = found;
      if (intent === 'bill')      await sendReply(from, billReply(user));
      if (intent === 'expiry')    await sendReply(from, expiryReply(user));
      if (intent === 'complaint') {
        const tid = await saveComplaint(managerId, user, text);
        await sendReply(from, complaintReply(user, tid));
      }
    }
  } catch (err: any) {
    console.error('❌ Webhook error:', err?.message);
  }

  return res.status(200).json({ status: 'ok' });
}
