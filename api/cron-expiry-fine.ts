// api/cron-expiry-fine.ts — Fine-grained expiry alerts: 6h-before, 1h-before, and an
// immediate "just expired" notice. Runs HOURLY via Supabase pg_cron + pg_net (Vercel
// Cron on this plan only supports once-daily schedules, so the precise 6h/1h timing
// can't be done through vercel.json — Supabase calls this endpoint every hour instead).
//
// Expiry moment = midnight (00:00) Pakistan time on the customer's expiryDate.
// A send-log lives in the bot-private `_bot_sessions` row (separate key from the daily
// cron's own log) so reminders are never duplicated and the customer-facing AppState
// is never touched/risked.

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const SUPPORT_NUMBER = '0304-2773453';
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Pakistan Standard Time = UTC+5, no DST

async function sendText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ WA env missing'); return false; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    const d = await r.json();
    if (!r.ok) { console.error('❌ Meta text:', JSON.stringify(d).slice(0, 200)); return false; }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          manager_id: 'mahadnet', customer_phone: to.replace(/\D/g, '').slice(-10),
          direction: 'out', type: 'text', content: body, wa_message_id: d?.messages?.[0]?.id || null,
        }),
      });
    } catch (e: any) { console.error('[cron log]', e?.message); }
    return true;
  } catch (e: any) { console.error('❌ sendText:', e?.message); return false; }
}

function fineReminderMessage(name: string, plan: string, stage: '6h' | '1h' | 'expired'): string {
  if (stage === '6h') {
    return `Assalam o Alaikum *${name}*! ⏰\n\nAap ka *${plan || 'internet'}* package agle *6 ghante* mein expire ho jayega (aaj raat 12 baje).\n\nTime se renew kar lein taake service bila wuqfa continue rahe! 🙏`;
  }
  if (stage === '1h') {
    return `Assalam o Alaikum *${name}*! ⚠️\n\nAap ka *${plan || 'internet'}* package sirf *1 ghante* mein expire hone wala hai!\n\nForan renew kar lein taake internet band na ho. Payment ke baad screenshot zaroor bhejein. 🙏`;
  }
  return `Assalam o Alaikum *${name}*! 🔴\n\nAap ka *${plan || 'internet'}* package expire ho gaya hai, internet band ho chuka hai.\n\nDobara chalane ke liye foran renew karein! Koi madad chahiye to call karein: *${SUPPORT_NUMBER}* 📞`;
}

export default async function handler(req: any, res: any) {
  const auth = req.headers?.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await resp.json();

    const sessionsRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const sessionsRows = await sessionsRes.json();
    const sessionRowExists = Array.isArray(sessionsRows) && sessionsRows.length > 0;
    const sessionData = sessionsRows?.[0]?.data || { sessions: {} };
    const sentLog: Record<string, string> = sessionData.expiryFineReminderLog || {};

    const nowMs = Date.now();
    let sentCount = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const data = row.data || {};
      const users: any[] = data.users || [];

      for (const u of users) {
        if (!u || u.status === 'deleted' || !u.expiryDate) continue;
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(u.expiryDate));
        if (!m) continue;
        const [, y, mo, d] = m;
        // Expiry moment = midnight PKT on expiryDate, expressed as a UTC timestamp.
        const expiryMomentMs = Date.UTC(+y, +mo - 1, +d, 0, 0, 0) - PKT_OFFSET_MS;
        const hoursUntil = (expiryMomentMs - nowMs) / 3600000;

        let stage: '6h' | '1h' | 'expired' | null = null;
        if (hoursUntil <= 6.5 && hoursUntil > 5.5) stage = '6h';
        else if (hoursUntil <= 1.5 && hoursUntil > 0.5) stage = '1h';
        else if (hoursUntil <= 0 && hoursUntil > -1) stage = 'expired';
        if (!stage) continue;

        const key = `${row.manager_id}:${u.id}:${u.expiryDate}:${stage}`;
        if (sentLog[key]) { skipped++; continue; }

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        const ok = await sendText(phone, fineReminderMessage(u.name || 'Customer', u.plan, stage));
        if (ok) {
          sentLog[key] = new Date().toISOString();
          sentCount++;
        }
      }
    }

    if (sentCount > 0) {
      const updatedData = { ...sessionData, expiryFineReminderLog: sentLog };
      if (sessionRowExists) {
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: updatedData }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ manager_id: '_bot_sessions', data: updatedData }),
        });
      }
    }

    console.log(`✅ Fine expiry reminders: sent=${sentCount} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sent: sentCount, skipped });
  } catch (e: any) {
    console.error('[cron-expiry-fine]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
