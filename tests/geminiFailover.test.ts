import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

type Behavior =
  | { type: 'ok'; result?: any }
  | { type: 'quota'; status?: number | string; message?: string }
  | { type: 'throw'; error: any };

interface Attempt {
  apiKey: string;
  model: string;
  contents: any;
}

const attempts: Attempt[] = [];
let behaviorQueue: Behavior[] = [];

class MockGoogleGenAI {
  apiKey: string;
  models: { generateContent: (opts: any) => Promise<any> };

  constructor({ apiKey }: { apiKey: string }) {
    this.apiKey = apiKey;
    const self = this;
    this.models = {
      generateContent: async (opts: any) => {
        attempts.push({ apiKey: self.apiKey, model: opts.model, contents: opts.contents });
        const behavior = behaviorQueue.shift() || {
          type: 'ok',
          result: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
        };
        if (behavior.type === 'quota') {
          const err: any = new Error(behavior.message ?? 'RESOURCE_EXHAUSTED: quota exceeded');
          if (behavior.status !== undefined) err.status = behavior.status;
          throw err;
        }
        if (behavior.type === 'throw') throw behavior.error;
        return behavior.result;
      },
    };
  }
}

mock.module('@google/genai', { namedExports: { GoogleGenAI: MockGoogleGenAI } });

const { callGeminiWithFailover, GEMINI_FALLBACK_MODELS } = await import('../lib/geminiFailover.ts');

beforeEach(() => {
  attempts.length = 0;
  behaviorQueue = [];
  delete process.env.GEMINI_API_KEY;
  delete process.env.API_KEY;
  for (let i = 1; i <= 10; i++) delete process.env[`GEMINI_API_KEY_${i}`];
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.API_KEY;
  for (let i = 1; i <= 10; i++) delete process.env[`GEMINI_API_KEY_${i}`];
});

test('fallback model chain matches the specified priority order', () => {
  assert.deepEqual(GEMINI_FALLBACK_MODELS, [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
  ]);
});

test('discovery: scans GEMINI_API_KEY, API_KEY, GEMINI_API_KEY_1..10 and dedupes', async () => {
  process.env.GEMINI_API_KEY = 'key-primary';
  process.env.API_KEY = 'key-generic';
  process.env.GEMINI_API_KEY_1 = 'key-primary';
  process.env.GEMINI_API_KEY_2 = 'key-secondary';
  process.env.GEMINI_API_KEY_3 = 'key-primary';
  process.env.GEMINI_API_KEY_10 = 'key-ten';
  process.env.GEMINI_API_KEY_11 = 'ignored-beyond-10';

  // every attempt quota except the very last one, so all discovered keys get used
  const totalAttempts = 4 * GEMINI_FALLBACK_MODELS.length; // 4 unique keys x 4 models
  for (let i = 0; i < totalAttempts - 1; i++) behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'ok', result: { candidates: [{ content: { parts: [{ text: 'done' }] } }] } });

  const res = await callGeminiWithFailover({ contents: 'hi' });
  assert.equal(res.candidates[0].content.parts[0].text, 'done');

  const keysUsed = new Set(attempts.map((a) => a.apiKey));
  assert.deepEqual(
    Array.from(keysUsed).sort(),
    ['key-generic', 'key-primary', 'key-secondary', 'key-ten']
  );
});

test('429 quota error hops keys then downgrades models until success', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  // key-1: all 4 models hit 429
  // key-2: gemini-2.0-flash hits 429, gemini-1.5-flash succeeds
  for (let i = 0; i < 4; i++) behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'ok', result: { candidates: [{ content: { parts: [{ text: 'from-model-2' }] } }] } });

  const res = await callGeminiWithFailover({ contents: 'hi' });
  assert.equal(res.candidates[0].content.parts[0].text, 'from-model-2');

  assert.deepEqual(
    attempts.map((a) => `${a.apiKey}:${a.model}`),
    [
      'key-1:gemini-2.0-flash',
      'key-1:gemini-1.5-flash',
      'key-1:gemini-1.5-flash-8b',
      'key-1:gemini-1.5-pro',
      'key-2:gemini-2.0-flash',
      'key-2:gemini-1.5-flash',
    ]
  );
});

