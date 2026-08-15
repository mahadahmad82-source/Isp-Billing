// lib/ttsProviders.ts
// Multi-provider TTS layer for the WABot voice pipeline (Ayesha + named agents).
//
// Gemini stays the DEFAULT (native Roman Urdu understanding — no script
// conversion needed, best quality). Azure and edge-tts are overflow providers
// for when an agent's Gemini TTS quota (free tier: 10 req/day on
// gemini-3.1-flash-tts-preview) is exhausted:
//   - 'edge'  → free, unlimited, no API key (unofficial MS Edge Read Aloud service)
//   - 'azure' → Azure Speech F0 free tier (500,000 neural chars/month, permanent
//               free) — needs AZURE_SPEECH_KEY + AZURE_SPEECH_REGION env vars from
//               mahadnet's own Azure account. Until those are set, synthesizeAzure()
//               safely returns null and callers fall through to 'edge'.
//
// IMPORTANT: unlike Gemini, both Azure's and edge-tts's ur-PK voices are built for
// real Urdu (Nastaliq) script, not Roman Urdu — feeding them Roman Urdu text
// mispronounces badly. So every non-Gemini call is transliterated (Groq) to Urdu
// script first. This is a SCRIPT conversion only, never a translation.
//
// gender ('male' | 'female') picks ur-PK-AsadNeural vs ur-PK-UzmaNeural here, and
// is also threaded into askGroq()'s system prompt (webhook.ts) so the reply TEXT
// itself uses correct Urdu grammatical gender — matching voice gender to word
// gender, not just audio.

import { EdgeTTS, Constants } from '@andresaya/edge-tts';

export type TtsProvider = 'gemini' | 'azure' | 'edge';
export type TtsGender = 'male' | 'female';

// Roman Urdu -> proper Urdu (Nastaliq) script, via Groq. Mirror of the existing
// transliterateToRoman() in webhook.ts but in reverse. SCRIPT conversion only —
// wording/meaning/order must stay exactly the same.
export async function transliterateRomanToUrdu(text: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key || !text) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // GPT-OSS 20B is Groq's supported low-latency replacement model.
        model: 'openai/gpt-oss-20b',
        messages: [{
          role: 'system',
          content: `Tum sirf ek script-transliteration tool ho — TRANSLATION nahi karte, sirf script (likhne ka tareeqa) badalte ho. Diya gaya Roman Urdu (Latin letters) text ko sahi Urdu (Nastaliq) script mein likho — alfaz, maani aur tarteeb EXACTLY wese hi rakho jese diye gaye hain. Agar beech mein koi English word ho to usay bhi Urdu script mein phonetically likho taake awaz sahi nikle.

SIRF Urdu script text return karo. Koi Roman version wapis mat likho, koi quote marks/explanation mat do — sirf ek plain Urdu script text, bas.

Example:
Input: Assalam o alaikum, aap ki internet service kaise chal rahi hai?
Output: السلام علیکم، آپ کی انٹرنیٹ سروس کیسے چل رہی ہے؟`,
        }, { role: 'user', content: text }],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });
    if (!res.ok) { console.error('[transliterateRomanToUrdu] groq', res.status, await res.text()); return null; }
    const data: any = await res.json();
    const out: string = data?.choices?.[0]?.message?.content?.trim() || '';
    return out || null;
  } catch (e: any) { console.error('[transliterateRomanToUrdu]', e?.message); return null; }
}

function edgeVoiceFor(gender: TtsGender): string {
  return gender === 'male' ? 'ur-PK-AsadNeural' : 'ur-PK-UzmaNeural';
}

// Free, unlimited, no API key — unofficial Microsoft Edge "Read Aloud" service
// (via @andresaya/edge-tts). Used both as the explicit 'edge' provider and as the
// automatic safety-net when 'azure' has no key configured yet or its call fails.
export async function synthesizeEdge(urduText: string, gender: TtsGender): Promise<Buffer | null> {
  if (!urduText) return null;
  try {
    const tts = new EdgeTTS();
    await tts.synthesize(urduText, edgeVoiceFor(gender), {
      outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    });
    return tts.toBuffer();
  } catch (e: any) { console.error('[synthesizeEdge]', e?.message); return null; }
}

// Azure Speech F0 free tier — returns a diagnostic `error` string (instead of
// silently returning null) when the key/region are missing or the call fails,
// so the UI can show mahadnet exactly why Azure didn't work instead of just
// silently sounding like it fell back to Edge-TTS.
export async function synthesizeAzure(urduText: string, gender: TtsGender): Promise<{ buffer: Buffer | null; error?: string }> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return { buffer: null, error: `Vercel env vars missing/not-deployed-yet: ${!key ? 'AZURE_SPEECH_KEY ' : ''}${!region ? 'AZURE_SPEECH_REGION' : ''}`.trim() };
  }
  if (!urduText) return { buffer: null, error: 'Empty text' };
  const voice = edgeVoiceFor(gender);
  const genderTag = gender === 'male' ? 'Male' : 'Female';
  const escaped = urduText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ssml = `<speak version='1.0' xml:lang='ur-PK'><voice xml:lang='ur-PK' xml:gender='${genderTag}' name='${voice}'>${escaped}</voice></speak>`;
  try {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'MYISP-WABot',
      },
      body: ssml,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      console.error('[synthesizeAzure]', res.status, bodyText);
      return { buffer: null, error: `Azure HTTP ${res.status} (region: ${region}) — ${bodyText.slice(0, 150) || 'no body'}` };
    }
    return { buffer: Buffer.from(await res.arrayBuffer()) };
  } catch (e: any) {
    console.error('[synthesizeAzure]', e?.message);
    return { buffer: null, error: `Network/fetch error: ${e?.message || 'unknown'}` };
  }
}

// Unified entry point for non-Gemini providers — does the Roman->Urdu
// transliteration + provider call + automatic edge-tts fallback so callers
// (webhook.ts's textToSpeech, wabot-send.ts's previewVoice) don't repeat this
// logic. Returns an MP3 Buffer + which provider actually produced it (+ the
// Azure failure reason, if Azure was requested but fell back to edge), or null
// if everything failed (caller gracefully falls back to a plain text reply).
export async function synthesizeNonGemini(
  romanText: string,
  provider: 'azure' | 'edge',
  gender: TtsGender
): Promise<{ buffer: Buffer; providerUsed: 'azure' | 'edge'; azureError?: string } | null> {
  const urduText = await transliterateRomanToUrdu(romanText);
  const textForTts = urduText || romanText; // if transliteration fails, still attempt with Roman text rather than giving up

  if (provider === 'azure') {
    const azureResult = await synthesizeAzure(textForTts, gender);
    if (azureResult.buffer) return { buffer: azureResult.buffer, providerUsed: 'azure' };
    const edgeBuf = await synthesizeEdge(textForTts, gender);
    if (edgeBuf) return { buffer: edgeBuf, providerUsed: 'edge', azureError: azureResult.error };
    return null;
  }

  const buf = await synthesizeEdge(textForTts, gender);
  return buf ? { buffer: buf, providerUsed: 'edge' } : null;
}
