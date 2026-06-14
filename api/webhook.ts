// api/webhook.ts — Ayesha Bot v2 (MahadNet WhatsApp AI)
// Features: smart greetings, full billing, receipts, complaint tickets, ElevenLabs voice

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

// ─── Greeting detection (all Arabic salam variations + casual) ────────────────
function isGreeting(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 60) return false; // long messages are not greetings
  return /as+ala+m+[\s\w]*|a\.?o\.?a\.?|salam+|sal4m|good\s*(morning|evening|afternoon|night)|hi+\b|hey+\b|helo+|hello+|kya\s*hal|how\s*are|assalamu/.test(t);
}

// ─── Intent detection ─────────────────────────────────────────────────────────
type Intent = 'bill' | 'complaint' | 'new_connection' | 'expiry' | 'greeting' | 'personal' | 'payment_history';

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (isGreeting(text)) return 'greeting';
  if (/history|payments?\s*ki|kin\s*kin|pichle|purani|payment\s*list|kin\s*mahino/.test(t)) return 'payment_history';
  if (/expir|khatam|kab\s*band|band\s*hoga|end\s*date|package\s*kab/.test(t)) return 'expiry';
  if (/complaint|shikayat|problem|masla|kharab|slow|down|band\s*hai|chal\s*nahi|nahi\s*chal|issue|khraab/.test(t)) return 'complaint';
  if (/internet|net\b|wifi|speed|lag\s*raha|nahi\s*aa\s*raha/.test(t)) return 'complaint';
  if (/bill|balance|dues|arrear|baqi|kitna\s*banta|kitna\s*hai|payment|paisa|fees?|monthly/.test(t)) return 'bill';
  if (/nay[ai]\s*connection|new\s*connection|install|lena\s*hai|lagwana|connection\s*chahiye/.test(t)) return 'new_connection';
  return 'personal';
}

function normalizePhone(p: string): string { return p.replace(/\D/g, '').slice(-10); }

// ─── Supabase: find customer + receipts ──────────────────────────────────────
async function findCustomer(whatsappNum: string): Promise<{ managerId: string; user: any; receipts: any[]; complaints: any[] } | null> {
  const norm = normalizePhone(whatsappNum);
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
      if (user) {
        const allReceipts: any[] = row.data?.receipts || [];
        const userReceipts = allReceipts
          .filter((r: any) => r.userId === user.id && r.status === 'Success')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const userComplaints: any[] = (row.data?.complaints || []).filter((c: any) => c.customerId === user.id || c.userId === user.id);
        return { managerId: row.manager_id, user, receipts: userReceipts, complaints: userComplaints };
      }
    }
  } catch (e: any) { console.error('[findCustomer]', e?.message); }
  return null;
}

// ─── Supabase: save ComplaintTicket (matches ComplaintTicket type exactly) ────
async function saveComplaint(managerId: string, user: any, issueText: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    if (!rows.length) return `WA${Date.now()}`;
    const data = rows[0].data || {};
    const complaints: any[] = data.complaints || [];

    // Detect priority from text
    const t = issueText.toLowerCase();
    const priority = /urgent|emergency|bilkul\s*nahi|completely\s*down|3\s*din|2\s*din|kal\s*se/.test(t) ? 'high'
      : /slow|thoda|kabhi\s*kabhi|intermittent/.test(t) ? 'low' : 'medium';

    const ticketId = `WA-${Date.now()}`;
    const ticket = {
      id: ticketId,
      customerId: user.id,
      customerName: user.name,
      customerPhone: user.phone,
      title: `WhatsApp: ${issueText.slice(0, 50)}`,
      description: issueText,
      status: 'open',
      priority,
      createdAt: new Date().toISOString(),
      createdBy: 'whatsapp_bot',
      notes: `Auto-registered via Ayesha Bot. Customer WhatsApp: ${user.phone}`,
    };

    complaints.push(ticket);
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ data: { ...data, complaints } }),
    });
    console.log(`✅ Complaint saved: ${ticketId} priority=${priority}`);
    return ticketId;
  } catch (e: any) { console.error('[saveComplaint]', e?.message); return `WA${Date.now()}`; }
}

