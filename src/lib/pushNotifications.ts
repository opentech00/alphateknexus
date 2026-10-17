import { PushNotifications, Token } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export type AppRole = 'client' | 'admin' | 'employee' | 'field';

let listenersInitialized = false;
let activeRole: AppRole = 'client';

async function ensurePushListeners(): Promise<void> {
  if (listenersInitialized) return;
  listenersInitialized = true;
  try {
    if (Capacitor.getPlatform() === 'android') {
      await Promise.all([
        PushNotifications.createChannel({
          id: 'general',
          name: 'Account updates',
          description: 'Bookings, payments, messages, and account activity',
          importance: 4,
          visibility: 1,
          vibration: true,
        }),
        PushNotifications.createChannel({
          id: 'marketing',
          name: 'Offers and promotions',
          description: 'Optional discounts, promotions, and service recommendations',
          importance: 3,
          visibility: 1,
          vibration: true,
        }),
      ]);
    }
    PushNotifications.addListener('registration', async (token: Token) => {
      await registerDeviceToken(token.value, activeRole);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      const title = notification.title || 'AlphaTek Nexus';
      const body = notification.body || '';

      const data = notification.data as Record<string, string> | undefined;
      if (data) {
        handleNotificationData(data);
      }

      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Date.now(),
              title,
              body,
              smallIcon: 'ic_launcher',
              largeIcon: 'ic_launcher',
              channelId: data?.channel_id || 'general',
            },
          ],
        });
      } catch {
        // Local notification scheduling is best-effort
      }
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as Record<string, string> | undefined;
      if (data) {
        handleNotificationData(data);
      }
    });
  } catch (err) {
    listenersInitialized = false;
    console.error('Push listener error:', err);
  }
}

function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

async function requestBrowserNotifications(): Promise<boolean> {
  if (!browserNotificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function showBrowserNotification(title: string, body?: string, data?: Record<string, string>): void {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    const notice = new Notification(title, {
      body: body || '',
      icon: '/alphateknexus_logo.png',
      badge: '/alphateknexus_logo.png',
      tag: data?.campaign_id || data?.booking_id || title,
      data,
    });
    notice.onclick = () => {
      window.focus();
      if (data) handleNotificationData(data);
      notice.close();
    };
  } catch {
    /* ignore blocked or unsupported notification constructors */
  }
}

/** Restore registration only when the user has already granted OS permission. */
export async function initPushNotifications(role: AppRole): Promise<void> {
  activeRole = role;
  if (!Capacitor.isNativePlatform()) return;
  try {
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') return;
    await ensurePushListeners();
    await PushNotifications.register();
  } catch (err) {
    console.error('Push init error:', err);
  }
}

/** Request push from an explicit user action, never unexpectedly during sign-in. */
export async function requestPushNotifications(role: AppRole): Promise<boolean> {
  activeRole = role;
  if (!Capacitor.isNativePlatform()) {
    return requestBrowserNotifications();
  }
  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return false;
    await ensurePushListeners();
    await PushNotifications.register();
    return true;
  } catch (err) {
    console.error('Push permission error:', err);
    return false;
  }
}

export async function hasPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return browserNotificationsSupported() && Notification.permission === 'granted';
  }
  try {
    const permission = await PushNotifications.checkPermissions();
    return permission.receive === 'granted';
  } catch {
    return false;
  }
}

async function registerDeviceToken(token: string, role: AppRole): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const platform = detectPlatform();

    await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          token,
          platform,
          app_role: role,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );
  } catch (err) {
    console.error('Token registration error:', err);
  }
}

function detectPlatform(): 'android' | 'ios' | 'web' {
  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  }
  return 'web';
}

function handleNotificationData(data: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  const bookingId = data.booking_id;
  const serviceSlug = data.service_slug;
  const jobId = data.job_id;
  const screen = data.screen;
  const campaignId = data.campaign_id;
  const ctaPage = data.cta_page;

  if (campaignId || ctaPage || screen) {
    window.dispatchEvent(
      new CustomEvent('app-notification-tap', {
        detail: { screen: screen || ctaPage || 'services', bookingId, serviceSlug, jobId, campaignId, ctaPage },
      }),
    );
    return;
  }
  if (bookingId) {
    window.dispatchEvent(
      new CustomEvent('app-notification-tap', {
        detail: { screen: 'booking', bookingId, serviceSlug },
      }),
    );
    return;
  }
  if (jobId) {
    window.dispatchEvent(
      new CustomEvent('app-notification-tap', {
        detail: { screen: 'job', jobId },
      }),
    );
  }
}

export async function unregisterDeviceToken(role: AppRole): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('app_role', role);
  } catch (err) {
    console.error('Token unregistration error:', err);
  }
}

export async function getNotificationPreferences() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return data;
}

export async function updateNotificationPreferences(
  prefs: Record<string, boolean>,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notification_preferences')
    .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() });
}
