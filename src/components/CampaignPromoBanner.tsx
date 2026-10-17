import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Share2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { openCampaignDestination, trackCampaignEvent } from '../lib/campaigns';
import { PRODUCTION_HTTPS_ORIGIN } from '../lib/site';
import type { Campaign, Service } from '../types';

const STORAGE_PREFIX = 'atn-campaign-dismissed-';

function isDismissed(id: string) {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === '1'; } catch { return false; }
}

function dismiss(id: string) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${id}`, '1'); } catch { /* ignore */ }
}

export function CampaignPromoBanner({
  onNavigate,
  onSelectService,
  className = '',
}: {
  onNavigate?: (page: string) => void;
  onSelectService?: (service: Service, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  className?: string;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, { data: dismissedEvents }] = await Promise.all([
        supabase
          .from('campaigns')
          .select('*')
          .eq('status', 'sent')
          .eq('channel_in_app', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('priority', { ascending: false })
          .order('sent_at', { ascending: false })
          .limit(8),
        supabase
          .from('campaign_events')
          .select('campaign_id')
          .eq('event_type', 'dismiss'),
      ]);
      if (cancelled) return;
      const dismissedIds = new Set((dismissedEvents || []).map((event) => event.campaign_id));
      const next = ((data as Campaign[]) || []).filter((c) =>
        !dismissedIds.has(c.id) && !isDismissed(c.id) && Boolean(c.media_url || c.cta_page)
      );
      setCampaigns(next);
      setIndex(0);
    })();
    return () => { cancelled = true; };
  }, []);

  const campaign = campaigns[index] || null;

  useEffect(() => {
    if (campaign) trackCampaignEvent(campaign.id, 'impression');
  }, [campaign]);

  if (!campaign) return null;

  const handleCta = async () => {
    trackCampaignEvent(campaign.id, 'click');
    await openCampaignDestination(campaign.cta_page || 'services', {
      onNavigate: (page) => onNavigate?.(page),
      onSelectService: (service) => onSelectService?.(service),
    });
  };

  const handleShare = async () => {
    const url = `${PRODUCTION_HTTPS_ORIGIN}/?page=${encodeURIComponent(
      campaign.cta_page && ['home', 'services', 'bookings', 'account', 'payments', 'billing', 'quotes', 'support'].includes(campaign.cta_page)
        ? campaign.cta_page
        : 'services',
    )}&campaign=${encodeURIComponent(campaign.id)}&campaign_channel=share`;
    try {
      if (navigator.share) {
        await navigator.share({ title: campaign.title, text: campaign.body, url });
      } else {
        await navigator.clipboard.writeText(`${campaign.title}\n${url}`);
      }
      trackCampaignEvent(campaign.id, 'click', 'share');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  };

  const hide = () => {
    trackCampaignEvent(campaign.id, 'dismiss');
    dismiss(campaign.id);
    setCampaigns((prev) => {
      const next = prev.filter((item) => item.id !== campaign.id);
      setIndex(0);
      return next;
    });
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg ${className}`}>
      {campaign.media_url && (
        <img src={campaign.media_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
      )}
      <div className="relative p-5 sm:p-6">
        <button
          type="button"
          aria-label="Dismiss campaign"
          onClick={hide}
          className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
          {campaign.kind === 'discount' ? 'Discount' : campaign.kind === 'promo' ? 'Promo' : 'From Alphatek'}
        </p>
        <h3 className="mt-1.5 text-lg sm:text-xl font-extrabold leading-snug pr-12">{campaign.title}</h3>
        <p className="mt-2 text-sm text-slate-200 leading-relaxed line-clamp-3">{campaign.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCta()}
            className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-xl"
          >
            {campaign.cta_label || 'Learn more'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
            aria-label="Share offer"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {campaigns.length > 1 && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous offer"
                onClick={() => setIndex((current) => (current - 1 + campaigns.length) % campaigns.length)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-white/70 tabular-nums">{index + 1}/{campaigns.length}</span>
              <button
                type="button"
                aria-label="Next offer"
                onClick={() => setIndex((current) => (current + 1) % campaigns.length)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-white/10"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
