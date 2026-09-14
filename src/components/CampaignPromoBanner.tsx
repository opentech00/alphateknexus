import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
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
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(8);
      if (cancelled) return;
      const next = ((data as Campaign[]) || []).find((c) =>
        !isDismissed(c.id) && Boolean(c.media_url || c.cta_page)
      );
      setCampaign(next || null);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!campaign) return null;

  const handleCta = async () => {
    const page = campaign.cta_page || 'services';
    if (['home', 'services', 'bookings', 'account'].includes(page)) {
      onNavigate?.(page);
      return;
    }
    const { data } = await supabase.from('services').select('*').eq('slug', page).eq('is_active', true).eq('is_internal', false).maybeSingle();
    if (data && onSelectService) onSelectService(data as Service);
    else onNavigate?.('services');
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
          onClick={() => { dismiss(campaign.id); setCampaign(null); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
          {campaign.kind === 'discount' ? 'Discount' : campaign.kind === 'promo' ? 'Promo' : 'From Alphatek'}
        </p>
        <h3 className="mt-1.5 text-lg sm:text-xl font-extrabold leading-snug pr-8">{campaign.title}</h3>
        <p className="mt-2 text-sm text-slate-200 leading-relaxed line-clamp-3">{campaign.body}</p>
        <button
          type="button"
          onClick={() => void handleCta()}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-xl"
        >
          {campaign.cta_label || 'Learn more'} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
