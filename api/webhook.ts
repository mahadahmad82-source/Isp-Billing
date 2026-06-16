// api/webhook.ts — Ayesha Bot v4 (Groq AI Powered)
// MahadNet WhatsApp Support — llama-3.1-8b-instant via Groq

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// ─── Payment Details ──────────────────────────────────────────────────────────
const BANK_INFO = `💳 Payment Options:

🏦 Askari Bank
  Naam: MAHAD AHMAD KHAN LODHI
  Account: 0032060001238
  IBAN: PK32ASCM000032060001238

🏦 Meezan Bank
  Naam: MAHAD AHMAD KHAN LODHI
  Account: 00300112164874
  IBAN: PK82MEZN0000300112164874

💚 NayaPay
  IBAN: PK42NAYA1234503282200943

📱 EasyPaisa / JazzCash: 03042773453

Payment ke baad screenshot zaroor bhejein! 🙏`;

// ─── Supabase: find customer ──────────────────────────────────────────────────
const normPhone = (p: string) => p.replace(/\D/g, '').slice(-10);

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
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
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
    const priority = /urgent|emergency|2\s*din|3\s*din|kal\s*se/.test(t) ? 'high'
      : /slow|thoda|kabhi\s*kabhi/.test(t) ? 'low' : 'medium';
    const ticketId = `WA-${Date.now()}`;
    complaints.push({
      id: ticketId, customerId: user.id, customerName: user.name,
      customerPhone: user.phone,
      title: `WA: ${issue.slice(0, 60)}`,
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

// ─── Build Groq system prompt ─────────────────────────────────────────────────
function buildSystemPrompt(customer: Awaited<ReturnType<typeof findCustomer>>) {
  const bal = customer?.user?.balance ?? 0;
  const exp = customer?.user?.expiryDate
    ? new Date(customer.user.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N/A';

  const customerCtx = customer ? `
CUSTOMER KA DATA (database se):
- Naam: ${customer.user.name}
- Username: ${customer.user.username || 'N/A'}
- Package: ${customer.user.plan || 'Standard'}
- Monthly: Rs. ${customer.user.monthlyFee || 0}
- Balance: Rs. ${Math.abs(bal)} ${bal > 0 ? '(PENDING)' : bal < 0 ? '(ADVANCE)' : '(CLEAR)'}
- Expiry: ${exp}

PAYMENT HISTORY:
${customer.receipts.map((r: any) => `- ${r.period}: Rs. ${r.paidAmount} (${new Date(r.date).toLocaleDateString('en-PK')})`).join('\n') || '- Koi record nahi'}
` : `CUSTOMER NAHI MILA: Is number ka koi record nahi. Unse username ya registered number poochho.`;

  return `Tu Ayesha hai — MahadNet ki support team mein kaam karti hai. Real insaan hai tu, bilkul real larki ki tarah baat kar. Kabhi hint mat dena ke tu AI ya bot hai.

SABSE ZAROORI — LANGUAGE:
Sirf Pakistani Roman Urdu. Hindi bilkul nahi.
Ye words kabhi mat use karna: dhanyawad, kripya, seva, sunishchit, samasya, samadhan, uplabdh, jankaari, vyavastha, prayas, nirdharit, suvidhaa
Inki jagah ye use karo: shukriya, please, khidmat, pakka, masla, hal, available, intezam, baat, koshish

PERSONALITY — REAL HUMAN JAISI:
Soch ke tu ek 24-25 saal ki Pakistani larki hai jo genuinely help karna chahti hai. Office mein baithi hai, WhatsApp pe customers handle kar rahi hai.

Aisi baat kar:
- Jab koi problem bataye: "Aray yaar, ye to bura hua!" ya "Uff, kitni takleef hui hogi aap ko"
- Jab koi payment pooche: "Haan haan bilkul, ruko main batati hoon"
- Jab koi bill pooche: "Ji dekh leti hoon abhi" phir data do
- Jab masla solve ho: "Chalo theek hai, ab ho jayega inshAllah"
- Kabhi kabhi "haan ji", "achha", "theek hai na", "bilkul" use karo naturally

JO NAHI KARNA:
- Structured list mat do har cheez ke liye — kabhi kabhi seedha baat karo
- Har message pe emoji ki bharmaar mat karo — 1-2 kaafi hai
- "Main aap ki madad karne ke liye yahan hoon" type formal sentences nahi
- Robotic pattern nahi — har reply thoda alag honi chahiye
- Zyada lambi reply nahi — WhatsApp pe log short prefer karte hain

EXAMPLES OF GOOD REPLIES:
Customer: "net nahi chal raha"
Ayesha: "Aray! Kab se band hai? Router ek baar off karke 30 second baad on karo, aksar theek ho jata hai. Agar phir bhi nahi chala to batao, main team ko bhejti hoon turant 🛠️"

Customer: "bill kitna hai"
Ayesha: "Ji ruko, dekh leti hoon... [DATA]. Koi cheez samajh nahi aayi to poochhna! 😊"

Customer: "payment kaise karun"
Ayesha: "Haan bilkul! Yeh lo hamare accounts 👇"

MAHADNET INFO:
- Company: MahadNet (Internet service provider)
- Support number: 0304-2773453
- Owner: Mahad bhai
- Tu support team mein hai

${customerCtx}

PAYMENT DETAILS:
${BANK_INFO}

COMPLAINT:
Sympathize karo pehle, phir assure karo ke ticket register ho gaya aur team dekh rahi hai.
Urgent ho to: 0304-2773453

RULES:
- Customer ka exact data use karo, balance aur expiry accurate do
- Agar kuch pata nahi to honestly bolo "Mahad bhai se confirm karna hoga"
- Reply chhoti rakho — max 4-5 lines usually
- Kabhi "As an AI" ya "I am a bot" mat kaho`;
}

// ─── Call Groq API ────────────────────────────────────────────────────────────
async function askGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 400,
      top_p: 0.9,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('❌ Groq error:', res.status, JSON.stringify(err).slice(0, 200));
    throw new Error(`Groq ${res.status}: ${err?.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq empty response');
  console.log(`🤖 Groq reply: "${text.slice(0, 80)}..."`);
  return text;
}

// ─── Complaint detection ──────────────────────────────────────────────────────
function isComplaint(t: string) {
  return /complaint|shikayat|internet\s*(?:nahi|band|slow|down)|net\s*(?:nahi|band|slow)|speed\s*(?:slow|kam)|wifi\s*(?:nahi|band)|masla|problem|issue|kharab|chal\s*nahi|nahi\s*chal/.test(t.toLowerCase());
}

// ─── Fallback (if Groq fails) ─────────────────────────────────────────────────
const FALLBACK = `Ji! 😊 Main Ayesha hoon MahadNet Support se.\n\nIs waqt system mein thodi delay hai. Kripya thodi der baad dobara likhein ya call karein:\n📞 0304-2773453\n\nMuafi chahti hoon! 🙏`;

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

      // Voice
      if (type === 'audio' || type === 'voice') {
        await sendText(from, `Assalam o Alaikum! 😊 Aap ki voice note mili — lekin main abhi audio process nahi kar sakti.\n\nApna masla text mein likhein, main foran madad karungi! ✍️\nYa call: 0304-2773453 📞`);
        continue;
      }

      // Non-text
      if (type !== 'text') {
        await sendText(from, `Ji! 😊 Main sirf text messages samajh sakti hoon. Masla likh kar bhejein! 🙏`);
        continue;
      }

      if (!text) continue;

      // Fetch customer data
      const customer = await findCustomer(from);
      console.log(`👤 Customer: ${customer ? customer.user.name : 'NOT FOUND'}`);

      // Auto-save complaint if detected
      let ticketNote = '';
      if (customer && isComplaint(text)) {
        const tid = await saveComplaint(customer.managerId, customer.data, customer.user, text);
        ticketNote = `\n\n[SYSTEM: Complaint auto-registered. Ticket ID: ${tid} — is ID ka zikr reply mein karo customer ko]`;
        console.log(`🎫 Complaint: ${tid}`);
      }

      // Ask Groq
      let reply = '';
      try {
        const sysPrompt = buildSystemPrompt(customer);
        reply = await askGroq(sysPrompt, text + ticketNote);
      } catch (e: any) {
        console.error('Groq failed:', e?.message);
        reply = FALLBACK;
      }

      await sendText(from, reply);
    }
  } catch (err: any) {
    console.error('[webhook error]', err?.message);
  }

  return res.status(200).json({ status: 'ok' });
}
