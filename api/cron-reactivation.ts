// api/cron-reactivation.ts — Reactivation campaign for long-disconnected customers
// Triggered daily by Vercel Cron (see vercel.json). Targets customers whose package
// expired 90+ days ago (i.e. effectively disconnected) and offers a 10% discount to
// come back. Sent every 30 days, capped at 3 total — long-disconnected customers
// shouldn't be messaged forever. Customers flagged movedOut=true (physically moved
// out of coverage area — see types.ts) are excluded, since reactivating isn't possible
// for them.

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';
const SUPPORT_NUMBER = '0304-2773453';
const DISCONNECTED_DAYS_THRESHOLD = 90;
const REMINDER_GAP_DAYS = 30;
const MAX_REMINDERS = 3;

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

function reactivationMessage(name: string, plan: string): string {
  return `Assalam o Alaikum *${name}*! 😊\n\nHum aap ko miss kar rahe hain! Apna *${plan || 'internet'}* connection dobara activate karwayein aur agle bill par *10% discount* hasil karein. 🎉\n\nDobara connect hone ke liye reply karein ya call karein: *${SUPPORT_NUMBER}* 📞\n\n_Yeh messages nahi chahiye? Reply karein "STOP"._`;
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sentCount = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const data = row.data || {};
      const users: any[] = data.users || [];
      let changed = false;

      for (const u of users) {
        if (!u || u.status === 'deleted' || u.movedOut || u.optedOutOfMarketing || !u.expiryDate) continue;

        const exp = new Date(u.expiryDate);
        if (isNaN(exp.getTime())) continue;
        exp.setHours(0, 0, 0, 0);
        const daysSinceExpiry = Math.round((today.getTime() - exp.getTime()) / 86400000);
        if (daysSinceExpiry < DISCONNECTED_DAYS_THRESHOLD) continue;

        const reminderCount: number = u.reactivationReminderCount || 0;
        if (reminderCount >= MAX_REMINDERS) { skipped++; continue; }

        const lastSent = u.reactivationLastSent ? new Date(u.reactivationLastSent) : null;
        const daysSinceLast = lastSent ? (today.getTime() - lastSent.getTime()) / 86400000 : Infinity;
        if (daysSinceLast < REMINDER_GAP_DAYS) { skipped++; continue; }

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        const ok = await sendText(phone, reactivationMessage(u.name || 'Customer', u.plan));
        if (!ok) continue;

        u.reactivationReminderCount = reminderCount + 1;
        u.reactivationLastSent = today.toISOString();
        changed = true;
        sentCount++;
      }

      if (changed) {
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${row.manager_id}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: { ...data, users } }),
        });
      }
    }

    console.log(`✅ Reactivation campaign: sent=${sentCount} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sent: sentCount, skipped });
  } catch (e: any) {
    console.error('[cron-reactivation]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
