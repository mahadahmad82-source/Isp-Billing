import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'BN2VJ2pAPIIaDOk2nnSPgwJiQMAZXn4s-IAU71OMOgei4liMdRmc18dOIQoeJm9KG2cGUjq19KLcujWcyo9MGCI';
const SUPABASE_FUNCTION_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co/functions/v1/send-push-notification';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Check if push notifications supported
export const isPushSupported = (): boolean => {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

// Get current permission status
export const getPermissionStatus = (): NotificationPermission => {
  return Notification.permission;
};

// Subscribe to push notifications
export const subscribeToPush = async (managerId: string): Promise<boolean> => {
  try {
    if (!isPushSupported()) return false;

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Get service worker
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return false;

    // Get device name
    const ua = navigator.userAgent;
    let deviceName = 'Unknown Device';
    if (/Android/i.test(ua)) deviceName = 'Android Phone';
    else if (/iPhone|iPad/i.test(ua)) deviceName = 'iPhone/iPad';
    else if (/Windows/i.test(ua)) deviceName = 'Windows PC';
    else if (/Mac/i.test(ua)) deviceName = 'Mac';
    else if (/Linux/i.test(ua)) deviceName = 'Linux PC';

    // Save to Supabase
    const { error } = await supabase.from('push_subscriptions').upsert({
      manager_id: managerId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
      device_name: deviceName,
    }, { onConflict: 'endpoint' });

    if (error) {
      console.error('Push subscription save error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push subscribe error:', err);
    return false;
  }
};

// Unsubscribe from push notifications
export const unsubscribeFromPush = async (managerId: string): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    // Delete from Supabase
    await supabase.from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
      .eq('manager_id', managerId);

    // Unsubscribe from browser
    await subscription.unsubscribe();
    return true;
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return false;
  }
};

// Check if currently subscribed
export const isSubscribed = async (): Promise<boolean> => {
  try {
    if (!isPushSupported()) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
};

// Send notification via Supabase Edge Function
export const sendPushNotification = async (
  managerId: string,
  title: string,
  body: string,
  tag?: string
): Promise<void> => {
  try {
    await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manager_id: managerId, title, body, tag }),
    });
  } catch (err) {
    console.error('Send push error:', err);
  }
};

// Show local notification (instant, no server needed)
export const showLocalNotification = (title: string, body: string, tag?: string): void => {
  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: tag || 'myisp',
        requireInteraction: false,
      });
    });
  }
};
