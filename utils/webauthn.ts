// Local-device fingerprint/Face unlock using the browser's WebAuthn platform
// authenticator (Touch ID / Android fingerprint / Windows Hello).
//
// NOTE: This is a client-only convenience gate — there is no backend to
// verify the signature (no server, per project rules). The registered
// credential simply forces the OS to prompt for the device owner's
// fingerprint/face before we auto-fill the already-locally-stored account
// password and proceed with the normal login flow. It is layered on top of
// existing "Remember Me" accounts, not a replacement for Supabase Auth.

const STORAGE_KEY = 'myisp_biometric_credentials';

interface BiometricRecord {
  username: string;
  credentialId: string; // base64
}

function getRecords(): BiometricRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecords(records: BiometricRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch { /* storage full/unavailable — silently skip */ }
}

function bufferToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether this device/browser supports a platform biometric authenticator at all. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await (window.PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricRegistered(username: string): boolean {
  if (!username) return false;
  return getRecords().some(r => r.username.toLowerCase() === username.toLowerCase());
}

/** Returns the first username on this device that has fingerprint login enabled (or null). */
export function getBiometricUsername(): string | null {
  const records = getRecords();
  return records.length > 0 ? records[0].username : null;
}

/** Prompts OS fingerprint/Face setup and stores the credential id for `username`. */
export async function registerBiometric(username: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Bill Collector', id: window.location.hostname },
        user: { id: userId, name: username, displayName: username },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const records = getRecords().filter(r => r.username.toLowerCase() !== username.toLowerCase());
    records.push({ username, credentialId: bufferToBase64(cred.rawId) });
    saveRecords(records);
    return true;
  } catch (e) {
    console.warn('[Biometric] registration failed:', e);
    return false;
  }
}

/** Prompts fingerprint/Face verification for a previously-registered username. */
export async function verifyBiometric(username: string): Promise<boolean> {
  const record = getRecords().find(r => r.username.toLowerCase() === username.toLowerCase());
  if (!record) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: base64ToBuffer(record.credentialId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (e) {
    console.warn('[Biometric] verification failed:', e);
    return false;
  }
}

export function removeBiometric(username: string) {
  saveRecords(getRecords().filter(r => r.username.toLowerCase() !== username.toLowerCase()));
}
