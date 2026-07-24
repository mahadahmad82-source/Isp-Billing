// TEMPORARY diagnostic endpoint — sends a real test push via Expo's push API
// to the currently registered token, and returns Expo's raw response so we can
// see the actual delivery error (FCM credential issue, DeviceNotRegistered, etc).
// Delete after use.
export default async function handler(req: any, res: any) {
  try {
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'ExponentPushToken[qysnu3OYwawXpAlYR4QJVx]',
        title: 'Diagnostic Test',
        body: 'If you see this, push delivery works.',
        sound: 'default',
      }),
    });
    const d = await r.json();
    return res.status(200).json({ httpStatus: r.status, response: d });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
