// api/webhook.ts — MahadNet "Ayesha" WhatsApp AI Bot
// Handles incoming WhatsApp messages and replies as Ayesha (female AI agent)

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// ─── Keyword groups ───────────────────────────────────────────────────────────
const GREETING_WORDS = ['assalamu', 'assalam', 'salaam', 'aoa', 'hi', 'hello', 'helo', 'salam', 'walaikum', 'hey', 'hii', 'helloo'];
const BILL_WORDS     = ['bill', 'balance', 'payment', 'paisa', 'dues', 'fee', 'fees', 'amount', 'tarikh', 'kitna', 'baqi'];
const NET_WORDS      = ['internet', 'net', 'wifi', 'speed', 'slow', 'band', 'nahi', 'chal', 'masla', 'problem', 'down', 'issue', 'kaam'];
const COMPLAINT_WORDS= ['complaint', 'complain', 'shikayat', 'problem', 'issue', 'masla', 'kharab', 'kaam nahi', 'band', 'slow', 'down'];
const CONNECT_WORDS  = ['new', 'connection', 'naya', 'nayi', 'install', 'lena', 'chahiye', 'chahta', 'chahti', 'price', 'package'];
const EXPIRY_WORDS   = ['expiry', 'expire', 'kab', 'date', 'khatam', 'end', 'band hoga'];

type Intent = 'bill' | 'complaint' | 'new_connection' | 'expiry' | 'greeting' | 'personal';

// ─── Normalize phone number (keep last 10 digits) ────────────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// ─── Detect message intent ───────────────────────────────────────────────────
function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (GREETING_WORDS.some(w => t.includes(w)) && t.length < 30) return 'greeting';
  if (COMPLAINT_WORDS.some(w => t.includes(w))) return 'complaint';
  if (BILL_WORDS.some(w => t.includes(w))) return 'bill';
  if (EXPIRY_WORDS.some(w => t.includes(w))) return 'expiry';
  if (CONNECT_WORDS.some(w => t.includes(w))) return 'new_connection';
  if (NET_WORDS.some(w => t.includes(w))) return 'complaint'; // net issues → complaint
  return 'personal';
}

// ─── Supabase: find customer by phone across all managers ────────────────────
async function findCustomerByPhone(whatsappNumber: string): Promise<{ manager_id: string; user: any } | null> {
  const normalized = normalizePhone(whatsappNumber);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) return null;
  const rows = await res.json();

  for (const row of rows) {
    const users: any[] = row.data?.users || [];
    const found = users.find((u: any) => {
      if (!u || u.status === 'deleted') return false;
      const p1 = normalizePhone(u.phone || '');
      const p2 = normalizePhone(u.phone2 || '');
      return p1 === normalized || p2 === normalized;
    });
    if (found) return { manager_id: row.manager_id, user: found };
  }
  return null;
}

