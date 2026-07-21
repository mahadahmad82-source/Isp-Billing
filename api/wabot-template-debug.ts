// TEMP DEBUG — fetches the real approved template components from Meta so we can
// see the exact variable count/order. Remove this file once templates are fixed.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  try {
    const pidRes = await fetch(`https://graph.facebook.com/v20.0/${pid}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pidData = await pidRes.json();
    const wabaId = pidData?.whatsapp_business_account?.id;
    if (!wabaId) return res.status(500).json({ error: 'Could not resolve WABA id', pidData });

    const r = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,components,language,status&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json();
    return res.status(200).json({ wabaId, templates: d });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
