// api/test-wa.ts — diagnostic only, delete after testing
export default async function handler(req: any, res: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;

  if (!token || !pid) {
    return res.status(200).json({ error: 'Env vars missing', token: !!token, pid: !!pid });
  }

  // Step 1: Verify phone number ID is valid
  const phoneRes = await fetch(`https://graph.facebook.com/v20.0/${pid}?fields=display_phone_number,status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const phoneData = await phoneRes.json();

  // Step 2: Try sending a test message
  const testTo = req.query.to || '923042773453';
  const msgRes = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: testTo,
      type: 'text',
      text: { body: 'Ayesha Bot diagnostic test ✅' },
    }),
  });
  const msgData = await msgRes.json();

  return res.status(200).json({
    phoneNumberCheck: phoneData,
    sendAttempt: { status: msgRes.status, response: msgData },
    envPresent: { token: !!token, pid: pid?.slice(0,6) + '...' },
  });
}
