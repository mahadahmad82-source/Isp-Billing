// TEMP DEBUG — sends a live test template message so we can empirically determine
// the correct approved param count/order (Graph API template-read isn't available
// with the current token's asset permissions). Remove once templates are fixed.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  const src = req.method === 'GET' ? req.query : req.body || {};
  const templateName = src.templateName;
  const to = src.to || '923477136214';
  let paramList: string[] = [];
  try {
    paramList = typeof src.params === 'string' ? JSON.parse(src.params) : src.params || [];
  } catch {
    paramList = [];
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
          name: templateName,
          language: { code: 'en' },
          components: [{ type: 'body', parameters: paramList.map((v: string) => ({ type: 'text', text: v })) }],
        },
      }),
    });
    const d = await r.json();
    return res.status(r.ok ? 200 : 502).json(d);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
