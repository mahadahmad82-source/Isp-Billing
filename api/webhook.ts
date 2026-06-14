// api/webhook.ts — MahadNet "Ayesha" WhatsApp AI Bot (Production)

const SUPABASE_URL  = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN  = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// ─── Keyword groups ───────────────────────────────────────────────────────────
const GREETING_WORDS   = ['assalamu','assalam','salaam','aoa','hi','hello','helo','salam','hey','hii'];
const BILL_WORDS       = ['bill','balance','payment','paisa','dues','fee','amount','kitna','baqi','pending'];
const NET_WORDS        = ['internet','net','wifi','speed','slow','band','chal','masla','problem','down','issue','kaam'];
const COMPLAINT_WORDS  = ['complaint','complain','shikayat','kharab','nahi chal','band hai','slow hai','down hai'];
const CONNECT_WORDS    = ['new connection','naya connection','nai connection','install','lena hai','chahiye','new sim','new user'];
const EXPIRY_WORDS     = ['expiry','expire','kab khatam','khatam','band hoga','end date'];

type Intent = 'bill' | 'complaint' | 'new_connection' | 'expiry' | 'greeting' | 'personal';

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').slice(-10);
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (EXPIRY_WORDS.some(w => t.includes(w)))   return 'expiry';
  if (COMPLAINT_WORDS.some(w => t.includes(w))) return 'complaint';
  if (NET_WORDS.some(w => t.includes(w)))       return 'complaint';
  if (BILL_WORDS.some(w => t.includes(w)))      return 'bill';
  if (CONNECT_WORDS.some(w => t.includes(w)))   return 'new_connection';
  if (GREETING_WORDS.some(w => t.includes(w)) && t.length < 40) return 'greeting';
  return 'personal';
}

async function findCustomerByPhone(whatsappNumber: string): Promise<{ manager_id: string; user: any } | null> {
  const normalized = normalizePhone(whatsappNumber);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    for (const row of rows) {
      const users: any[] = row.data?.users || [];
      const found = users.find((u: any) => {
        if (!u || u.status === 'deleted') return false;
        return normalizePhone(u.phone || '') === normalized ||
               normalizePhone(u.phone2 || '') === normalized;
      });
      if (found) return { manager_id: row.manager_id, user: found };
    }
  } catch (e: any) {
    console.error('[Supabase lookup error]', e?.message);
  }
  return null;
}

