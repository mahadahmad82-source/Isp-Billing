
import { GoogleGenAI } from '@google/genai';

/**
 * Gemini models prioritized for failover.
 * Multimodal models supporting audio/image input.
 */
export const GEMINI_FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro'
] as const;

export type GeminiModel = typeof GEMINI_FALLBACK_MODELS[number] | 'gemini-3.5-flash' | 'gemini-3.5-flash-tts' | string;

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
 * Robust wrapper for Gemini API calls with nested failover logic.
 * Outer loop: API Keys
 * Inner loop: Models
 */
export async function callGeminiWithFailover(
  request: GeminiRequest,
  overrideModels?: GeminiModel[]
): Promise<any> {
  const keys = getApiKeys();
  const models = overrideModels || GEMINI_FALLBACK_MODELS;

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
        
        // Check for rate limit or quota exhaustion
        const isQuotaError = status === 429 || 
                             message.includes('RESOURCE_EXHAUSTED') || 
                             /quota/i.test(message);

        if (isQuotaError) {
          console.warn(`[WARN] Quota exhausted for model ${model} on key ${maskedKey}. Falling back...`);
          lastError = error;
          continue; 
        }

        // Non-quota errors (malformed request, invalid audio, etc.) throw immediately
        console.error(`[ERROR] Non-quota Gemini error (model=${model}):`, message);
        throw error;
      }
    }
  }

  throw new Error(`All Gemini failover targets exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}
