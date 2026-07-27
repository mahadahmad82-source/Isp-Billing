// api/wabot-tts-preview.ts — generates a short sample audio clip for a given
// Gemini TTS voice name, so mahadnet can preview/pick a voice from WABot Settings
// before assigning it to an agent. Mirrors the textToSpeech() encoding pipeline in
// api/webhook.ts (same model, same PCM→MP3 path) but is self-contained so the
// Settings UI can call it directly without touching the webhook handler.

import { GoogleGenAI } from '@google/genai';
import * as lamejs from '@breezystack/lamejs';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VALID_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome',
  'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux',
  'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { voice, sampleText } = req.body || {};
    if (!voice || !VALID_VOICES.has(voice)) {
      return res.status(400).json({ error: 'Invalid or missing voice name' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

    const text = (sampleText && String(sampleText).trim()) ||
      'Assalam o Alaikum! Main aap ki customer support executive hoon. Aap ki kis tarah madad kar sakti hoon?';

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Garmjoshi aur tassali se, ek friendly Pakistani customer support agent ke andaaz mein Roman Urdu mein bolo: ${text}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    } as any);

    const inline: any = (response as any).candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const b64 = inline?.data;
    if (!b64) return res.status(502).json({ error: 'No audio returned from Gemini' });

    const pcm = Buffer.from(b64, 'base64'); // raw 16-bit PCM, mono, 24kHz
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const encoder = new (lamejs as any).Mp3Encoder(1, 24000, 128);
    const blockSize = 1152;
    const mp3Chunks: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const buf = encoder.encodeBuffer(chunk);
      if (buf.length > 0) mp3Chunks.push(buf);
    }
    const tail = encoder.flush();
    if (tail.length > 0) mp3Chunks.push(tail);
    const mp3Buf = Buffer.concat(mp3Chunks.map((c) => Buffer.from(c)));

    // Previews are short-lived — stored under a dedicated prefix so they're easy to
    // distinguish from real reply audio and safe to bulk-delete later if needed.
    const path = `tts-previews/${voice}-${Date.now()}.mp3`;
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'audio/mpeg' },
      body: mp3Buf,
    });
    if (!upRes.ok) return res.status(502).json({ error: 'Upload failed', detail: await upRes.text() });

    return res.status(200).json({ url: `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}` });
  } catch (e: any) {
    console.error('[wabot-tts-preview]', e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
