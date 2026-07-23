// TEMPORARY diagnostic endpoint — lists this WABA's approved templates with
// their exact language codes, to debug the (#132001) "does not exist in the
// translation" error on payment_success_official. Delete after use.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const wabaId = '996994173116575';
  try {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,language,status,category&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json();
    return res.status(200).json(d);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
