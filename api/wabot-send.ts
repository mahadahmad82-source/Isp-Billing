// api/wabot-send.ts — Phase 3 Admin Inbox: sends a manual WhatsApp reply on
// mahadnet's behalf, logs it, and auto-pauses Ayesha on that thread (so the bot
// doesn't collide with a human reply mid-conversation).
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw';

function normPhone(p: string): string {
  return (p || '').replace(/\D/g, '').slice(-10);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { to, body, managerId } = req.body || {};
  if (!to || !body) return res.status(400).json({ error: 'to and body are required' });

  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) return res.status(500).json({ error: 'WhatsApp env vars missing' });

  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('❌ wabot-send Meta:', JSON.stringify(d).slice(0, 300));
      return res.status(502).json({ error: 'WhatsApp send failed', detail: d });
    }
  } catch (e: any) {
    console.error('❌ wabot-send fetch:', e?.message);
    return res.status(500).json({ error: e?.message });
  }

  const mgr = managerId || 'mahadnet';
  const phone = normPhone(to);

  // Log the outbound message for the inbox thread.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ manager_id: mgr, customer_phone: phone, direction: 'out', type: 'text', content: body }),
    });
  } catch (e: any) { console.error('[wabot-send log]', e?.message); }

  // Auto-pause Ayesha on this thread — a human just took over the conversation.
  try {
    const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.${mgr}&select=paused_phones`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await cfgRes.json();
    const current: string[] = rows?.[0]?.paused_phones || [];
    if (!current.includes(phone)) {
      await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.${mgr}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ paused_phones: [...current, phone] }),
      });
    }
  } catch (e: any) { console.error('[wabot-send autopause]', e?.message); }

  return res.status(200).json({ success: true });
}
