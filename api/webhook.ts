// api/webhook.ts — Ayesha Bot v3 (Gemini AI Powered)
// MahadNet WhatsApp Customer Support

const SUPABASE_URL  = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN  = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';
const GEMINI_KEY    = process.env.GEMINI_API_KEY || '';
const GEMINI_URL    = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

// ─── Hardcoded Payment Details ────────────────────────────────────────────────
const PAYMENT_DETAILS = `
PAYMENT METHODS (Customer ko yeh details do jab bhi payment pooche):

1. ASKARI BANK:
   Account Title : MAHAD AHMAD KHAN LODHI
   Account Number: 0032060001238
   IBAN          : PK32ASCM000032060001238

2. MEEZAN BANK:
   Account Title : MAHAD AHMAD KHAN LODHI
   Account Number: 00300112164874
   IBAN          : PK82MEZN0000300112164874

3. NAYAPAY:
   Account Title : MAHAD AHMAD KHAN LODHI
   IBAN          : PK42NAYA1234503282200943

4. EasyPaisa : 03042773453
5. JazzCash  : 03042773453

Payment karne ke baad screenshot ya receipt WhatsApp pe bhej dein confirmation ke liye.
`;

// ─── Supabase: find customer by phone ─────────────────────────────────────────
async function findCustomer(phone: string): Promise<{ managerId: string; user: any; receipts: any[]; packages: string[] } | null> {
  const norm = phone.replace(/\D/g, '').slice(-10);
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
        return u.phone?.replace(/\D/g, '').slice(-10) === norm ||
               u.phone2?.replace(/\D/g, '').slice(-10) === norm;
      });

      if (user) {
        // Get last 5 successful receipts
        const receipts = (row.data?.receipts || [])
          .filter((r: any) => r.userId === user.id && r.status === 'Success')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);

        // Get available packages from settings
        const settings = row.data?.settings || {};
        const packages: string[] = settings.packages || settings.plans || [];

        return { managerId: row.manager_id, user, receipts, packages };
      }
    }
  } catch (e: any) { console.error('[findCustomer]', e?.message); }
  return null;
}

// ─── Save complaint to Supabase ────────────────────────────────────────────────
async function saveComplaint(managerId: string, user: any, issue: string): Promise<string> {
  try {
    const res  = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    if (!rows.length) return `WA${Date.now()}`;

    const data       = rows[0].data || {};
    const complaints = data.complaints || [];
    const t          = issue.toLowerCase();
    const priority   = /urgent|emergency|3\s*din|2\s*din|kal\s*se|bilkul\s*nahi/.test(t) ? 'high'
                     : /slow|thoda|kabhi\s*kabhi/.test(t) ? 'low' : 'medium';
    const ticketId   = `WA-${Date.now()}`;

    complaints.push({
      id: ticketId,
      customerId: user.id,
      customerName: user.name,
      customerPhone: user.phone,
      title: `WhatsApp Complaint: ${issue.slice(0, 60)}`,
      description: issue,
      status: 'open',
      priority,
      createdAt: new Date().toISOString(),
      createdBy: 'ayesha_bot',
      notes: `Auto-registered via Ayesha WhatsApp Bot`,
    });

    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ data: { ...data, complaints } }),
    });

    console.log(`✅ Complaint saved: ${ticketId}`);
    return ticketId;
  } catch (e: any) {
    console.error('[saveComplaint]', e?.message);
    return `WA${Date.now()}`;
  }
}

