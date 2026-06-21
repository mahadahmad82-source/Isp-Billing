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
 * Sends a WhatsApp message directly through Ayesha's Meta Cloud API number,
 * server-side — no deep link, no dependency on a regular WhatsApp app being logged
 * into this device. This is what keeps "reminder" buttons working once the business
 * number is fully migrated to Cloud API (at which point wa.me/shareToWhatsApp can no
 * longer assume a consumer WhatsApp app is logged in on that number). The message is
 * also auto-logged into the WABot Inbox and Ayesha auto-pauses on that thread.
 */
export const sendWhatsAppDirect = async (
  phone: string,
  message: string,
  managerId: string = 'mahadnet'
): Promise<{ success: boolean; error?: string }> => {
  try {
    const res = await fetch('/api/wabot-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
