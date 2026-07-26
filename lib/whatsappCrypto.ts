// lib/whatsappCrypto.ts — AES-256-GCM encrypt/decrypt for WhatsApp access tokens
// Server-only. Never import in frontend/browser code.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGO   = 'aes-256-gcm';
const IV_LEN  = 12; // 96-bit IV — recommended for GCM
const TAG_LEN = 16; // 128-bit auth tag

function getKey(): Buffer {
  const secret = process.env.WHATSAPP_TOKEN_SECRET;
  if (!secret) throw new Error('WHATSAPP_TOKEN_SECRET env var not set');
  // Derive 32-byte AES key via SHA-256 so any string length secret works
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext Meta access_token.
 * Returns base64 blob: iv(12) | authTag(16) | ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv   = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypt a blob produced by encryptToken().
 * Returns plaintext access_token string.
 */
export function decryptToken(blob: string): string {
  const key = getKey();
  const buf  = Buffer.from(blob, 'base64');
  const iv         = buf.subarray(0, IV_LEN);
  const tag        = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher   = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
