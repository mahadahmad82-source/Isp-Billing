// TEMP DEBUG — fetches the real approved template components from Meta so we can
// see the exact variable count/order. Remove this file once templates are fixed.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  try {
    const dbgRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${token}&access_token=${token}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dbgData = await dbgRes.json();
    return res.status(200).json({ dbgData });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
