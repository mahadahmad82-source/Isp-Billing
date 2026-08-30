// lib/r2.ts — Cloudflare R2 (S3-compatible) media storage.
//
// Replaces Supabase Storage for WhatsApp media (voice notes, payment-proof
// images, TTS replies). R2 has zero egress fees regardless of volume, unlike
// Supabase's 5GB/month egress cap (Fair Use Policy → 402s once crossed).
// Media was measured as ~99% of Supabase Storage egress before this change —
// see PROJECT_KNOWLEDGE.md for the investigation.
//
// Uses aws4fetch (a few KB, no SDK bloat) to sign a plain S3 PUT request —
// R2 is fully S3 API-compatible so no R2-specific client is needed.
import { AwsClient } from 'aws4fetch';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'mahadnet-whatsapp-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
// Prefer an explicit full endpoint (R2_ENDPOINT — copy-pasted verbatim from the
// R2 bucket's "S3 API" field) over reconstructing it from R2_ACCOUNT_ID, since
// a truncated/mis-extracted account ID silently produces a malformed hostname
// that fails DNS resolution ("fetch failed") with no useful error otherwise.
const R2_ENDPOINT = (process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');

// The value copied from Cloudflare's per-bucket "S3 API" field is itself
// already bucket-scoped (ends with /<bucket-name>) — appending the bucket
// name again would double it up in the path and silently write/read the
// wrong object key. Detect and handle both forms so this can't happen again
// regardless of which form ends up in R2_ENDPOINT.
function bucketBaseUrl(): string {
  if (!R2_ENDPOINT) return '';
  const suffix = `/${R2_BUCKET_NAME}`;
  return R2_ENDPOINT.endsWith(suffix) ? R2_ENDPOINT : `${R2_ENDPOINT}${suffix}`;
}
const r2Client =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new AwsClient({
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      })
    : null;

// Uploads a buffer to the R2 bucket and returns its public URL, or null on
// any failure/misconfiguration. Callers must fall back gracefully (e.g. to a
// text-only reply) — a storage hiccup must never break the whole message,
// same contract the old Supabase-fetch upload calls had.
export async function uploadToR2(path: string, buffer: Buffer, contentType: string): Promise<string | null> {
  if (!r2Client || !R2_ENDPOINT || !R2_PUBLIC_URL) {
    console.error('[uploadToR2] R2 env vars missing — check R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_PUBLIC_URL');
    return null;
  }
  try {
    const res = await r2Client.fetch(`${bucketBaseUrl()}/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000' },
      body: buffer,
    });
    if (!res.ok) {
      console.error('[uploadToR2]', res.status, await res.text());
      return null;
    }
    console.log('[uploadToR2] ok:', `${bucketBaseUrl()}/${path}`);
    return `${R2_PUBLIC_URL}/${path}`;
  } catch (e: any) {
    console.error('[uploadToR2]', e?.message, '| endpoint:', R2_ENDPOINT);
    return null;
  }
}