async function saveComplaint(managerId: string, userId: string, userName: string, phone: string, issue: string): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}&select=data`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return `WA${Date.now()}`;
    const rows = await res.json();
    if (!rows.length) return `WA${Date.now()}`;
    const data = rows[0].data || {};
    const complaints: any[] = data.complaints || [];
    const ticketId = `WA${Date.now()}`;
    complaints.push({
      id: ticketId, userId, userName, phone, issue,
      source: 'whatsapp', status: 'open',
      createdAt: new Date().toISOString(),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ data: { ...data, complaints } }),
    });
    return ticketId;
  } catch (e: any) {
    console.error('[saveComplaint error]', e?.message);
    return `WA${Date.now()}`;
  }
}

async function sendReply(to: string, message: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ Env vars missing'); return; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta error:', JSON.stringify(d));
    else console.log('✅ Sent to', to, '| ID:', d?.messages?.[0]?.id);
  } catch (e: any) { console.error('❌ sendReply:', e?.message); }
}

// ─── Reply builders ───────────────────────────────────────────────────────────
const greetingReply = () =>
  `Walaikum Assalam! 😊 Main Ayesha hoon, MahadNet Support.\n\n` +
  `Mujhe batayein, main aap ki kya madad kar sakti hoon?\n\n` +
  `1️⃣  Bill / Balance check\n` +
  `2️⃣  Internet masla / Complaint\n` +
  `3️⃣  Naya connection\n` +
  `4️⃣  Package / Expiry date\n\n` +
  `Apna masla seedha likh dein! 🙏`;

const billReply = (u: any) => {
  const bal    = u.balance ?? 0;
  const expiry = u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('en-PK') : 'N/A';
  return (
    `Assalam o Alaikum ${u.name}! 😊\n\n` +
    `📋 *Account Summary*\n` +
    `👤 Username: ${u.username || 'N/A'}\n` +
    `📦 Package: ${u.plan || 'Standard'}\n` +
    `💰 Monthly Fee: Rs. ${u.monthlyFee || 0}\n` +
    `💳 Balance: Rs. ${Math.abs(bal)}${bal > 0 ? ' _(pending)_' : bal < 0 ? ' _(advance)_' : ' _(clear)_'}\n` +
    `📅 Expiry: ${expiry}\n\n` +
    (bal > 0
      ? `⚠️ Bill pending hai. Jaldi payment karein!\n\n`
      : `✅ Account clear hai, shukriya!\n\n`) +
    `Koi aur masla? Batayein! 🙏`
  );
};

const complaintReply = (u: any, tid: string) =>
  `Complaint darj ho gayi ${u.name}! 🛠️\n\n` +
  `🎫 Ticket ID: *${tid}*\n` +
  `Hamara team jald aap se rabta karega.\n\n` +
  `Shukriya patience ke liye! 🙏`;

const expiryReply = (u: any) =>
  `Assalam o Alaikum ${u.name}! 😊\n\n` +
  `📦 Package: *${u.plan || 'Standard'}*\n` +
  `📅 Expiry: *${u.expiryDate ? new Date(u.expiryDate).toLocaleDateString('en-PK') : 'N/A'}*\n\n` +
  `Renewal ke liye hamse rabta karein! 🙏`;

const newConnectionReply = () =>
  `Walaikum Assalam! MahadNet mein khushamdeed! 🎉\n\n` +
  `Main Ayesha hoon. Naye connection ke liye yeh details bhejein:\n\n` +
  `1️⃣  Aap ka naam\n` +
  `2️⃣  Area / mohalla\n` +
  `3️⃣  Package (10 Mbps / 20 Mbps / other)\n\n` +
  `Hamara team jald coverage check kar ke rabta karega! 📡`;

const unknownReply = () =>
  `Assalam o Alaikum! Main Ayesha hoon, MahadNet Support. 😊\n\n` +
  `Aap ka number hamare system mein nahi mila.\n\n` +
  `Apna *username* bhejein (e.g. mahad01), ya\n` +
  `*naya connection* likhein agar pehli baar contact kar rahe hain! 🙏`;

const personalReply = () =>
  `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support Bot.\n\n` +
  `Mahad bhai is waqt available nahi hain.\n` +
  `Aap ka message unhe pahuncha dungi!\n\n` +
  `Internet, bill ya kisi masle mein madad chahiye to batayein. 🙏`;

const voiceReply = () =>
  `Assalam o Alaikum! Main Ayesha hoon. 😊\n\n` +
  `Voice note mili lekin main audio process nahi kar sakti abhi.\n` +
  `Kripya apna masla *text* mein likhein, foran madad karungi! ✍️`;

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // GET — verification
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

      console.log(`📩 from=${from} type=${msgType} text="${text}"`);

      // Voice / audio
      if (msgType === 'audio' || msgType === 'voice') {
        await sendReply(from, voiceReply()); continue;
      }
      // Non-text (sticker, image, etc.) — politely ask for text
      if (msgType !== 'text') {
        await sendReply(from, `Assalam o Alaikum! 😊 Main sirf text messages samajh sakti hoon abhi. Apna masla text mein likhein! 🙏`);
        continue;
      }

      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      if (intent === 'greeting') { await sendReply(from, greetingReply()); continue; }
      if (intent === 'personal') { await sendReply(from, personalReply()); continue; }
      if (intent === 'new_connection') { await sendReply(from, newConnectionReply()); continue; }

      // Needs Supabase lookup
      const found = await findCustomerByPhone(from);
      if (!found) { await sendReply(from, unknownReply()); continue; }

      const { manager_id, user } = found;
      if (intent === 'bill')      await sendReply(from, billReply(user));
      else if (intent === 'expiry') await sendReply(from, expiryReply(user));
      else if (intent === 'complaint') {
        const tid = await saveComplaint(manager_id, user.id, user.name, from, text);
        await sendReply(from, complaintReply(user, tid));
      }
    }
  } catch (err: any) {
    console.error('[webhook error]', err?.message || err);
  }

  return res.status(200).json({ status: 'ok' });
}
