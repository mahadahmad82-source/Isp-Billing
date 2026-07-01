// api/wabot-send.ts — Phase 3 Admin Inbox: sends a manual WhatsApp reply on
// mahadnet's behalf (text, image, voice note, video, or document), logs it, and
// auto-pauses Ayesha on that thread (so the bot doesn't collide with a human
// reply mid-conversation).
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

function normPhone(p: string): string {
  return (p || '').replace(/\D/g, '').slice(-10);
}

type SendType = 'text' | 'image' | 'audio' | 'video' | 'document';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { to, body, managerId, type, mediaUrl, caption, filename } = req.body || {};
  const sendType: SendType = (type as SendType) || 'text';
  if (!to) return res.status(400).json({ error: 'to is required' });
  if (sendType === 'text' && !body) return res.status(400).json({ error: 'body is required for text' });
  if (sendType !== 'text' && !mediaUrl) return res.status(400).json({ error: 'mediaUrl is required for media messages' });

  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) return res.status(500).json({ error: 'WhatsApp env vars missing' });

  let payload: any;
  if (sendType === 'text') {
    payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
  } else if (sendType === 'image') {
    payload = { messaging_product: 'whatsapp', to, type: 'image', image: { link: mediaUrl, ...(caption ? { caption } : {}) } };
  } else if (sendType === 'audio') {
    payload = { messaging_product: 'whatsapp', to, type: 'audio', audio: { link: mediaUrl } };
  } else if (sendType === 'video') {
    payload = { messaging_product: 'whatsapp', to, type: 'video', video: { link: mediaUrl, ...(caption ? { caption } : {}) } };
  } else {
    payload = { messaging_product: 'whatsapp', to, type: 'document', document: { link: mediaUrl, ...(filename ? { filename } : {}), ...(caption ? { caption } : {}) } };
  }

  let wamid: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('❌ wabot-send Meta:', JSON.stringify(d).slice(0, 300));
      return res.status(502).json({ error: 'WhatsApp send failed', detail: d });
    }
    wamid = d?.messages?.[0]?.id;
  } catch (e: any) {
    console.error('❌ wabot-send fetch:', e?.message);
    return res.status(500).json({ error: e?.message });
  }

  const mgr = managerId || 'mahadnet';
  const phone = normPhone(to);
  const logType = sendType === 'document' ? 'document' : sendType;
  const logContent = sendType === 'text' ? body : (caption || mediaUrl);

  // Log the outbound message for the inbox thread.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        manager_id: mgr, customer_phone: phone, direction: 'out', type: logType,
        content: logContent, media_url: sendType === 'text' ? null : mediaUrl,
        wa_message_id: wamid || null,
      }),
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

  return res.status(200).json({ success: true, wamid });
}