// ─── ElevenLabs voice + WhatsApp audio send ───────────────────────────────────
async function sendVoiceReply(to: string, text: string): Promise<boolean> {
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const voiceId   = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9'; // Lily (multilingual female)
  const waToken   = process.env.WHATSAPP_TOKEN;
  const pid       = process.env.PHONE_NUMBER_ID;

  if (!elevenKey || !waToken || !pid) return false;

  try {
    // 1. Generate audio from ElevenLabs (multilingual v2 — supports Roman Urdu)
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    });

    if (!ttsRes.ok) { console.error('ElevenLabs error:', ttsRes.status); return false; }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // 2. Upload audio to WhatsApp Media API
    const boundary = `----FormBoundary${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\naudio/mpeg\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ayesha_reply.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${pid}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    const uploadData = await uploadRes.json();
    if (!uploadData.id) { console.error('Media upload failed:', uploadData); return false; }

    // 3. Send audio message
    const msgRes = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'audio',
        audio: { id: uploadData.id },
      }),
    });

    const msgData = await msgRes.json();
    if (!msgRes.ok) { console.error('Audio send failed:', msgData); return false; }

    console.log('✅ Voice reply sent! ID:', msgData?.messages?.[0]?.id);
    return true;
  } catch (e: any) { console.error('[sendVoiceReply]', e?.message); return false; }
}

// ─── Text reply ───────────────────────────────────────────────────────────────
async function sendText(to: string, text: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ Env missing'); return; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta:', JSON.stringify(d));
    else console.log('✅ Text sent to', to);
  } catch (e: any) { console.error('❌ sendText:', e?.message); }
}

// ─── Smart reply: voice if available, else text ───────────────────────────────
async function reply(to: string, text: string, preferVoice = false) {
  if (preferVoice) {
    const voiced = await sendVoiceReply(to, text);
    if (voiced) return;
  }
  await sendText(to, text);
}

// ─── Reply builders ───────────────────────────────────────────────────────────
function greetingMsg(name?: string): string {
  const greeting = name
    ? `Walaikum Assalam, ${name}! 😊`
    : `Walaikum Assalam! 😊`;
  return (
    `${greeting} Main Ayesha hoon, MahadNet ki customer support.\n\n` +
    `Aap ki kya khidmat kar sakti hoon? Neeche se choose karein:\n\n` +
    `1️⃣  *Bill / Balance* — current dues check karein\n` +
    `2️⃣  *Payment history* — pichle payments dekhein\n` +
    `3️⃣  *Internet masla* — complaint darj karwayein\n` +
    `4️⃣  *Expiry / Package* — connection ki taareekh\n` +
    `5️⃣  *Naya connection* — naye ilaqe mein service\n\n` +
    `Ya seedha apna masla likh dein, main samajh jaungi! 🙏`
  );
}

function billMsg(user: any, receipts: any[]): string {
  const bal      = user.balance ?? 0;
  const expiry   = user.expiryDate ? new Date(user.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const lastPaid = receipts[0];
  const discount = user.persistentDiscount ? `\n🏷️  Discount: Rs. ${user.persistentDiscount}` : '';

  let msg = `*📋 Account Summary — MahadNet*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `👤 ${user.name} (${user.username})\n`;
  msg += `📦 Package: ${user.plan}\n`;
  msg += `💰 Monthly: Rs. ${user.monthlyFee}${discount}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;

  if (bal > 0) {
    msg += `🔴 *Pending Balance: Rs. ${bal}*\n`;
    msg += `⚠️  Payment jaldi karein!\n`;
  } else if (bal < 0) {
    msg += `🟢 *Advance Balance: Rs. ${Math.abs(bal)}*\n`;
    msg += `✅ Aap advance mein hain!\n`;
  } else {
    msg += `🟢 *Balance: Clear ✅*\n`;
  }

  msg += `📅 Expiry: ${expiry}\n`;
  if (lastPaid) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🧾 Last payment: Rs. ${lastPaid.paidAmount} (${lastPaid.period})\n`;
    msg += `📆 Date: ${new Date(lastPaid.date).toLocaleDateString('en-PK')}\n`;
  }
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `Koi aur sawaal? Main haazir hoon! 🙏`;
  return msg;
}

