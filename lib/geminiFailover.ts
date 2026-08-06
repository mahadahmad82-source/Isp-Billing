
import { GoogleGenAI } from '@google/genai';

/**
 * Gemini models prioritized for failover.
 * Multimodal models supporting audio/image input.
 */
// gemini-1.5-* family is retired (404 NOT_FOUND as of Aug 2026) -- do not
// reintroduce those model names here, they will hard-fail every call that
// reaches them in the fallback chain.
// gemini-2.5-flash is now also returning 404 NOT_FOUND ("no longer available
// to new users") for newly-created API keys as of Aug 2026 -- dropped from
// the default chain. Older keys that still have access can pass it in via
// overrideModels if needed.
export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.0-flash'
] as const;

export type GeminiModel = typeof GEMINI_FALLBACK_MODELS[number] | 'gemini-3.5-flash' | 'gemini-3.1-flash-tts-preview' | 'gemini-2.5-flash-preview-tts' | string;

export interface GeminiRequest {
  contents: any;
  config?: any;
  responseMimeType?: string;
}

/**
 * Retrieves all available Gemini API keys from environment variables.
 * Supports GEMINI_API_KEY and GEMINI_API_KEY_1 through GEMINI_API_KEY_10.
 */
function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.API_KEY) keys.push(process.env.API_KEY);
  
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key) keys.push(key);
  }
  
  // Return unique keys only
  return Array.from(new Set(keys));
}

/**
 * Classifies whether an error is worth retrying against the next
 * model/key, or is a fatal problem with the request itself (bad input)
 * that will fail identically no matter which key or model handles it.
 *
 * Retryable (continue failover): quota/rate-limit, model unavailable for
 * this key (404/NOT_FOUND), server overloaded (503/UNAVAILABLE), transient
 * server errors (500/INTERNAL), and permission issues tied to a specific
 * key (403/PERMISSION_DENIED) -- another key may well have access.
 *
 * Fatal (throw immediately): 400/INVALID_ARGUMENT -- malformed request
 * (e.g. corrupt audio/image, bad payload shape). Every key and model will
 * reject it the same way, so there's no point burning through the chain.
 */
function isRetryableError(error: any): boolean {
  const status = error?.status || error?.response?.status;
  const statusText = String(status ?? '');
  const message = error?.message || '';

  const isFatal = status === 400 ||
                   statusText === 'INVALID_ARGUMENT' ||
                   /invalid[_ ]argument/i.test(message);

  return !isFatal;
}

/**
 * Robust wrapper for Gemini API calls with nested failover logic.
 * Outer loop: API Keys
 * Inner loop: Models
 */
export async function callGeminiWithFailover(
  request: GeminiRequest,
  overrideModels?: GeminiModel[]
): Promise<any> {
  const keys = getApiKeys();
  // Dedupe while preserving order — some callers prepend an override model that is
  // already in GEMINI_FALLBACK_MODELS (e.g. ['gemini-1.5-flash', ...GEMINI_FALLBACK_MODELS]),
  // which used to make the engine try the same model twice per key.
  const models = Array.from(new Set(overrideModels || GEMINI_FALLBACK_MODELS));

  if (keys.length === 0) {
    throw new Error('No Gemini API keys found. Please set GEMINI_API_KEY or GEMINI_API_KEY_N.');
  }

  let lastError: any = null;

  for (const key of keys) {
    const maskedKey = `...${key.slice(-4)}`;
    
    for (const model of models) {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        
        // Use the model to generate content
        // Note: The request object is spread to ensure we don't mutate the original
        const response = await ai.models.generateContent({
          model,
          ...request,
        });

        console.log(`[INFO] Gemini success: model=${model}, key=${maskedKey}`);
        return response;
      } catch (error: any) {
        const status = error?.status || error?.response?.status;
        const message = error?.message || '';
        
        // Check for rate limit or quota exhaustion. The Google GenAI SDK surfaces
        // this as a numeric HTTP 429 (Stainless RateLimitError) and/or the gRPC
        // status string 'RESOURCE_EXHAUSTED' on ApiError — accept both forms plus
        // any quota-wording in the message itself.
        const statusText = String(status ?? '');
        const isQuotaError = status === 429 ||
                             statusText === 'RESOURCE_EXHAUSTED' ||
                             message.includes('RESOURCE_EXHAUSTED') ||
                             /quota/i.test(message);

        if (isQuotaError) {
          console.warn(`[WARN] Quota exhausted for model ${model} on key ${maskedKey}. Falling back...`);
          lastError = error;
          continue;
        }

        // Non-quota errors: only abort the entire chain for genuinely fatal,
        // request-is-bad errors (400/INVALID_ARGUMENT). Everything else
        // (model unavailable for this key, server overload, transient 5xx,
        // per-key permission issues) is worth retrying on the next
        // model/key — a different key or model may well succeed.
        if (isRetryableError(error)) {
          console.warn(`[WARN] Non-fatal Gemini error (model=${model}, key=${maskedKey}): ${message}. Falling back...`);
          lastError = error;
          continue;
        }

        console.error(`[ERROR] Fatal Gemini error (model=${model}):`, message);
        throw error;
      }
    }
  }

  throw new Error(`All Gemini failover targets exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}
