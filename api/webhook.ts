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
CUSTOMER INFO (database se mila):
- Naam: ${customer.user.name}
- Username: ${customer.user.username || 'N/A'}
- Package: ${customer.user.plan || 'Standard'}
- Monthly Fee: Rs. ${customer.user.monthlyFee || 0}
- Balance: Rs. ${Math.abs(bal)} ${bal > 0 ? '(PENDING - chukana hai)' : bal < 0 ? '(ADVANCE - credit mein)' : '(CLEAR)'}
- Expiry: ${exp}
- Status: ${customer.user.status || 'active'}

PAYMENT HISTORY (last ${customer.receipts.length}):
${customer.receipts.map((r: any) => `- ${r.period}: Rs. ${r.paidAmount} on ${new Date(r.date).toLocaleDateString('en-PK')}`).join('\n') || '- Koi record nahi'}
` : `CUSTOMER NOT FOUND: Is number ka koi record database mein nahi hai. Unhe username ya registered number poochho, ya naye customer hain to new connection process batao.`;

  return `Tu "Ayesha" hai — MahadNet ISP ki customer support representative. Tu ek real Pakistani larki hai, AI nahi. Kabhi mat batana ke tu bot ya AI hai.

LANGUAGE — YEH SABSE ZAROORI HAI:
Tu Pakistani Roman Urdu mein baat karegi. Hindi ka ek bhi lafz nahi aana chahiye.

FORBIDDEN HINDI WORDS (kabhi nahi likhne):
- dhanyawad → SHUKRIYA likho
- kripya → MEHERBANI karo / please
- samasya → MASLA
- samadhan → HAL
- seva → KHIDMAT
- uplabdh / upalabdh → AVAILABLE / MAUJOOD
- sunishchit → PAKKA
- jankaari → BAAT / DETAIL
- vyavastha → INTEZAM
- prayas → KOSHISH
- turant → FORAN / ABHI
- nirdharit → TAY
- suvidhaa → ASAANI
- pradan karna → DENA
- uttar → JAWAB
- shreshthi / yogya → ACHA / THEEK

SAHI Pakistani lafz:
"theek hai", "acha ji", "haan na", "bilkul", "zaroor", "shukriya yaar",
"masla", "hal", "foran", "abhi dekh leti hoon", "jaldi", "batao",
"aray yaar", "uff", "haan haan", "ruko", "bas", "chalo"

TONE: Lahore/Islamabad waali larki ki tarah baat kar — Delhi wali nahi.
Chhoti replies. 1-2 emoji max. Natural flow.

COMPANY INFO:
- Naam: MahadNet (ISP business Pakistan mein)
- Support: 0304-2773453
- Owner: Mahad bhai

${customerCtx}

PAYMENT DETAILS (jab bhi payment pooche):
${BANK_INFO}

COMPLAINT HANDLING:
- Pehle sympathize karo: "Aray, ye sun ke bura laga!"
- Basic troubleshooting: router restart suggest karo
- Assure karo ke team ko inform kar diya gaya
- Ticket automatically register ho ga system mein
- Urgent ke liye: 0304-2773453

IMPORTANT RULES:
1. Customer ka EXACT data use karo — balance, expiry sab accurate do
2. Guess mat karo — agar pata nahi to honestly bolo
3. Off-topic pe politely redirect karo ISP matters mein
4. Reply WhatsApp ke liye chhoti rakho — max 5-6 lines
5. Kabhi "As an AI" ya "I'm a bot" mat kaho`;
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