function paymentHistoryMsg(user: any, receipts: any[]): string {
  if (!receipts.length) return `${user.name}, abhi tak koi payment record nahi mila hamare system mein. Mahad bhai se confirm karein. 🙏`;
  const recent = receipts.slice(0, 5);
  let msg = `*🧾 Payment History — ${user.name}*\n━━━━━━━━━━━━━━━\n`;
  recent.forEach((r: any, i: number) => {
    const date = new Date(r.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    msg += `${i + 1}. *${r.period}*\n`;
    msg += `   💰 Rs. ${r.paidAmount} — ${date}\n`;
    if (r.balanceAmount > 0) msg += `   🔴 Baqi: Rs. ${r.balanceAmount}\n`;
    else if (r.advanceAmount) msg += `   🟢 Advance: Rs. ${r.advanceAmount}\n`;
  });
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `Total ${receipts.length} payment${receipts.length > 5 ? ` (pichle 5 dikha rahe hain)` : ''}\n🙏`;
  return msg;
}

function complaintMsg(user: any, ticketId: string, issueText: string): string {
  const t = issueText.toLowerCase();
  const priority = /urgent|emergency|3\s*din|2\s*din|kal\s*se/.test(t) ? '🔴 High' : /slow|thoda/.test(t) ? '🟡 Low' : '🟠 Medium';
  return (
    `✅ *Complaint Registered!*\n━━━━━━━━━━━━━━━\n` +
    `👤 Customer: ${user.name}\n` +
    `🎫 Ticket ID: *${ticketId}*\n` +
    `⚡ Priority: ${priority}\n` +
    `📝 Issue: ${issueText.slice(0, 80)}${issueText.length > 80 ? '...' : ''}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Hamara team aap se jald rabta karega. 📞\n` +
    `Urgent ho to: *0304-2773453*\n\n` +
    `Shukriya aap ki patience ke liye! 🙏`
  );
}

function expiryMsg(user: any): string {
  if (!user.expiryDate) return `${user.name}, expiry date system mein update nahi hai. Mahad bhai se poochein. 🙏`;
  const exp   = new Date(user.expiryDate);
  const today = new Date();
  const days  = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
  const dateStr = exp.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });

  let msg = `*📅 Package Info — ${user.name}*\n━━━━━━━━━━━━━━━\n`;
  msg += `📦 Package: ${user.plan}\n`;
  msg += `📅 Expiry: *${dateStr}*\n`;
  if (days > 0) {
    msg += days <= 5
      ? `⚠️ Sirf *${days} din* baqi hain! Jaldi renew karein.\n`
      : `✅ Abhi *${days} din* baqi hain.\n`;
  } else {
    msg += `🔴 *Package expire ho chuka hai!* Renew karein.\n`;
  }
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `Renewal ke liye message karein ya: *0304-2773453*\n🙏`;
  return msg;
}

function newConnectionMsg(): string {
  return (
    `Walaikum Assalam! MahadNet mein khushamdeed! 🎉\n\n` +
    `Main Ayesha hoon. Naya connection ke liye yeh 3 cheezein bhejein:\n\n` +
    `1️⃣  *Naam* — aap ka poora naam\n` +
    `2️⃣  *Area* — mohalla ya gali ka naam\n` +
    `3️⃣  *Package* — kitni speed chahiye? (10 Mbps / 20 Mbps / Other)\n\n` +
    `Hamara team 24 ghante mein aap ke area mein coverage check kar ke rabta karega! 📡\n\n` +
    `Koi sawaal? *0304-2773453* 🙏`
  );
}

