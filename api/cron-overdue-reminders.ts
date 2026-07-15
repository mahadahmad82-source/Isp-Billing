// api/cron-overdue-reminders.ts — Overdue payment reminders (Phase 6 item)
// Triggered daily by Vercel Cron (see vercel.json). For any customer whose package has
// ALREADY expired (expiryDate < today) AND who still has a positive balance (dues), sends
// a WhatsApp reminder every 3 days, capped at 6 total. After the cap, stops automatically
// and raises a one-time "needs manual follow-up" notification instead — same guardrail
// pattern as cron-credit-recovery.ts.
//
// Fields live directly on manager_data.data.users[] (overdueLastReminderSent,
// overdueReminderCount) — same JSONB blob the app already dual-saves.

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser
const SUPPORT_NUMBER = '0304-2773453';
const REMINDER_GAP_DAYS = 3;
const MAX_REMINDERS = 6;

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

function overdueMessage(name: string, balance: number, expDate: string, reminderNumber: number): string {
  const dateStr = new Date(expDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
  if (reminderNumber === 1) {
    return `Assalam o Alaikum *${name}*! 😊\n\nAap ka package *${dateStr}* ko expire ho chuka hai aur *Rs. ${balance.toLocaleString()}* abhi tak pending hai.\n\nJaldi payment kar ke screenshot bhej dein taake internet dobara active rahe! 🙏\n\nKoi masla ho to call karein: *${SUPPORT_NUMBER}* 📞`;
  }
  return `Assalam o Alaikum *${name}*! 😊\n\nAap ka *Rs. ${balance.toLocaleString()}* ka balance abhi tak pending hai (expiry: ${dateStr}). Yaad dehani ke liye dobara message kar rahi hoon — jaldi clear kar dein taake service mutasir na ho. 🙏`;
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
    let cappedCount = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const data = row.data || {};
      const users: any[] = data.users || [];
      let changed = false;
      const newPendingNotifs: any[] = [];

      for (const u of users) {
        if (!u || u.status === 'deleted' || !u.expiryDate) continue;
        const bal = u.balance ?? 0;
        if (bal <= 0) continue; // no dues — nothing to remind about

        const exp = new Date(u.expiryDate);
        if (isNaN(exp.getTime())) continue;
        exp.setHours(0, 0, 0, 0);
        if (exp.getTime() >= today.getTime()) continue; // not yet expired — handled by cron-expiry-reminders instead

        const reminderCount: number = u.overdueReminderCount || 0;
        if (reminderCount >= MAX_REMINDERS) { skipped++; continue; }

        const lastSent = u.overdueLastReminderSent ? new Date(u.overdueLastReminderSent) : null;
        const daysSinceLast = lastSent ? (today.getTime() - lastSent.getTime()) / 86400000 : Infinity;
        if (daysSinceLast < REMINDER_GAP_DAYS) { skipped++; continue; }

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        const nextCount = reminderCount + 1;
        const ok = await sendText(phone, overdueMessage(u.name || 'Customer', bal, u.expiryDate, nextCount));
        if (!ok) continue;

        u.overdueReminderCount = nextCount;
        u.overdueLastReminderSent = today.toISOString();
        changed = true;
        sentCount++;

        if (nextCount >= MAX_REMINDERS) {
          cappedCount++;
          newPendingNotifs.push({
            id: `overdue-cap-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'SYSTEM',
            priority: 'MEDIUM',
            title: '🟡 Overdue Payment — Manual Follow-up Needed',
            message: `${u.name} (${u.phone}) ko ${MAX_REMINDERS} overdue reminders bheji ja chuki hain (Rs. ${bal}) — ab manual follow-up zaroori hai.`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (changed) {
        const updatedData = {
          ...data,
          users,
          pendingManagerNotifications: [...(data.pendingManagerNotifications || []), ...newPendingNotifs],
        };
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${row.manager_id}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: updatedData }),
        });
      }
    }

    console.log(`✅ Overdue reminders: sent=${sentCount} capped=${cappedCount} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sent: sentCount, capped: cappedCount, skipped });
  } catch (e: any) {
    console.error('[cron-overdue-reminders]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
