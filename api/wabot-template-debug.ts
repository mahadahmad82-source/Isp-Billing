// TEMP DEBUG — fetches the real approved template components from Meta so we can
// see the exact variable count/order. Remove this file once templates are fixed.
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid = process.env.PHONE_NUMBER_ID;
  try {
    const results: any = {};
    const tryFetch = async (key: string, url: string) => {
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        results[key] = await r.json();
      } catch (e: any) {
        results[key] = { fetchError: e?.message };
      }
    };
    await tryFetch('me_businesses', `https://graph.facebook.com/v20.0/me/businesses?access_token=${token}`);
    await tryFetch('phone_owner_business', `https://graph.facebook.com/v20.0/${pid}?fields=whatsapp_business_profile`);
    await tryFetch('conversation_analytics', `https://graph.facebook.com/v20.0/${pid}/whatsapp_business_account`);
    return res.status(200).json(results);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
