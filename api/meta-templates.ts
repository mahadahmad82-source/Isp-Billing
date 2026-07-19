// api/meta-templates.ts — fetches this WABA's approved WhatsApp message
// templates directly from Meta's Graph API (name, language, status, and
// component structure with variable placeholders), so the exact approved
// wording/variable order is always used when sending — never guessed or
// hand-typed. Used by the Wabot BillCollector Android app's template picker.
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN!;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID!;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // Resolve the WhatsApp Business Account ID from the phone number ID.
    const phoneRes = await fetch(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}?fields=whatsapp_business_account`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const phoneJson = await phoneRes.json();
    const wabaId = phoneJson?.whatsapp_business_account?.id;
    if (!wabaId) {
      return res.status(502).json({ error: 'Could not resolve WABA ID', detail: phoneJson });
    }

    const tplRes = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const tplJson = await tplRes.json();
    if (!tplRes.ok) {
      return res.status(502).json({ error: 'Meta API error', detail: tplJson });
    }

    return res.status(200).json({ wabaId, templates: tplJson.data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
