import { supabase } from '../lib/supabase';
import { getAgentToken } from './storage';

/**
 * Builds the Authorization headers required by api/wabot-send.ts (which has
 * required auth since Aug 2 2026). Managers/admins carry a real Supabase
 * session; sub-managers carry an agentToken minted by find_sub_manager_login.
 * Every caller of /api/wabot-send must spread these headers or the endpoint
 * returns 401 Unauthorized.
 */
export async function getWabotAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const jwt = data?.session?.access_token;
    if (jwt) return { Authorization: `Bearer ${jwt}` };
  } catch {
    /* fall through to agent token */
  }
  const agentToken = getAgentToken();
  return agentToken ? { Authorization: `Bearer ${agentToken}` } : {};
}

/**
 * Uploads a file/blob DIRECTLY to Cloudflare R2 from the browser (zero egress
 * fees, unlike Supabase Storage's 5GB/month cap) and returns its public URL.
 * Gets a short-lived presigned PUT URL from api/wabot-send.ts (action:
 * 'getUploadUrl'), then PUTs the bytes straight to R2 — the actual file never
 * passes through our own serverless function, so there's no Vercel body-size
 * limit to worry about for larger files (gallery videos/documents etc).
 * Replaces every direct `supabase.storage.from('whatsapp-media')...` call —
 * see PROJECT_KNOWLEDGE.md for why (Sep 2026 egress investigation).
 */
export async function uploadMediaToR2(path: string, blob: Blob, contentType: string): Promise<string> {
  const urlRes = await fetch('/api/wabot-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
    body: JSON.stringify({ action: 'getUploadUrl', path }),
  });
  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => ({}));
    throw new Error(err?.error || `Could not get upload URL: HTTP ${urlRes.status}`);
  }
  const { uploadUrl, publicUrl } = await urlRes.json();
  const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
  if (!putRes.ok) throw new Error(`R2 upload failed: HTTP ${putRes.status}`);
  return publicUrl as string;
}

/**
 * Formats a phone number for WhatsApp (International format without +)
 * Assumes Pakistan (92) if it starts with 0 or 3
 */
export const formatWhatsAppPhone = (phone: string): string => {
  let clean = phone.replace(/\D/g, '');
  
  // If it starts with 0, replace with 92
  if (clean.startsWith('0')) {
    clean = '92' + clean.slice(1);
  }
  
  // If it's 10 digits starting with 3 (like 304...), it's a local number missing 92
  if (clean.length === 10 && clean.startsWith('3')) {
    clean = '92' + clean;
  }
  
  return clean;
};

/**
 * Directly opens the WhatsApp application to a specific user's inbox
 * with a pre-filled message. This provides the "Direct Forward" experience.
 */
export const shareToWhatsApp = (phone: string, message: string) => {
  const formattedPhone = formatWhatsAppPhone(phone);
  
  // wa.me is the most reliable universal link for triggering the WhatsApp app on Android/iOS
  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  
  // We use window.open with _blank to open in a new tab/app instance 
  // without losing the state of the current manager application.
  const win = window.open(waUrl, '_blank');
  
  // Fallback for aggressive popup blockers on mobile browsers
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = waUrl;
  }
};
/**
 * Sends a WhatsApp message directly through NetBot's Meta Cloud API number,
 * server-side — no deep link, no dependency on a regular WhatsApp app being logged
 * into this device. This is what keeps "reminder" buttons working once the business
 * number is fully migrated to Cloud API (at which point wa.me/shareToWhatsApp can no
 * longer assume a consumer WhatsApp app is logged in on that number). The message is
 * also auto-logged into the WABot Inbox and NetBot auto-pauses on that thread.
 */
export const sendWhatsAppDirect = async (
  phone: string,
  message: string,
  managerId: string = 'mahadnet'
): Promise<{ success: boolean; error?: string }> => {
  try {
    const res = await fetch('/api/wabot-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
      body: JSON.stringify({ to: formatWhatsAppPhone(phone), managerId, type: 'text', body: message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
};

/**
 * Sends receipt PNG image directly via NetBot's Meta Cloud API
 * — no template needed, works within 24-hour customer service window.
 * Uploads PNG to Supabase Storage, gets public URL, sends via /api/wabot-send.
 */
export const sendReceiptViaWABot = async (
  phone: string,
  pngBlob: Blob,
  receiptRef: string,
  managerId: string = 'mahadnet'
): Promise<{ success: boolean; error?: string }> => {
  try {
    const formattedPhone = formatWhatsAppPhone(phone);

    // 1. Upload PNG directly to R2 (was Supabase Storage — see uploadMediaToR2 doc)
    const fileName = `receipts/${managerId}/${receiptRef}_${Date.now()}.png`;
    let mediaUrl: string;
    try {
      mediaUrl = await uploadMediaToR2(fileName, pngBlob, 'image/png');
    } catch (e: any) {
      return { success: false, error: `Storage upload failed: ${e?.message || 'Unknown error'}` };
    }

    // 2. Send image via wabot-send endpoint
    const sendRes = await fetch('/api/wabot-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
      body: JSON.stringify({
        to: formattedPhone,
        managerId,
        type: 'image',
        mediaUrl,
        caption: `Receipt: ${receiptRef}`,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}));
      return { success: false, error: err?.error || `HTTP ${sendRes.status}` };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown error' };
  }
};