function unknownMsg(): string {
  return (
    `Assalam o Alaikum! 😊 Main Ayesha hoon, MahadNet Support.\n\n` +
    `Aap ka number hamare system mein registered nahi mila.\n\n` +
    `Agar aap hamare customer hain:\n` +
    `👉 Apna *username* bhejein (jaise: *mahad01*)\n\n` +
    `Naya connection chahiye:\n` +
    `👉 *"Naya connection"* likhein\n\n` +
    `Ya directly call karein: *0304-2773453* 🙏`
  );
}

function personalMsg(): string {
  return (
    `Assalam o Alaikum! 😊\n` +
    `Main Ayesha hoon, MahadNet ki automated support.\n\n` +
    `Mahad bhai abhi available nahi hain.\n` +
    `Aap ka message unhe pahuncha diya jayega.\n\n` +
    `Internet, bill ya kisi masle mein madad chahiye to seedha likh dein! 🙏`
  );
}

function voiceNoteMsg(): string {
  return (
    `Assalam o Alaikum! 😊 Main Ayesha hoon.\n\n` +
    `Aap ki voice note mil gayi! 🎤\n` +
    `Lekin main voice messages process nahi kar sakti abhi.\n\n` +
    `Kripya apna masla *text* mein likhein — main foran madad karungi! ✍️\n\n` +
    `Ya call karein: *0304-2773453* 📞`
  );
}

function callMsg(): string {
  return (
    `Assalam o Alaikum! 😊\n\n` +
    `Aap ne call karne ki koshish ki — is number par WhatsApp calls support nahi hain abhi.\n\n` +
    `Madad ke liye:\n` +
    `✍️ Yahan message karein — main Ayesha hoon, 24/7 available!\n` +
    `📞 Direct call: *0304-2773453*\n\n` +
    `Kya masla hai? Likh dein! 🙏`
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
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
    const value    = req.body?.entry?.[0]?.changes?.[0]?.value || {};
    const messages: any[] = value.messages || [];
    const statuses: any[] = value.statuses || [];

    // Handle call events (type = 'call' or action = 'call')
    for (const msg of messages) {
      const from: string    = msg.from;
      const msgType: string = msg.type;
      const text: string    = msg?.text?.body || '';
      const hasVoice        = process.env.ELEVENLABS_API_KEY;

      console.log(`📩 from=${from} type=${msgType} text="${text.slice(0, 60)}"`);

      // Call attempt
      if (msgType === 'call' || msg?.call) {
        await reply(from, callMsg()); continue;
      }

      // Voice / audio note
      if (msgType === 'audio' || msgType === 'voice') {
        await reply(from, voiceNoteMsg(), !!hasVoice); continue;
      }

      // Non-text (image, sticker, document, etc.)
      if (msgType !== 'text') {
        await reply(from, `Assalam o Alaikum! 😊 Main sirf text messages samajh sakti hoon. Apna masla likh dein, main madad karungi! 🙏`);
        continue;
      }

      // --- Text message ---
      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      // Simple intents — no Supabase needed
      if (intent === 'greeting') {
        // Try to identify the customer to personalize greeting
        const found = await findCustomer(from);
        await reply(from, greetingMsg(found?.user?.name), !!hasVoice);
        continue;
      }

      if (intent === 'personal') {
        await reply(from, personalMsg()); continue;
      }

      if (intent === 'new_connection') {
        await reply(from, newConnectionMsg(), !!hasVoice); continue;
      }

      // Business intents — Supabase lookup required
      const found = await findCustomer(from);
      if (!found) { await reply(from, unknownMsg()); continue; }

      const { managerId, user, receipts } = found;

      if (intent === 'bill') {
        await reply(from, billMsg(user, receipts), !!hasVoice);
      } else if (intent === 'payment_history') {
        await reply(from, paymentHistoryMsg(user, receipts), !!hasVoice);
      } else if (intent === 'expiry') {
        await reply(from, expiryMsg(user), !!hasVoice);
      } else if (intent === 'complaint') {
        const ticketId = await saveComplaint(managerId, user, text);
        await reply(from, complaintMsg(user, ticketId, text), !!hasVoice);
      }
    }
  } catch (err: any) {
    console.error('[webhook error]', err?.message || err);
  }

  return res.status(200).json({ status: 'ok' });
}
