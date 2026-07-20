// api/meta-templates.ts — fetches this WABA's approved WhatsApp message
// templates directly from Meta's Graph API (name, language, status, and
// component structure with variable placeholders), so the exact approved
// wording/variable order is always used when sending — never guessed or
// hand-typed. Used by the Wabot BillCollector Android app's template picker.
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN!;
// This WABA (WhatsApp Business Account) ID is fixed for this account — see
// project notes. Resolving it dynamically from PHONE_NUMBER_ID via Graph API
// isn't reliably supported, so it's hardcoded here the same way other
// account-level constants are handled elsewhere in this codebase.
const WABA_ID = '996994173116575';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const tplRes = await fetch(
      `https://graph.facebook.com/v20.0/${WABA_ID}/message_templates?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const tplJson = await tplRes.json();
    if (!tplRes.ok) {
      return res.status(502).json({ error: 'Meta API error', detail: tplJson });
    }

    return res.status(200).json({ wabaId: WABA_ID, templates: tplJson.data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
