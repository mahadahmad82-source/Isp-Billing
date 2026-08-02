// api/wabot-send.ts — Phase 3 Admin Inbox: sends a manual WhatsApp reply on
// mahadnet's behalf (text, image, voice note, video, or document), logs it, and
// auto-pauses Ayesha on that thread (so the bot doesn't collide with a human
// reply mid-conversation).
import { GoogleGenAI } from '@google/genai';
import * as lamejs from '@breezystack/lamejs';
// NOTE: synthesizeNonGemini is imported lazily inside handlePreviewVoice() below,
// NOT at top-level. A top-level import of lib/ttsProviders crashed this ENTIRE
// serverless function at module-load (ERR_MODULE_NOT_FOUND: /var/task/lib/ttsProviders),
// which took down text/image/audio/video/template sending too — not just the
// voice-preview feature that actually needed it. Lazy dynamic import isolates any
// future failure in that module to just the previewVoice azure/edge path.

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

// ── Caller verification (security fix) ──────────────────────────────────
// Previously this endpoint had ZERO auth — anyone with the URL could send
// arbitrary WhatsApp messages (including official Meta templates) on
// mahadnet's behalf. Now the caller must present either:
//  (a) an agent_sessions token (sub-manager, minted by find_sub_manager_login)
//      — checked against accessRights via the check_agent_permission RPC, or
//  (b) a real Supabase Auth JWT (manager/admin) — verified against GoTrue.
// A UUID-shaped bearer token is tried as (a) first since that's cheap and
// local (no network call needed to tell it apart from a JWT).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyCaller(req: any, action: 'view' | 'create'): Promise<{ ok: boolean; managerId?: string }> {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false };

  if (UUID_RE.test(token)) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_agent_permission`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token, p_module: 'wabot', p_action: action }),
      });
      const d = await r.json();
      if (d?.allowed) return { ok: true, managerId: d.manager_id };
    } catch (e: any) { console.error('[wabot-send auth: agent token]', e?.message); }
    return { ok: false };
  }

  // Not UUID-shaped — try as a real Supabase Auth JWT (manager/admin session).
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) return { ok: true }; // managerId trusted from request body, as before
  } catch (e: any) { console.error('[wabot-send auth: jwt]', e?.message); }
  return { ok: false };
}

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
    paramLabels: ['name', 'paymentAmount', 'package', 'remainingBalance', 'advancePaid', 'newExpiryDate', 'businessName'],
    bodyTemplate:
      '[Official] Asalam-o-Alaikum ap ki payment wusool ho gayi hai aur system mein update kar di gayi hai. Dear {{1}}, aap ka total payment PKR {{2}} kamyabi se record ho chuka hai.\n\nDetails:\n- Package: {{3}}\n- Remaining Balance: PKR {{4}}\n- Advance Paid: PKR {{5}}\n- New Expiry Date: {{6}}\n\nAap ki behtreen service hamari zimmedari hai. Regards, Team {{7}} shukriya.',
  },
};

function renderTemplateBody(bodyTemplate: string, params: string[]): string {
  return params.reduce((text, val, i) => text.split(`{{${i + 1}}}`).join(val ?? ''), bodyTemplate);
}

type SendType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'template';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Voice preview for WABot Settings (Agents & Voice tab) ──
  // Folded into this existing function (instead of a separate api/ file) to stay
  // under Vercel Hobby's serverless function count limit — adding a new file here
  // previously broke deployment (see git history), so new small endpoints reuse
  // an existing handler via an `action` discriminator instead of a new file.
  if (req.body?.action === 'previewVoice') {
    const authCheck = await verifyCaller(req, 'view');
    if (!authCheck.ok) return res.status(401).json({ error: 'Unauthorized' });
    return handlePreviewVoice(req, res);
  }

  const authCheck = await verifyCaller(req, 'create');
  if (!authCheck.ok) return res.status(401).json({ error: 'Unauthorized' });

  const { to, body, managerId: bodyManagerId, type, mediaUrl, caption, filename, templateName, templateParams } = req.body || {};
  // Agent-token callers are locked to the manager_id their token was minted for —
  // prevents a sub-manager token from being replayed against a different manager_id.
  const managerId = authCheck.managerId || bodyManagerId;
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
            parameters: (templateParams as string[]).map((v) => ({ type: 'text', text: (String(v ?? '').trim() || '-') })),
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

// ── Voice preview handler (called via action: 'previewVoice') ──
// Generates a short Gemini TTS sample for a given voice name so mahadnet can
// audition voices from WABot Settings before assigning one to an agent. Same
// model/encoding pipeline as the live textToSpeech() in api/webhook.ts.
const GEMINI_VALID_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome',
  'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux',
  'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]);

async function handlePreviewVoice(req: any, res: any) {
  try {
    const { voice, sampleText, provider, gender } = req.body || {};
    const effectiveGender: 'male' | 'female' = gender === 'male' ? 'male' : 'female';
    const defaultSample = effectiveGender === 'male'
      ? 'Assalam o Alaikum! Main aap ka customer support executive hoon. Aap ki kis tarah madad kar sakta hoon?'
      : 'Assalam o Alaikum! Main aap ki customer support executive hoon. Aap ki kis tarah madad kar sakti hoon?';
    const text = (sampleText && String(sampleText).trim()) || defaultSample;

    // Azure/edge-tts preview — bypasses the Gemini-only path below entirely.
    if (provider === 'azure' || provider === 'edge') {
      const { synthesizeNonGemini } = await import('../lib/ttsProviders');
      const result = await synthesizeNonGemini(text, provider, effectiveGender);
      if (!result) return res.status(502).json({ error: `${provider === 'azure' ? 'Azure' : 'Edge-TTS'} se audio generate nahi hua. Azure ke liye AZURE_SPEECH_KEY/AZURE_SPEECH_REGION set hain?` });
      const path = `tts-previews/${provider}-${effectiveGender}-${Date.now()}.mp3`;
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'max-age=604800' },
        body: result.buffer,
      });
      if (!upRes.ok) return res.status(502).json({ error: 'Upload failed', detail: await upRes.text() });
      return res.status(200).json({ url: `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}`, providerUsed: result.providerUsed, azureError: result.azureError });
    }

    if (!voice || !GEMINI_VALID_VOICES.has(voice)) {
      return res.status(400).json({ error: 'Invalid or missing voice name' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Garmjoshi aur tassali se, ek friendly Pakistani customer support agent ke andaaz mein Roman Urdu mein bolo: ${text}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    } as any);

    const inline: any = (response as any).candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const b64 = inline?.data;
    if (!b64) return res.status(502).json({ error: 'No audio returned from Gemini' });

    const pcm = Buffer.from(b64, 'base64');
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const encoder = new (lamejs as any).Mp3Encoder(1, 24000, 128);
    const blockSize = 1152;
    const mp3Chunks: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const buf = encoder.encodeBuffer(chunk);
      if (buf.length > 0) mp3Chunks.push(buf);
    }
    const tail = encoder.flush();
    if (tail.length > 0) mp3Chunks.push(tail);
    const mp3Buf = Buffer.concat(mp3Chunks.map((c) => Buffer.from(c)));

    const path = `tts-previews/${voice}-${Date.now()}.mp3`;
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'max-age=604800' },
      body: mp3Buf,
    });
    if (!upRes.ok) return res.status(502).json({ error: 'Upload failed', detail: await upRes.text() });

    return res.status(200).json({ url: `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}`, providerUsed: 'gemini' });
  } catch (e: any) {
    console.error('[wabot-send previewVoice]', e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}


