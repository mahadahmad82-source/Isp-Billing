export default async function handler(req: any, res: any) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(200).json({ error: 'GEMINI_API_KEY not set in Vercel env vars!' });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say: Ayesha test successful!' }] }],
        generationConfig: { maxOutputTokens: 50 },
      }),
    });
    const d = await r.json();
    return res.status(200).json({
      httpStatus: r.status,
      keyPresent: true,
      keyPrefix: key.slice(0, 8) + '...',
      response: d,
    });
  } catch (e: any) {
    return res.status(200).json({ error: e?.message });
  }
}