// ─── Build Gemini system prompt ───────────────────────────────────────────────
function buildPrompt(customerData: Awaited<ReturnType<typeof findCustomer>>, incomingMsg: string): string {
  // Format customer info
  let customerSection = '';

  if (customerData) {
    const u   = customerData.user;
    const bal = u.balance ?? 0;
    const exp = u.expiryDate
      ? new Date(u.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
      : 'N/A';

    const balStatus = bal > 0 ? `Rs. ${bal} PENDING (chukana hai)` : bal < 0 ? `Rs. ${Math.abs(bal)} ADVANCE (credit mein hain)` : 'CLEAR (kuch nahi bacha)';

    const payHistory = customerData.receipts.length
      ? customerData.receipts.map((r: any) =>
          `  - ${r.period}: Rs. ${r.paidAmount} paid on ${new Date(r.date).toLocaleDateString('en-PK')}`
        ).join('\n')
      : '  Koi record nahi mila';

    const pkgs = customerData.packages.length
      ? customerData.packages.join(', ')
      : 'Standard packages available — pricing ke liye contact karo';

    customerSection = `
=== IS CUSTOMER KI DATABASE INFO ===
Naam         : ${u.name}
Username     : ${u.username || 'N/A'}
Phone        : ${u.phone}
Package/Plan : ${u.plan || 'N/A'}
Monthly Fee  : Rs. ${u.monthlyFee || 'N/A'}
Balance      : ${balStatus}
Expiry Date  : ${exp}
Status       : ${u.status || 'active'}

PAYMENT HISTORY (pichle ${customerData.receipts.length} payments):
${payHistory}

AVAILABLE PACKAGES (agar pooche):
${pkgs}
=====================================`;
  } else {
    customerSection = `
=== CUSTOMER STATUS ===
Is number (${incomingMsg}) ka koi record database mein nahi mila.
Inhe politely batao ke unka number registered nahi hai.
Unse Username ya registered phone number poochho taake identify kar sakein.
Ya agar new customer hain to new connection process batao.
=======================`;
  }

  return `Tu "Ayesha" hai — MahadNet ISP ki customer support agent. Tu ek real, professional Pakistani larki hai jo customers ki help karti hai. Tu KABHI nahi batayegi ke tu AI ya bot hai.

=== TERI PERSONALITY ===
- Baat karo fluent Roman Urdu mein (Urdu script nahi, sirf Roman)
- Warm, friendly, aur empathetic raho — jaise ek dost madad kar rahi ho
- Short aur clear replies do — ek hi message mein sab batao
- Emojis naturally use karo, excessive nahi
- "Ji bilkul", "zaroor", "main abhi check karti hoon", "aap ki baat samajh aayi" jaise phrases use karo
- Kabhi bhi robotic ya stiff mat lagna — bilkul natural
- Agar complain ho to pehle sympathize karo: "Acha, ye sun ke dukh hua. Main abhi is matter ko urgently handle karti hoon!"
- WhatsApp pe chhote paras likhna — zyada text ek sath mat do
=========================

=== MAHADNET ISP INFO ===
Company    : MahadNet
Support    : 0304-2773453
Service    : Fiber/Broadband Internet (Pakistan)
Manager    : Mahad bhai (owner)
Bot Name   : Ayesha (customer support)
=========================

${customerSection}

${PAYMENT_DETAILS}

=== COMPLAINT HANDLING ===
Agar internet down/slow ho:
1. Pehle sympathize karo
2. Basic troubleshooting suggest karo (router restart)
3. Assure karo ke technical team ko inform kar diya gaya hai
4. Ticket number de do (system automatically save hoga)
5. Urgent ho to: 0304-2773453
==========================

=== IMPORTANT RULES ===
1. Customer ka exact data use karo — guess MAT karo
2. Balance/bill numbers bilkul accurate do (database se aho)
3. Off-topic baatein politely redirect karo ISP matters pe
4. Agar koi cheez confirm nahi to honestly bolo aur Mahad bhai se contact karne ko kaho
5. Lambi list mat do — sirf relevant info
6. Message chhota rakho — WhatsApp pe padhna easy ho
=======================

Customer ka message: "${incomingMsg}"

Ayesha ka reply (sirf reply likho, koi prefix nahi):`;
}

// ─── Call Gemini API ──────────────────────────────────────────────────────────
async function askGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 450,
        topP: 0.92,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('❌ Gemini error:', JSON.stringify(err).slice(0, 200));
    throw new Error(`Gemini ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty response');
  return text.trim();
}

// ─── Detect if message needs complaint saving ──────────────────────────────────
function isComplaint(text: string): boolean {
  return /complaint|shikayat|internet\s*(nahi|band|slow|down)|net\s*(nahi|band|slow)|speed\s*(slow|kam)|wifi\s*(nahi|band)|masla|problem|issue|kharab|chal\s*nahi/.test(text.toLowerCase());
}

// ─── Send WhatsApp text ───────────────────────────────────────────────────────
async function sendText(to: string, message: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ WA env missing'); return; }

  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta error:', JSON.stringify(d).slice(0, 200));
    else console.log('✅ Sent to', to, '|', d?.messages?.[0]?.id);
  } catch (e: any) { console.error('❌ sendText:', e?.message); }
}

// ─── Fallback reply (if Gemini fails) ────────────────────────────────────────
const FALLBACK = `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support.\n\nIs waqt hamara system thoda slow hai. Kripya thodi der baad dobara try karein ya seedha call karein:\n📞 0304-2773453\n\nMuafi chahti hoon takleef ke liye! 🙏`;

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // GET — webhook verification
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const messages: any[] = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];

    for (const msg of messages) {
      const from: string    = msg.from;
      const msgType: string = msg.type;
      const text: string    = msg?.text?.body?.trim() || '';

      console.log(`📩 from=${from} type=${msgType} text="${text.slice(0, 80)}"`);

      // ── Voice / audio ──
      if (msgType === 'audio' || msgType === 'voice') {
        await sendText(from,
          `Assalam o Alaikum! 😊 Main Ayesha hoon.\n\nAap ki voice note mil gayi! Lekin main abhi audio process nahi kar sakti.\n\nKripya apna masla *text* mein likhein — main foran help karungi! ✍️\nYa call karein: *0304-2773453* 📞`
        );
        continue;
      }

      // ── Non-text (sticker, image, etc.) ──
      if (msgType !== 'text') {
        await sendText(from,
          `Ji! 😊 Main text messages samajh sakti hoon. Apna masla likh kar bhejein, main zaroor help karungi! 🙏`
        );
        continue;
      }

      if (!text) continue;

      // ── Fetch customer data from Supabase ──
      const customerData = await findCustomer(from);
      console.log(`👤 Customer: ${customerData ? customerData.user.name : 'NOT FOUND'}`);

      // ── Auto-save complaint if detected ──
      let ticketId = '';
      if (customerData && isComplaint(text)) {
        ticketId = await saveComplaint(customerData.managerId, customerData.user, text);
        console.log(`🎫 Complaint ticket: ${ticketId}`);
      }

      // ── Build prompt with ticket info if complaint ──
      let finalMsg = text;
      if (ticketId) {
        finalMsg = `${text}\n\n[SYSTEM NOTE: Complaint automatically registered. Ticket ID: ${ticketId}. Is ticket ID ka zikr reply mein karo.]`;
      }

      // ── Ask Gemini ──
      let aiReply = '';
      try {
        const prompt = buildPrompt(customerData, finalMsg);
        aiReply = await askGemini(prompt);
        console.log(`🤖 Gemini reply: "${aiReply.slice(0, 100)}"`);
      } catch (e: any) {
        console.error('Gemini failed, using fallback:', e?.message);
        aiReply = FALLBACK;
      }

      await sendText(from, aiReply);
    }
  } catch (err: any) {
    console.error('[webhook error]', err?.message || err);
  }

  return res.status(200).json({ status: 'ok' });
}
