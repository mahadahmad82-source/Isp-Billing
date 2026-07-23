// TEMPORARY diagnostic endpoint — lists this WABA's approved templates with
// their exact language codes, to debug the (#132001) "does not exist in the
// translation" error on payment_success_official. Delete after use.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  const out: any = {};
  try {
    const permsRes = await fetch(
      `https://graph.facebook.com/v20.0/debug_token?input_token=${token}&access_token=${token}`
    );
    out.tokenDebug = await permsRes.json();
  } catch (e: any) { out.tokenDebugError = e?.message; }

  try {
    const phoneRes = await fetch(
      `https://graph.facebook.com/v20.0/${pid}?fields=whatsapp_business_account,display_phone_number`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    out.phoneInfo = await phoneRes.json();
    const wabaId = out.phoneInfo?.whatsapp_business_account?.id;
    if (wabaId) {
      const tplRes = await fetch(
        `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,language,status,category&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      out.templates = await tplRes.json();
    }
  } catch (e: any) { out.phoneInfoError = e?.message; }

  return res.status(200).json(out);
}