test('RESOURCE_EXHAUSTED surfaced as string error.status is treated as quota', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  behaviorQueue.push({ type: 'quota', status: 'RESOURCE_EXHAUSTED', message: 'upstream rate limit' });
  behaviorQueue.push({ type: 'ok', result: { candidates: [{ content: { parts: [{ text: 'ok-2' }] } }] } });

  const res = await callGeminiWithFailover({ contents: 'hi' });
  assert.equal(res.candidates[0].content.parts[0].text, 'ok-2');
  // inner loop (models) is exhausted before the outer loop (keys) moves on
  assert.deepEqual(
    attempts.map((a) => `${a.apiKey}:${a.model}`),
    ['key-1:gemini-2.0-flash', 'key-1:gemini-1.5-flash']
  );
});

test('quota wording inside the message triggers fallback even without a status', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  behaviorQueue.push({ type: 'quota', message: 'Quota exceeded for this month on request 123' });
  behaviorQueue.push({ type: 'ok', result: { candidates: [{ content: { parts: [{ text: 'ok-2' }] } }] } });

  const res = await callGeminiWithFailover({ contents: 'hi' });
  assert.equal(res.candidates[0].content.parts[0].text, 'ok-2');
  assert.equal(attempts.length, 2);
});

test('non-quota errors throw immediately without trying other keys/models', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  const badRequest = Object.assign(new Error('400 invalid argument: malformed audio'), { status: 400 });
  behaviorQueue.push({ type: 'throw', error: badRequest });

  await assert.rejects(callGeminiWithFailover({ contents: 'hi' }), (e: any) => e.message.includes('400'));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].apiKey, 'key-1');
  assert.equal(attempts[0].model, 'gemini-2.0-flash');
});

test('corrupted/malformed payload aborts immediately, never looping across keys', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';
  process.env.GEMINI_API_KEY_3 = 'key-3';

  const invalid = new Error('INVALID_ARGUMENT: payload does not contain any audio content');
  behaviorQueue.push({ type: 'throw', error: invalid });

  await assert.rejects(callGeminiWithFailover({ contents: 'bad audio' }), /INVALID_ARGUMENT/);
  assert.equal(attempts.length, 1);
});

test('throws a clean structured error when every key/model permutation fails', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  for (let i = 0; i < 2 * GEMINI_FALLBACK_MODELS.length; i++) {
    behaviorQueue.push({ type: 'quota', status: 429 });
  }

  await assert.rejects(callGeminiWithFailover({ contents: 'hi' }), /All Gemini failover targets exhausted/);
  assert.equal(attempts.length, 2 * GEMINI_FALLBACK_MODELS.length);
});

test('throws a clear error when no API keys are configured', async () => {
  await assert.rejects(callGeminiWithFailover({ contents: 'hi' }), /No Gemini API keys found/);
  assert.equal(attempts.length, 0);
});

test('raw audio buffers and request contents stay immutable across retries', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  const original = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
  const snapshot = Buffer.from(original);
  const request = {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/ogg', data: original.toString('base64') } }] }],
    config: { temperature: 0 },
  };
  const contentsRef = request.contents;

  behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'ok', result: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });

  const res = await callGeminiWithFailover(request);
  assert.equal(res.candidates[0].content.parts[0].text, 'ok');

  // same contents object reference went out on both attempts — nothing was re-built/mutated
  assert.equal(attempts.length, 2);
  assert.ok(attempts[0].contents === contentsRef);
  assert.ok(attempts[1].contents === contentsRef);
  assert.equal(attempts[0].contents[0].parts[0].inlineData.data, original.toString('base64'));

  // raw buffer bytes untouched
  assert.deepEqual(original, snapshot);
  assert.equal(original.toString('base64'), snapshot.toString('base64'));
});

test('duplicate models in an override list are tried only once', async () => {
  process.env.GEMINI_API_KEY = 'key-1';
  process.env.GEMINI_API_KEY_2 = 'key-2';

  behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'quota', status: 429 });
  behaviorQueue.push({ type: 'ok', result: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });

  await callGeminiWithFailover({ contents: 'hi' }, ['gemini-1.5-flash', ...GEMINI_FALLBACK_MODELS]);

  assert.deepEqual(
    attempts.map((a) => `${a.apiKey}:${a.model}`),
    [
      'key-1:gemini-1.5-flash',
      'key-1:gemini-2.0-flash',
      'key-1:gemini-1.5-flash-8b',
      'key-1:gemini-1.5-pro',
    ]
  );
});
