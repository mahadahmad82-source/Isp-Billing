// api/whatsapp.ts — Vercel Serverless Function
// Sends WhatsApp template messages via Meta Cloud API

export default async function handler(req: any, res: any) {
  // Allow CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { toNumber, templateName = 'hello_world', languageCode = 'en_US' } = req.body;

  if (!toNumber) {
    return res.status(400).json({ error: 'toNumber is required' });
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error('WhatsApp credentials missing from environment variables');
    return res.status(500).json({
      error: 'WhatsApp not configured. Set WHATSAPP_TOKEN and PHONE_NUMBER_ID in Vercel dashboard.',
    });
  }

  // Clean the number: remove spaces, dashes, plus signs → pure digits with country code
  const cleanNumber = toNumber.replace(/[\s\-\(\)\+]/g, '');

  const metaApiUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: cleanNumber,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  try {
    const response = await fetch(metaApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API Error Response:', JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: 'Meta API returned an error',
        details: data?.error || data,
      });
    }

    console.log('WhatsApp message sent successfully:', data);
    return res.status(200).json({
      success: true,
      messageId: data?.messages?.[0]?.id,
      to: cleanNumber,
      template: templateName,
    });
  } catch (err: any) {
    console.error('WhatsApp send exception:', err?.message || err);
    return res.status(500).json({
      error: 'Internal server error while sending WhatsApp message',
      message: err?.message || 'Unknown error',
    });
  }
}
