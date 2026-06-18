// api/cron-expiry-reminders.ts — Daily WhatsApp expiry reminders (3-day, 1-day, today)
// Triggered by Vercel Cron (see vercel.json). Reads every manager's users, and for anyone
// expiring in 3 days / 1 day / today, sends a WhatsApp reminder via Ayesha's number.
// A send-log is kept in the bot-private `_bot_sessions` row so reminders are never duplicated
// and the customer-facing AppState (manager_data.<id>.data) is never touched/risked.

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const SUPPORT_NUMBER = '0304-2773453';

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
    return true;
  } catch (e: any) { console.error('❌ sendText:', e?.message); return false; }
}

function reminderMessage(name: string, plan: string, days: number, expDate: string): string {
  const dateStr = new Date(expDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
  if (days === 3) {
    return `Assalam o Alaikum *${name}*! 😊\n\nAap ka *${plan || 'internet'}* package *3 din* mein expire hone wala hai (${dateStr}).\n\nTime se renew kar lein taake service bila wuqfa continue rahe! 🙏\n\nBank details chahiye? *"3"* likh kar bhejein.`;
  }
  if (days === 1) {
    return `Assalam o Alaikum *${name}*! ⚠️\n\nAap ka *${plan || 'internet'}* package *kal* (${dateStr}) expire ho raha hai.\n\nAbhi renew kar lein taake internet band na ho! Payment ke baad screenshot zaroor bhejein. 🙏`;
  }
  return `Assalam o Alaikum *${name}*! 🔴\n\nAap ka *${plan || 'internet'}* package *aaj* expire ho raha hai.\n\nInternet continue rakhne ke liye foran renew karein! Koi madad chahiye to call karein: *${SUPPORT_NUMBER}* 📞`;
}

export default async function handler(req: any, res: any) {
  // Optional protection — Vercel automatically sends this header when CRON_SECRET env var is set
  const auth = req.headers?.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // 1) Pull every manager's data
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await resp.json();

    // 2) Pull the bot-private send-log (kept separate from AppState so the app's dual-save
    //    pattern can never wipe it out)
    const sessionsRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const sessionsRows = await sessionsRes.json();
    const sessionRowExists = Array.isArray(sessionsRows) && sessionsRows.length > 0;
    const sessionData = sessionsRows?.[0]?.data || { sessions: {} };
    const sentLog: Record<string, string> = sessionData.expiryReminderLog || {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sentCount = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const data = row.data || {};
      const users: any[] = data.users || [];

      for (const u of users) {
        if (!u || u.status === 'deleted' || !u.expiryDate) continue;
        const exp = new Date(u.expiryDate);
        if (isNaN(exp.getTime())) continue;
        exp.setHours(0, 0, 0, 0);
        const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
        if (days !== 3 && days !== 1 && days !== 0) continue;

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        const key = `${row.manager_id}:${u.id}:${u.expiryDate}:${days}`;
        if (sentLog[key]) { skipped++; continue; }

        const msg = reminderMessage(u.name || 'Customer', u.plan, days, u.expiryDate);
        const ok = await sendText(phone, msg);
        if (ok) {
          sentLog[key] = new Date().toISOString();
          sentCount++;
        }
      }
    }

    // 3) Persist the updated send-log
    if (sentCount > 0) {
      const updatedData = { ...sessionData, expiryReminderLog: sentLog };
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

    console.log(`✅ Expiry reminders: sent=${sentCount} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sent: sentCount, skipped });
  } catch (e: any) {
    console.error('[cron-expiry-reminders]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
