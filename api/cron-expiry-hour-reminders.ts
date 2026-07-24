// api/cron-expiry-hour-reminders.ts — Fires the Meta-approved "Package Expiry Notice"
// (package_expiry_official) template automatically the moment a customer's package
// actually expires, so nobody has to notice/remember to tell them — Ayesha does it on
// her own. Runs hourly via a Supabase pg_cron job (net.http_post) that's already
// active; not registered in vercel.json's `crons` array so it doesn't count against
// the Vercel plan's cron-job limit.
//
// RE-ENABLED — this was previously paused entirely because it only had a free-form
// text send, which only works inside the 24h WhatsApp session window. Now uses the
// approved Utility template instead, which works regardless of session window.
// Each user gets at most one "just expired" ping per expiry cycle, tracked via
// expiryJustNotifiedFor on the user record (stores the expiryDate the ping was
// already sent for, so the next renewal naturally re-arms it for the following cycle).

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

// 🔒 This Meta WhatsApp number (03042773453) is strictly bound to the mahadnet manager account only — it must NEVER send to other managers' customers. When another manager needs WABot service, they get their own WhatsApp Business number (Phase 5 multi-tenant routing), not this one.
const BOUND_MANAGER_ID = 'mahadnet';
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Pakistan Standard Time = UTC+5, no DST
const TEMPLATE_NAME = 'package_expiry_official';
const TEMPLATE_LANG = 'en';

async function sendExpiryTemplate(to: string, name: string, dateStr: string, packageName: string): Promise<{ ok: boolean; wamid?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) {
    console.error('❌ WHATSAPP_TOKEN / PHONE_NUMBER_ID missing');
    return { ok: false };
  }
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
          components: [{ type: 'body', parameters: [{ type: 'text', text: name }, { type: 'text', text: dateStr }, { type: 'text', text: packageName }] }],
        },
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('❌ Meta template send failed:', JSON.stringify(d).slice(0, 300));
      return { ok: false };
    }
    return { ok: true, wamid: d?.messages?.[0]?.id };
  } catch (e: any) {
    console.error('❌ sendExpiryTemplate:', e?.message);
    return { ok: false };
  }
}

async function logOutbound(to: string, previewText: string, wamid?: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        manager_id: 'mahadnet',
        customer_phone: to.replace(/\D/g, '').slice(-10),
        direction: 'out',
        type: 'text',
        content: previewText,
        wa_message_id: wamid || null,
      }),
    });
  } catch (e: any) {
    console.error('[cron-expiry-hour-reminders] log failed:', e?.message);
  }
}

function previewMessage(name: string, dateStr: string): string {
  return `[Alert] Internet service billing update aur expiry notification. Assalam-o-Alaikum ${name}, aap ka internet package ${dateStr} ko expire ho raha hai.\n\nWaqt par bill jama karwaein taake aap ki internet service bina kisi rukawat ke chalti rahe. Thank you, Team MahadNet regards.`;
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

    const now = new Date();
    let sentExpired = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      if (row.manager_id !== BOUND_MANAGER_ID) continue;
      const data = row.data || {};
      const users: any[] = data.users || [];
      let changed = false;

      for (const u of users) {
        if (!u || u.status === 'deleted' || !u.expiryDate) continue;

        // Expiry moment = midnight (00:00) Pakistan Time on expiryDate's calendar date.
        const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(u.expiryDate));
        if (!dm) continue;
        const [, y, mo, d] = dm;
        const expiryMomentMs = Date.UTC(+y, +mo - 1, +d, 0, 0, 0) - PKT_OFFSET_MS;
        const hoursSinceExpiry = (now.getTime() - expiryMomentMs) / 3600000;

        const digits = (u.phone || u.phone2 || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length < 10) {
          skipped++;
          continue;
        }
        const phone = `92${last10}`;

        // Just-expired window (0h–1h AFTER midnight has passed) — one ping per cycle.
        if (hoursSinceExpiry >= 0 && hoursSinceExpiry <= 1 && u.expiryJustNotifiedFor !== u.expiryDate) {
          const dateStr = new Date(u.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
          const { ok, wamid } = await sendExpiryTemplate(phone, u.name || 'Customer', dateStr, u.plan || '');
          if (ok) {
            u.expiryJustNotifiedFor = u.expiryDate;
            changed = true;
            sentExpired++;
            await logOutbound(phone, previewMessage(u.name || 'Customer', dateStr), wamid);
          }
        } else {
          skipped++;
        }
      }

      if (changed) {
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${row.manager_id}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: { ...data, users } }),
        });
      }
    }

    console.log(`✅ Just-expired template reminders: sent=${sentExpired} skipped=${skipped}`);
    return res.status(200).json({ status: 'ok', sentExpired, skipped });
  } catch (e: any) {
    console.error('[cron-expiry-hour-reminders]', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
