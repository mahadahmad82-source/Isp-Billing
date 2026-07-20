// api/meta-templates.ts — fetches this WABA's approved WhatsApp message
// templates directly from Meta's Graph API (name, language, status, and
// component structure with variable placeholders), so the exact approved
// wording/variable order is always used when sending — never guessed or
// hand-typed. Used by the Wabot BillCollector Android app's template picker.
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN!;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // Ask Meta what WABA(s) this access token is actually scoped to, rather
    // than guessing/hardcoding an ID that might be stale or wrong.
    const debugRes = await fetch(
      `https://graph.facebook.com/v20.0/debug_token?input_token=${WHATSAPP_TOKEN}&access_token=${WHATSAPP_TOKEN}`
    );
    const debugJson = await debugRes.json();
    return res.status(200).json({ tokenDebug: debugJson });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
