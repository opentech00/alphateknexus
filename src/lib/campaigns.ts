import type { IncomingNotification } from '../components/toast/toast';
import { supabase } from './supabase';
import type { Service } from '../types';

export type CampaignEventType = 'impression' | 'click' | 'dismiss';
export type CampaignChannel = 'in_app' | 'notification' | 'push' | 'email' | 'share';

const CLIENT_PAGES = new Set([
  'home',
  'services',
  'bookings',
  'account',
  'payments',
  'billing',
  'quotes',
  'support',
]);

export function campaignIdFromNotification(notification: IncomingNotification): string | null {
  const value = notification.metadata?.campaign_id;
  return typeof value === 'string' && value ? value : null;
}

export function isClientAppPage(page: string): boolean {
  return CLIENT_PAGES.has(page);
}

export function campaignDestination(ctaPage: unknown): string {
  if (typeof ctaPage !== 'string' || !ctaPage) return 'services';
  return ctaPage;
}

export async function loadActiveServiceBySlug(slug: string): Promise<Service | null> {
  const { data } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('is_internal', false)
    .maybeSingle();
  return (data as Service | null) || null;
}

export async function openCampaignDestination(
  ctaPage: unknown,
  handlers: {
    onNavigate: (page: string) => void;
    onSelectService?: (service: Service) => void;
  },
): Promise<void> {
  const page = campaignDestination(ctaPage);
  if (isClientAppPage(page)) {
    handlers.onNavigate(page);
    return;
  }
  const service = await loadActiveServiceBySlug(page);
  if (service && handlers.onSelectService) {
    handlers.onSelectService(service);
    return;
  }
  handlers.onNavigate('services');
}

export function trackCampaignEvent(
  campaignId: string,
  eventType: CampaignEventType,
  channel: CampaignChannel = 'in_app',
): void {
  if (!campaignId) return;
  void supabase
    .rpc('track_campaign_event', {
      p_campaign_id: campaignId,
      p_event_type: eventType,
      p_channel: channel,
    })
    .then(({ error }) => {
      if (error) console.warn('Campaign event was not recorded:', error.message);
    });
}