// ─── Supabase: save complaint ─────────────────────────────────────────────────
async function saveComplaint(managerId: string, userId: string, userName: string, phone: string, issue: string) {
  // Fetch current state
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}&select=data`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) return;
  const rows = await res.json();
  if (!rows.length) return;

  const data = rows[0].data || {};
  const complaints: any[] = data.complaints || [];

  const newComplaint = {
    id: `wa_${Date.now()}`,
    userId,
    userName,
    phone,
    issue,
    source: 'whatsapp',
    status: 'open',
    createdAt: new Date().toISOString(),
  };

  complaints.push(newComplaint);

  await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ data: { ...data, complaints } }),
  });

  return newComplaint.id;
}

// ─── WhatsApp: send text reply ────────────────────────────────────────────────
async function sendReply(to: string, message: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!token) { console.error('❌ WHATSAPP_TOKEN missing from env'); return; }
  if (!phoneNumberId) { console.error('❌ PHONE_NUMBER_ID missing from env'); return; }

  console.log(`📤 Sending reply to ${to} via phoneNumberId: ${phoneNumberId}`);

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });
    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      console.error(`❌ Meta API error ${metaRes.status}:`, JSON.stringify(metaData));
    } else {
      console.log(`✅ Reply sent! Message ID: ${metaData?.messages?.[0]?.id}`);
    }
  } catch (err: any) {
    console.error('❌ sendReply exception:', err?.message);
  }
}

// ─── Build reply messages ─────────────────────────────────────────────────────
function buildGreetingReply(): string {
  return (
    `Walaikum Assalam! 😊 Main Ayesha hoon, MahadNet ki virtual assistant.\n\n` +
    `Mujhe batayein, main aap ki kya madad kar sakti hoon?\n\n` +
    `1️⃣  Bill / Balance check\n` +
    `2️⃣  Internet masla / Complaint\n` +
    `3️⃣  Naya connection\n` +
    `4️⃣  Package / Expiry date\n\n` +
    `Apna masla seedha likh dein, main samajh jaungi! 🙏`
  );
}

function buildBillReply(user: any): string {
  const balance = user.balance ?? 0;
  const expiry  = user.expiryDate ? new Date(user.expiryDate).toLocaleDateString('en-PK') : 'N/A';
  const plan    = user.plan || 'Standard';
  const fee     = user.monthlyFee || 0;

  let msg = `Assalam o Alaikum ${user.name}! 😊\n\n`;
  msg += `📋 *Aap ka Account Summary:*\n`;
  msg += `👤 Username: ${user.username}\n`;
  msg += `📦 Package: ${plan}\n`;
  msg += `💰 Monthly Fee: Rs. ${fee}\n`;
  msg += `💳 Current Balance: Rs. ${Math.abs(balance)}`;
  msg += balance > 0 ? ' _(pending)_' : balance < 0 ? ' _(advance)_' : ' _(clear)_';
  msg += `\n📅 Expiry: ${expiry}\n\n`;

  if (balance > 0) {
    msg += `⚠️ Aap ka bill pending hai. Jaldi payment karein taake internet active rahe!\n\n`;
  } else {
    msg += `✅ Aap ka account clear hai, shukriya!\n\n`;
  }

  msg += `Koi aur masla ho to batayein. 🙏`;
  return msg;
}

function buildComplaintReply(user: any, ticketId: string): string {
  return (
    `Aap ki complaint darj ho gayi, ${user.name}! 🛠️\n\n` +
    `🎫 *Ticket ID:* ${ticketId}\n` +
    `📞 Hamara team jald aap se rabta karega.\n\n` +
    `Agar urgent ho to WhatsApp par Mahad bhai se baat karein.\n` +
    `Shukriya aap ki patience ke liye! 🙏`
  );
}

function buildExpiryReply(user: any): string {
  const expiry = user.expiryDate ? new Date(user.expiryDate).toLocaleDateString('en-PK') : 'N/A';
  const plan   = user.plan || 'Standard';
  return (
    `Assalam o Alaikum ${user.name}! 😊\n\n` +
    `📦 Aap ka package: *${plan}*\n` +
    `📅 Expiry date: *${expiry}*\n\n` +
    `Renewal ke liye hamse rabta karein!\n` +
    `Koi aur cheez chahiye? 🙏`
  );
}

function buildNewConnectionReply(): string {
  return (
    `Walaikum Assalam! MahadNet mein khushamdeed! 🎉\n\n` +
    `Main Ayesha hoon, aap ke naye connection ke liye madad karungi.\n\n` +
    `Kripya apni yeh details bhejein:\n` +
    `1️⃣  Aap ka naam\n` +
    `2️⃣  Apna area / mohalla\n` +
    `3️⃣  Kaunsa package chahiye? (e.g. 10 Mbps / 20 Mbps)\n\n` +
    `Humara team aap ke area mein coverage check kar ke jald rabta karega! 📡`
  );
}

function buildPersonalReply(): string {
  return (
    `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support Bot.\n\n` +
    `Lagta hai aap kisi aur se baat karna chahte the!\n` +
    `Mahad bhai is waqt available nahi hain, main aap ka message unhe pahuncha dungi.\n\n` +
    `Agar internet, bill, ya kisi aur masle mein madad chahiye to batayein! 🙏`
  );
}

function buildVoiceReply(): string {
  return (
    `Assalam o Alaikum! Main Ayesha hoon. 😊\n\n` +
    `Aap ki voice note mujhe mil gayi, lekin main abhi voice messages process nahi kar sakti.\n\n` +
    `Kripya apna masla *text* mein likh kar bhejein, main foran madad karungi! ✍️`
  );
}

function buildUnknownCustomerReply(): string {
  return (
    `Assalam o Alaikum! Main Ayesha hoon, MahadNet Support. 😊\n\n` +
    `Aap ka number hamare system mein registered nahi mila.\n\n` +
    `Kripya apna *username* bhejein taake main aap ki detail dekh sakoon.\n` +
    `(Username woh hai jo aap ke connection ka ID hai, jaise: *mahad01*)\n\n` +
    `Ya phir *naya connection* likhein agar pehli baar contact kar rahe hain! 🙏`
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // ── GET: Meta webhook verification ──
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified ✅');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  // ── POST: Incoming message ──
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    const entry   = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const messages: any[] = value?.messages || [];

    for (const msg of messages) {
      const from: string = msg.from;
      const msgType: string = msg.type;

      console.log(`📩 Message from ${from}, type: ${msgType}`);

      // ── Voice/Audio message ──
      if (msgType === 'audio' || msgType === 'voice') {
        await sendReply(from, buildVoiceReply());
        continue;
      }

      // ── Only handle text from here ──
      if (msgType !== 'text') continue;

      const text: string = msg.text?.body || '';
      const intent = detectIntent(text);

      console.log(`💬 Text: "${text}" → Intent: ${intent}`);

      // ── Greeting → welcome menu ──
      if (intent === 'greeting') {
        await sendReply(from, buildGreetingReply());
        continue;
      }

      // ── Personal / random message ──
      if (intent === 'personal') {
        await sendReply(from, buildPersonalReply());
        continue;
      }

      // ── New connection inquiry ──
      if (intent === 'new_connection') {
        await sendReply(from, buildNewConnectionReply());
        continue;
      }

      // ── Business intent: lookup customer in Supabase ──
      const result = await findCustomerByPhone(from);

      if (!result) {
        await sendReply(from, buildUnknownCustomerReply());
        continue;
      }

      const { manager_id, user } = result;

      if (intent === 'bill') {
        await sendReply(from, buildBillReply(user));
      } else if (intent === 'expiry') {
        await sendReply(from, buildExpiryReply(user));
      } else if (intent === 'complaint') {
        const ticketId = await saveComplaint(manager_id, user.id, user.name, from, text) || `#${Date.now()}`;
        await sendReply(from, buildComplaintReply(user, ticketId));
      }
    }
  } catch (err: any) {
    console.error('Webhook processing error:', err?.message || err);
  }

  // Respond 200 AFTER all processing is done
  return res.status(200).json({ status: 'ok' });
}
