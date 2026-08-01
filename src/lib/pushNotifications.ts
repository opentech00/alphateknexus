import { PushNotifications, Token } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from './supabase';

export type AppRole = 'client' | 'admin' | 'employee' | 'field';

let isInitialized = false;

export async function initPushNotifications(role: AppRole): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token: Token) => {
      await registerDeviceToken(token.value, role);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      const title = notification.title || 'AlphaTek Nexus';
      const body = notification.body || '';

      const { data } = notification;
      if (data) {
        handleNotificationData(data as Record<string, string>, role);
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
        handleNotificationData(data, role);
      }
    });
  } catch (err) {
    console.error('Push init error:', err);
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

function handleNotificationData(data: Record<string, string>, _role: AppRole): void {
  const bookingId = data.booking_id;
  const serviceSlug = data.service_slug;
  const jobId = data.job_id;
  const screen = data.screen;

  if (screen && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-notification-tap', {
        detail: { screen, bookingId, serviceSlug, jobId },
      }),
    );
  } else if (bookingId && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-notification-tap', {
        detail: { screen: 'booking', bookingId, serviceSlug },
      }),
    );
  } else if (jobId && typeof window !== 'undefined') {
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
