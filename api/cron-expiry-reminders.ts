// api/cron-expiry-reminders.ts — Nightly WhatsApp expiry reminder (1-day-before only)
// Triggered by Vercel Cron (see vercel.json), runs at night PKT.
// Sends via the Meta-approved Utility template "expiry_reminder_1day" so it works
// outside the 24h customer-service window (unlike free-form text, which Meta
// silently drops if the customer hasn't messaged in the last 24h).
// A send-log is kept in the bot-private `_bot_sessions` row so reminders are
// never duplicated and the customer-facing AppState (manager_data.<id>.data)
// is never touched/risked.

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const TEMPLATE_NAME = 'expiry_reminder_1day';
const TEMPLATE_LANG = 'en';

async function sendTemplate(to: string, name: string, plan: string, dateStr: string): Promise<{ ok: boolean; wamid?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ WA env missing'); return { ok: false }; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: name },
              { type: 'text', text: plan || 'internet' },
              { type: 'text', text: dateStr },
            ],
          }],
        },
      }),
    });
    const d = await r.json();
    if (!r.ok) { console.error('❌ Meta template:', JSON.stringify(d).slice(0, 300)); return { ok: false }; }
    return { ok: true, wamid: d?.messages?.[0]?.id };
  } catch (e: any) { console.error('❌ sendTemplate:', e?.message); return { ok: false }; }
}

// Logs into whatsapp_messages (rendered preview text) so this shows up in the
// WABot Inbox like every other customer message, instead of being invisible there.
async function logOutbound(to: string, previewText: string, wamid?: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        manager_id: 'mahadnet', customer_phone: to.replace(/\D/g, '').slice(-10),
        direction: 'out', type: 'text', content: previewText, wa_message_id: wamid || null,
      }),
    });
  } catch (e: any) { console.error('[cron log]', e?.message); }
}

function previewMessage(name: string, plan: string, dateStr: string): string {
  return `Assalam o Alaikum *${name}*! ⚠️\n\nAap ka *${plan || 'internet'}* package *kal* (${dateStr}) expire ho raha hai.\n\nAbhi renew kar lein taake internet band na ho! Payment ke baad screenshot zaroor bhejein. 🙏`;
}

export default async function handler(req: any, res: any) {
  // ⏸ PAUSED 29 Jun 2026 — WA number disconnected from Cloud API pending Meta Business Verification. Remove this block to resume.
  if (true) return res.status(200).json({ paused: true, reason: 'whatsapp_number_disconnected' });
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
        if (days !== 1) continue; // single reminder: 1 day before expiry, sent at night

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        const key = `${row.manager_id}:${u.id}:${u.expiryDate}`;
        if (sentLog[key]) { skipped++; continue; }

        const dateStr = new Date(u.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
        const { ok, wamid } = await sendTemplate(phone, u.name || 'Customer', u.plan, dateStr);
        if (ok) {
          await logOutbound(phone, previewMessage(u.name || 'Customer', u.plan, dateStr), wamid);
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
