// TEMPORARY diagnostic endpoint — to be deleted once the TTS issue is root-caused.
export default async function handler(req: any, res: any) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  if (!key) return res.status(200).json({ ok: false, reason: 'ELEVENLABS_API_KEY not set in this environment' });

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: 'Assalam o Alaikum, yeh ek test hai.',
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    const contentType = r.headers.get('content-type') || '';
    let bodyPreview: string;
    if (contentType.includes('audio')) {
      const buf = Buffer.from(await r.arrayBuffer());
      bodyPreview = `<binary audio, ${buf.length} bytes>`;
    } else {
      bodyPreview = (await r.text()).slice(0, 1000);
    }
    return res.status(200).json({
      ok: r.ok, status: r.status, statusText: r.statusText, contentType, bodyPreview,
      keyPrefix: key.slice(0, 6), keyLength: key.length, voiceId,
    });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: e?.message });
  }
}
