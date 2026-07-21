// TEMP DEBUG — fetches the real approved template components from Meta so we can
// see the exact variable count/order. Remove this file once templates are fixed.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  try {
    const pidRes = await fetch(`https://graph.facebook.com/v20.0/${pid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pidData = await pidRes.json();
    return res.status(200).json({ pidData });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
