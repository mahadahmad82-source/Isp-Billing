// api/cron-credit-recovery.ts — Credit/advance recovery reminders (Phase 2 item 4)
// Triggered daily by Vercel Cron (see vercel.json). For any customer flagged
// creditRecharge=true on their UserRecord, sends a WhatsApp reminder every 2 days,
// capped at 6 total. After the cap, stops automatically and raises a one-time
// "needs manual follow-up" notification in the manager's dashboard instead.
//
// Fields live directly on manager_data.data.users[] (creditRecharge, creditAmount,
// creditDate, creditLastReminderSent, creditReminderCount) — same JSONB blob the
// app already dual-saves, so this PATCHes that row directly (same pattern already
// used by webhook.ts for complaintTickets/leads/notifications).

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser
const SUPPORT_NUMBER = '0304-2773453';
const REMINDER_GAP_DAYS = 2;
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

function recoveryMessage(name: string, amount: number, reminderNumber: number): string {
  const amt = amount ? `Rs. ${amount.toLocaleString()}` : 'aap ka credit';
  if (reminderNumber === 1) {
    return `Assalam o Alaikum *${name}*! 😊\n\nAap ke account mein *${amt}* ka credit pending hai. Jab convenient ho, payment kar ke screenshot bhej dein. 🙏\n\nKoi masla ho to call karein: *${SUPPORT_NUMBER}* 📞`;
  }
  return `Assalam o Alaikum *${name}*! 😊\n\nAap ke pending *${amt}* credit ke baray mein dobara yaad dehani — jab payment ho jaye, screenshot zaroor bhej dein. 🙏`;
}

export default async function handler(req: any, res: any) {
  // ⏸ PAUSED 29 Jun 2026 — WA number disconnected from Cloud API pending Meta Business Verification. Remove this block to resume.
  if (true) return res.status(200).json({ paused: true, reason: 'whatsapp_number_disconnected' });
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
        if (!u || u.status === 'deleted' || !u.creditRecharge) continue;

        const reminderCount: number = u.creditReminderCount || 0;
        if (reminderCount >= MAX_REMINDERS) { skipped++; continue; }

        const lastSent = u.creditLastReminderSent ? new Date(u.creditLastReminderSent) : null;
        const daysSinceLast = lastSent ? (today.getTime() - lastSent.getTime()) / 86400000 : Infinity;
        if (daysSinceLast < REMINDER_GAP_DAYS) { skipped++; continue; }

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) continue;
        const phone = `92${last10}`;

        const nextCount = reminderCount + 1;
        const ok = await sendText(phone, recoveryMessage(u.name || 'Customer', u.creditAmount, nextCount));
        if (!ok) continue;

        u.creditReminderCount = nextCount;
        u.creditLastReminderSent = today.toISOString();
        changed = true;
        sentCount++;

        if (nextCount >= MAX_REMINDERS) {
          cappedCount++;
          newPendingNotifs.push({
            id: `credit-cap-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'SYSTEM',
            priority: 'MEDIUM',
            title: '🟡 Credit Recovery — Manual Follow-up Needed',
            message: `${u.name} (${u.phone}) ko ${MAX_REMINDERS} reminders bheji ja chuki hain (Rs. ${u.creditAmount || 0}) — ab manual follow-up zaroori hai.`,
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

    console.log(`✅ Credit recovery reminders: sent=${sentCount} capped=${cappedCount} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sent: sentCount, capped: cappedCount, skipped });
  } catch (e: any) {
    console.error('[cron-credit-recovery]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
