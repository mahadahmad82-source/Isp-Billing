// api/webhook.ts — DEBUG VERSION (replies to everything)

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';

async function sendReply(to: string, message: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  console.log(`[ENV] TOKEN present: ${!!token} | PHONE_NUMBER_ID: "${phoneNumberId}"`);

  if (!token) { console.error('❌ WHATSAPP_TOKEN missing'); return; }
  if (!phoneNumberId) { console.error('❌ PHONE_NUMBER_ID missing'); return; }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  console.log(`[SEND] POST ${url} → to: ${to}`);

  try {
    const metaRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      console.error(`❌ Meta error ${metaRes.status}:`, JSON.stringify(metaData));
    } else {
      console.log(`✅ Sent! ID: ${metaData?.messages?.[0]?.id}`);
    }
  } catch (err: any) {
    console.error('❌ fetch exception:', err?.message);
  }
}

export default async function handler(req: any, res: any) {
  // GET — webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    console.log('[RAW BODY]', JSON.stringify(body).slice(0, 500));

    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses || [];

    console.log(`[COUNTS] messages: ${messages.length} | statuses: ${statuses.length}`);

    for (const msg of messages) {
      const from: string = msg.from;
      const msgType: string = msg.type;
      const text: string = msg?.text?.body || '(no text)';

      console.log(`[MSG] from=${from} type=${msgType} text="${text}"`);

      // Reply to everything right now for debugging
      await sendReply(from, `Walaikum Assalam! 😊 Main Ayesha hoon, MahadNet Support.\n\nAap ne likha: "${text}"\n\nHamara full bot jald available hoga! 🙏`);
    }
  } catch (err: any) {
    console.error('[ERROR]', err?.message || err);
  }

  return res.status(200).json({ status: 'ok' });
}
