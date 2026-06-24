// api/cron-expiry-hour-reminders.ts — Hour-level expiry reminders (6h-before, 1h-before
// midnight, and just-expired). Expiry is treated as happening at midnight (00:00) of
// expiryDate (confirmed with Mahad). Vercel Cron on this plan only fires once a day, so
// this endpoint is instead triggered HOURLY by a Supabase pg_cron job (net.http_post),
// the same pattern already used for the `daily-backup` Edge Function. This file is a
// plain Vercel API route — it is intentionally NOT registered in vercel.json's `crons`
// array, so it doesn't count against the Vercel plan's cron-job limit.
//
// Each user gets at most one 6h ping, one 1h ping, and one just-expired ping PER expiry
// cycle — tracked via expiry6hNotifiedFor/expiry1hNotifiedFor/expiryJustNotifiedFor on
// the user record (stores the expiryDate value the ping was already sent for, so the
// next renewal/expiryDate change naturally re-arms all three).

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

function sixHourMessage(name: string, plan: string): string {
  return `Assalam o Alaikum *${name}*! ⚠️\n\nAap ka *${plan || 'internet'}* package aaj raat *12 baje* (6 ghante mein) expire hone wala hai.\n\nAbhi renew kar lein taake internet bila wuqfa continue rahe! 🙏`;
}
function oneHourMessage(name: string, plan: string): string {
  return `Assalam o Alaikum *${name}*! 🔴\n\nAap ka *${plan || 'internet'}* package sirf *1 ghante* mein (raat 12 baje) expire ho jayega!\n\nForan renew kar lein, internet band hone se bachne ke liye. Koi madad chahiye to call karein: *${SUPPORT_NUMBER}* 📞`;
}
function justExpiredMessage(name: string, plan: string): string {
  return `Assalam o Alaikum *${name}*! 🔴\n\nAap ka *${plan || 'internet'}* package expire ho gaya hai.\n\nInternet dobara active karne ke liye foran renew kar lein! Payment ke baad screenshot zaroor bhejein. Koi madad chahiye to call karein: *${SUPPORT_NUMBER}* 📞`;
}

export default async function handler(req: any, res: any) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await resp.json();

    const now = new Date();
    let sent6h = 0, sent1h = 0, sentExpired = 0, skipped = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const data = row.data || {};
      const users: any[] = data.users || [];
      let changed = false;

      for (const u of users) {
        if (!u || u.status === 'deleted' || !u.expiryDate) continue;

        // Expiry moment = midnight (00:00) Pakistan Time on expiryDate's calendar date.
        // BUG FIX: previously this used new Date(u.expiryDate).setHours(0,0,0,0), which
        // sets midnight in the SERVER's timezone (UTC on Vercel) — i.e. 5am Pakistan
        // Time, not real PKT midnight. That threw every reminder ~5 hours off schedule.
        const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(u.expiryDate));
        if (!dm) continue;
        const [, y, mo, d] = dm;
        const expiryMomentMs = Date.UTC(+y, +mo - 1, +d, 0, 0, 0) - PKT_OFFSET_MS;

        const hoursUntilExpiry = (expiryMomentMs - now.getTime()) / 3600000;
        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        // 6-hour-before window (5.5h–6.5h before midnight)
        if (hoursUntilExpiry >= 5.5 && hoursUntilExpiry <= 6.5 && u.expiry6hNotifiedFor !== u.expiryDate) {
          const ok = await sendText(phone, sixHourMessage(u.name || 'Customer', u.plan));
          if (ok) { u.expiry6hNotifiedFor = u.expiryDate; changed = true; sent6h++; }
          continue;
        }

        // 1-hour-before window (0.5h–1.5h before midnight)
        if (hoursUntilExpiry >= 0.5 && hoursUntilExpiry <= 1.5 && u.expiry1hNotifiedFor !== u.expiryDate) {
          const ok = await sendText(phone, oneHourMessage(u.name || 'Customer', u.plan));
          if (ok) { u.expiry1hNotifiedFor = u.expiryDate; changed = true; sent1h++; }
          continue;
        }

        // Just-expired window (0h–1h AFTER midnight has passed)
        if (hoursUntilExpiry <= 0 && hoursUntilExpiry >= -1 && u.expiryJustNotifiedFor !== u.expiryDate) {
          const ok = await sendText(phone, justExpiredMessage(u.name || 'Customer', u.plan));
          if (ok) { u.expiryJustNotifiedFor = u.expiryDate; changed = true; sentExpired++; }
          continue;
        }

        skipped++;
      }

      if (changed) {
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${row.manager_id}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: { ...data, users } }),
        });
      }
    }

    console.log(`✅ Expiry hour reminders: 6h=${sent6h} 1h=${sent1h} expired=${sentExpired} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sent6h, sent1h, sentExpired, skipped });
  } catch (e: any) {
    console.error('[cron-expiry-hour-reminders]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
