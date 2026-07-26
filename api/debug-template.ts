// TEMP diagnostic endpoint — fetches live approved template defs from Meta so we can
// see the actual current param count/order. Will be deleted right after use.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const wabaId = '996994173116575';
  try {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,status,language,components&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json();
    return res.status(200).json(d);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
