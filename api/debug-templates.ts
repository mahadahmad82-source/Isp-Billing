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
      `https://graph.facebook.com/v20.0/${pid}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    out.phoneInfo = await phoneRes.json();
  } catch (e: any) { out.phoneInfoError = e?.message; }

  try {
    const bizRes = await fetch(
      `https://graph.facebook.com/v20.0/me/businesses`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    out.businesses = await bizRes.json();
    const businessId = out.businesses?.data?.[0]?.id;
    if (businessId) {
      const wabaListRes = await fetch(
        `https://graph.facebook.com/v20.0/${businessId}/owned_whatsapp_business_accounts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      out.wabaList = await wabaListRes.json();
    }
    const wabaId = out.wabaList?.data?.[0]?.id;
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
