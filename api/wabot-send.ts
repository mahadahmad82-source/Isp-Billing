// api/wabot-send.ts — Phase 3 Admin Inbox: sends a manual WhatsApp reply on
// mahadnet's behalf (text, image, voice note, video, or document), logs it, and
// auto-pauses Ayesha on that thread (so the bot doesn't collide with a human
// reply mid-conversation).
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

function normPhone(p: string): string {
  return (p || '').replace(/\D/g, '').slice(-10);
}

// The 4 Meta-approved official templates (Utility category). bodyTemplate
// mirrors the exact approved wording (from WhatsApp Manager) so the logged
// message shown in the inbox reads naturally instead of raw {{n}} tokens.
// paramLabels defines the required order — must match the approved
// template's variable order exactly, or Meta will reject the send.
const META_TEMPLATES: Record<string, { language: string; paramLabels: string[]; bodyTemplate: string }> = {
  customer_support_activation: {
    language: 'en',
    paramLabels: ['name', 'supportNumber'],
    bodyTemplate:
      'This is an official announcement regarding our customer support and network services. We have successfully integrated our network complaint registration, technical support, and billing updates for {{1}} on this official WhatsApp channel.\n\nYou can now use this active chat to report internet issues, check billing status, or get instant assistance. For urgent help call {{2}}. Thank you for your cooperation. Regards, Team MahadNet network support.',
  },
  recharge_pending_payment: {
    language: 'en',
    paramLabels: ['name', 'rechargeAmount', 'duesAmount', 'package'],
    bodyTemplate:
      'Important account update: Your internet package has been successfully recharged as requested.\n\nAssalam-o-Alaikum {{1}}, your {{4}} connection has been renewed on credit for PKR {{2}}.\n\nPlease clear your outstanding dues of PKR {{3}} as soon as possible to ensure uninterrupted high-speed internet service.\n\nTap the button below to view our official payment details. Thank you, Team MahadNet support.',
  },
  package_expiry_official: {
    language: 'en',
    paramLabels: ['name', 'expiryDate', 'package'],
    bodyTemplate:
      '[Alert] Internet service billing update aur expiry notification. Assalam-o-Alaikum {{1}}, aap ka internet package {{3}} {{2}} ko expire ho raha hai.\n\nWaqt par bill jama karwaein taake aap ki internet service bina kisi rukawat ke chalti rahe. Thank you, Team MahadNet regards.',
  },
  payment_success_official: {
    language: 'en',
    paramLabels: ['name', 'paymentAmount', 'package', 'remainingBalance', 'advancePaid', 'newExpiryDate', 'paymentMethod'],
    bodyTemplate:
      '[Official] Aap ki payment wusool ho gayi hai aur system mein update kar di gayi hai. Assalam-o-Alaikum {{1}}, aap ka total payment PKR {{2}} ({{7}}) kamyabi se record ho chuka hai.\n\nDetails:\n- Package: {{3}}\n- Remaining Balance: PKR {{4}}\n- Advance Paid: PKR {{5}}\n- New Expiry Date: {{6}}\n\nAap ki behtreen service hamari zimmedari hai. Regards, Team MahadNet shukriya.',
  },
};

function renderTemplateBody(bodyTemplate: string, params: string[]): string {
  return params.reduce((text, val, i) => text.split(`{{${i + 1}}}`).join(val ?? ''), bodyTemplate);
}

type SendType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'template';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { to, body, managerId, type, mediaUrl, caption, filename, templateName, templateParams } = req.body || {};
  const sendType: SendType = (type as SendType) || 'text';
  if (!to) return res.status(400).json({ error: 'to is required' });
  if (sendType === 'text' && !body) return res.status(400).json({ error: 'body is required for text' });
  if (sendType !== 'text' && sendType !== 'template' && !mediaUrl)
    return res.status(400).json({ error: 'mediaUrl is required for media messages' });
  if (sendType === 'template') {
    if (!templateName || !META_TEMPLATES[templateName]) {
      return res.status(400).json({ error: `Unknown or missing templateName. Valid: ${Object.keys(META_TEMPLATES).join(', ')}` });
    }
    const expected = META_TEMPLATES[templateName].paramLabels.length;
    if (!Array.isArray(templateParams) || templateParams.length !== expected) {
      return res.status(400).json({ error: `templateParams must be an array of ${expected} values for ${templateName}` });
    }
  }

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
  } else if (sendType === 'document') {
    payload = { messaging_product: 'whatsapp', to, type: 'document', document: { link: mediaUrl, ...(filename ? { filename } : {}), ...(caption ? { caption } : {}) } };
  } else {
    const tpl = META_TEMPLATES[templateName];
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: tpl.language },
        components: [
          {
            type: 'body',
            parameters: (templateParams as string[]).map((v) => ({ type: 'text', text: String(v) })),
          },
        ],
      },
    };
  }

  let wamid: string | undefined;
  try {
    let r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let d = await r.json();

    // Meta template language codes are locale-specific (e.g. "en_US"), not just the
    // generic "en" we store in META_TEMPLATES. If a template was approved under a
    // different English locale than what we sent, Meta returns error 132001
    // ("template name does not exist in the translation") — this was the exact,
    // 100%-reproducible reason payment_success_official auto-sends were silently
    // failing on every attempt. Auto-retry with the other common English locale
    // codes instead of giving up, so this self-heals regardless of which exact
    // code the template is actually approved under.
    if (!r.ok && sendType === 'template' && d?.error?.code === 132001) {
      const tried = new Set([payload.template.language.code]);
      const fallbacks = ['en_US', 'en_GB', 'en'].filter((l) => !tried.has(l));
      for (const lang of fallbacks) {
        payload.template.language.code = lang;
        r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        d = await r.json();
        if (r.ok) {
          console.log(`✅ wabot-send: template ${templateName} sent using fallback language "${lang}"`);
          break;
        }
      }
    }

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
  const logType = sendType === 'template' ? 'text' : sendType === 'document' ? 'document' : sendType;
  const logContent =
    sendType === 'template'
      ? renderTemplateBody(META_TEMPLATES[templateName].bodyTemplate, templateParams as string[])
      : sendType === 'text'
      ? body
      : caption || mediaUrl;

  // Log the outbound message for the inbox thread.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        manager_id: mgr, customer_phone: phone, direction: 'out', type: logType,
        content: logContent, media_url: sendType === 'text' || sendType === 'template' ? null : mediaUrl,
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
