import crypto from 'crypto';

// Meta signs the RAW request bytes, but Vercel hands us the already-parsed body. Meta's JSON escapes
// non-ASCII as \uXXXX (lowercase hex), which JSON.stringify does not, so we try the likely serialisations.
const escapeUnicode = (s: string): string =>
  s.replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const hmac = (secret: string, payload: string): string =>
  'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

export function verifyMetaSignature(body: unknown, header: string | undefined, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const plain = JSON.stringify(body ?? {});
  const esc = escapeUnicode(plain);
  const candidates = [plain, esc, esc.replace(/\//g, '\\/'), plain.replace(/\//g, '\\/')];
  const given = Buffer.from(header);
  return candidates.some(c => {
    const exp = Buffer.from(hmac(secret, c));
    return exp.length === given.length && crypto.timingSafeEqual(exp, given);
  });
}

export { escapeUnicode, hmac };
