import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Plus, ArrowLeft, Loader2, ImagePlus, X, Send, Clock,
  Copy, Ban, Mail, Bell, Smartphone, Check, Share2, BarChart3, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { saveMediaAsset } from '../../lib/media';
import { PageHeader, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { MediaPicker } from '../components/MediaPicker';
import type { Campaign, CampaignAudience, CampaignKind, CampaignStatus } from '../../types';
import { PRODUCTION_HTTPS_ORIGIN } from '../../lib/site';
import { toast } from '../../components/toast/toast';

type ServiceOption = { slug: string; label: string };

const FALLBACK_SERVICES: ServiceOption[] = [
  { slug: 'clearing-forwarding', label: 'Clearing & Forwarding' },
  { slug: 'waste-management', label: 'Smart Sort Waste' },
  { slug: 'cleaning-janitorial', label: 'Cleaning & Janitorial' },
  { slug: 'private-security', label: 'Private Security' },
  { slug: 'procurement', label: 'Procurement' },
];

const KIND_META: Record<CampaignKind, { label: string; chip: string }> = {
  promo: { label: 'Promo', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  marketing: { label: 'Marketing', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  discount: { label: 'Discount', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const STATUS_META: Record<CampaignStatus, { label: string; chip: string }> = {
  draft: { label: 'Draft', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  scheduled: { label: 'Scheduled', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  sending: { label: 'Sending', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  sent: { label: 'Sent', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { label: 'Failed', chip: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled', chip: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const AUDIENCE_OPTIONS: { id: CampaignAudience; label: string; description: string }[] = [
  { id: 'all', label: 'All clients', description: 'Every opted-in client' },
  { id: 'service', label: 'By service', description: 'Clients who booked selected services' },
  { id: 'new_clients', label: 'New clients', description: 'Joined within a recent period' },
  { id: 'recent_bookers', label: 'Recent bookers', description: 'Booked within a recent period' },
  { id: 'inactive_clients', label: 'Re-engage', description: 'No booking within a recent period' },
  { id: 'wallet_users', label: 'Wallet users', description: 'Clients with store credit activity' },
];

function audienceLabel(campaign: Campaign, services: ServiceOption[]): string {
  if (campaign.audience === 'all') return 'All clients';
  if (campaign.audience === 'wallet_users') return 'Wallet users';
  if (campaign.audience === 'new_clients') return `New in ${campaign.audience_days || 30} days`;
  if (campaign.audience === 'recent_bookers') return `Booked in ${campaign.audience_days || 30} days`;
  if (campaign.audience === 'inactive_clients') return `Inactive ${campaign.audience_days || 30}+ days`;
  return (campaign.service_slugs || []).map((slug) => services.find((service) => service.slug === slug)?.label || slug).join(', ');
}

type Draft = {
  id?: string;
  kind: CampaignKind;
  title: string;
  body: string;
  email_body: string;
  media_url: string;
  media_path: string;
  cta_label: string;
  cta_page: string;
  audience: CampaignAudience;
  audience_days: number;
  service_slugs: string[];
  channel_email: boolean;
  channel_push: boolean;
  channel_in_app: boolean;
  scheduled_at: string;
  expires_at: string;
  priority: number;
};

type AudienceBreakdown = {
  total: number;
  email: number;
  push: number;
  inApp: number;
  pushRegistered: number;
};

type CampaignStats = {
  delivery: { inApp: number; email: number; push: number; processed: number; errors: number };
  engagement: { impressions: number; clicks: number; dismissals: number };
};

const EMPTY_DRAFT: Draft = {
  kind: 'promo',
  title: '',
  body: '',
  email_body: '',
  media_url: '',
  media_path: '',
  cta_label: 'Browse services',
  cta_page: 'services',
  audience: 'all',
  audience_days: 30,
  service_slugs: [],
  channel_email: true,
  channel_push: true,
  channel_in_app: true,
  scheduled_at: '',
  expires_at: '',
  priority: 0,
};

function toDraft(c: Campaign): Draft {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    body: c.body,
    email_body: c.email_body || '',
    media_url: c.media_url || '',
    media_path: c.media_path || '',
    cta_label: c.cta_label || 'Browse services',
    cta_page: c.cta_page || 'services',
    audience: c.audience,
    audience_days: c.audience_days || 30,
    service_slugs: c.service_slugs || [],
    channel_email: c.channel_email,
    channel_push: c.channel_push,
    channel_in_app: c.channel_in_app,
    scheduled_at: c.scheduled_at ? c.scheduled_at.slice(0, 16) : '',
    expires_at: c.expires_at ? c.expires_at.slice(0, 16) : '',
    priority: c.priority || 0,
  };
}

function payloadFromDraft(draft: Draft, userId: string | undefined, status: Campaign['status']) {
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    body: draft.body.trim(),
    email_body: draft.email_body.trim() || null,
    media_url: draft.media_url || null,
    media_path: draft.media_path || null,
    cta_label: draft.cta_label.trim() || null,
    cta_page: draft.cta_page || null,
    audience: draft.audience,
    audience_days: draft.audience_days,
    service_slugs: draft.audience === 'service' ? draft.service_slugs : [],
    channel_email: draft.channel_email,
    channel_push: draft.channel_push,
    channel_in_app: draft.channel_in_app,
    scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null,
    expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
    priority: draft.priority,
    status,
    created_by: userId,
  };
}

export function CampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [services, setServices] = useState<ServiceOption[]>(FALLBACK_SERVICES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [filterKind, setFilterKind] = useState<'all' | CampaignKind>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | CampaignStatus>('all');
  const [filterService, setFilterService] = useState('all');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceBreakdown, setAudienceBreakdown] = useState<AudienceBreakdown | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [detailStats, setDetailStats] = useState<CampaignStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error: qErr }, { data: serviceRows }] = await Promise.all([
      supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('services')
        .select('slug, name')
        .eq('is_active', true)
        .eq('is_internal', false)
        .order('name'),
    ]);
    if (qErr) setError(qErr.message);
    setCampaigns((data as Campaign[]) || []);
    if (serviceRows?.length) {
      setServices(serviceRows.map((service) => ({ slug: service.slug, label: service.name })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.functions.invoke('send-campaign', { body: { action: 'process-scheduled' } }).catch(() => {});
  }, []);

  const filtered = useMemo(() => campaigns.filter((c) => {
    if (filterKind !== 'all' && c.kind !== filterKind) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterService !== 'all' && !(c.service_slugs || []).includes(filterService) && c.audience !== 'all') return false;
    return true;
  }), [campaigns, filterKind, filterStatus, filterService]);
  const summary = useMemo(() => ({
    sent: campaigns.filter((campaign) => campaign.status === 'sent').length,
    scheduled: campaigns.filter((campaign) => campaign.status === 'scheduled').length,
    reached: campaigns.reduce((total, campaign) => total + Number(campaign.recipient_count || 0), 0),
    needsAttention: campaigns.filter((campaign) => campaign.status === 'failed').length,
  }), [campaigns]);
  const audienceDraft = useMemo(() => ({
    id: draft.id,
    audience: draft.audience,
    audience_days: draft.audience_days,
    service_slugs: draft.service_slugs,
    channel_email: draft.channel_email,
    channel_push: draft.channel_push,
    channel_in_app: draft.channel_in_app,
  }), [
    draft.id,
    draft.audience,
    draft.audience_days,
    draft.service_slugs,
    draft.channel_email,
    draft.channel_push,
    draft.channel_in_app,
  ]);

  const refreshAudience = useCallback(async (next: typeof audienceDraft) => {
    if (next.service_slugs.length === 0) {
      if (next.audience === 'service') {
        setAudienceCount(0);
        setAudienceBreakdown(null);
        return;
      }
    }
    setAudienceCount(null);
    const { data, error: estimateError } = await supabase.functions.invoke('send-campaign', {
      body: {
        action: 'estimate',
        campaign: {
          id: next.id || crypto.randomUUID(),
          audience: next.audience,
          audience_days: next.audience_days,
          service_slugs: next.audience === 'service' ? next.service_slugs : [],
          channel_email: next.channel_email,
          channel_push: next.channel_push,
          channel_in_app: next.channel_in_app,
        },
      },
    });
    if (estimateError || data?.error) {
      setAudienceCount(0);
      setAudienceBreakdown(null);
      return;
    }
    setAudienceCount(data?.count ?? 0);
    setAudienceBreakdown((data?.breakdown as AudienceBreakdown | undefined) || null);
  }, []);

  useEffect(() => {
    if (view !== 'edit') return;
    const timer = window.setTimeout(() => void refreshAudience(audienceDraft), 300);
    return () => window.clearTimeout(timer);
  }, [view, audienceDraft, refreshAudience]);

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setView('edit');
    setConfirmSend(false);
    setError(null);
  };

  const openEdit = (c: Campaign) => {
    setDraft(toDraft(c));
    setView('edit');
    setConfirmSend(false);
    setError(null);
  };

  const saveCampaign = async (status: Campaign['status']) => {
    if (!draft.title.trim() || !draft.body.trim()) {
      setError('Title and message are required.');
      return null;
    }
    if (draft.audience === 'service' && draft.service_slugs.length === 0) {
      setError('Select at least one service for a targeted campaign.');
      return null;
    }
    if (!draft.channel_email && !draft.channel_push && !draft.channel_in_app) {
      setError('Select at least one delivery channel.');
      return null;
    }
    if (draft.expires_at) {
      const expiry = new Date(draft.expires_at).getTime();
      const starts = draft.scheduled_at ? new Date(draft.scheduled_at).getTime() : Date.now();
      if (!Number.isFinite(expiry) || expiry <= starts) {
        setError('Campaign expiry must be after its send time.');
        return null;
      }
    }
    setSaving(true);
    setError(null);
    const row = payloadFromDraft(draft, user?.id, status);
    const query = draft.id
      ? supabase.from('campaigns').update(row).eq('id', draft.id).select('*').single()
      : supabase.from('campaigns').insert(row).select('*').single();
    const { data, error: saveErr } = await query;
    setSaving(false);
    if (saveErr || !data) {
      setError(saveErr?.message || 'Could not save campaign.');
      return null;
    }
    const saved = data as Campaign;
    setDraft(toDraft(saved));
    await load();
    return saved;
  };

  const invokeCampaign = async (action: 'send' | 'test', campaignId: string) => {
    const { data, error: fnErr } = await supabase.functions.invoke('send-campaign', {
      body: { action, campaignId },
    });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const openDelivery = async (campaign: Campaign) => {
    setDetail(campaign);
    setDetailStats(null);
    setDetailLoading(true);
    const { data, error: statsError } = await supabase.functions.invoke('send-campaign', {
      body: { action: 'stats', campaignId: campaign.id },
    });
    setDetailLoading(false);
    if (statsError || data?.error) {
      setError(statsError?.message || data?.error || 'Could not load campaign performance.');
      return;
    }
    setDetailStats(data as CampaignStats);
  };

  const handleShare = async (campaign: Campaign) => {
    const page = ['home', 'services', 'bookings', 'account', 'payments', 'billing', 'quotes', 'support']
      .includes(campaign.cta_page || '')
      ? campaign.cta_page
      : 'services';
    const url = `${PRODUCTION_HTTPS_ORIGIN}/?page=${encodeURIComponent(page || 'services')}&campaign=${encodeURIComponent(campaign.id)}&campaign_channel=share`;
    const text = `${campaign.title}\n\n${campaign.body}\n\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: campaign.title, text: campaign.body, url });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Campaign link copied');
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      toast.error('Could not share this campaign.');
    }
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const saved = await saveCampaign('draft');
      if (!saved) return;
      await invokeCampaign('send', saved.id);
      setConfirmSend(false);
      setView('list');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!draft.scheduled_at) {
      setError('Pick a date and time to schedule this campaign.');
      return;
    }
    if (new Date(draft.scheduled_at).getTime() <= Date.now()) {
      setError('Choose a future date and time.');
      return;
    }
    const saved = await saveCampaign('scheduled');
    if (saved) {
      setView('list');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const saved = await saveCampaign(draft.id ? (campaigns.find((c) => c.id === draft.id)?.status || 'draft') : 'draft');
      if (!saved) return;
      await invokeCampaign('test', saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleDuplicate = async (c: Campaign) => {
    const copy = payloadFromDraft({ ...toDraft(c), title: `${c.title} (copy)` }, user?.id, 'draft');
    delete (copy as { created_by?: string }).created_by;
    const { error: dupErr } = await supabase.from('campaigns').insert({ ...copy, created_by: user?.id, sent_at: null, recipient_count: 0, enqueued_count: 0, error: null });
    if (dupErr) setError(dupErr.message);
    else await load();
  };

  const handleCancel = async (c: Campaign) => {
    await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', c.id);
    await load();
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setUploading(true);
    const result = await saveMediaAsset(file, {
      category: 'campaign',
      key: 'campaign',
      title: file.name,
    });
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft((d) => ({ ...d, media_url: result.asset.file_url, media_path: result.asset.file_path }));
  };

  if (loading && view === 'list') {
    return <Spinner />;
  }

  if (view === 'edit') {
    const locked = Boolean(draft.id && campaigns.find((c) => c.id === draft.id && (c.status === 'sent' || c.status === 'sending')));
    return (
      <div>
        <button
          type="button"
          onClick={() => { setView('list'); setConfirmSend(false); }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to campaigns
        </button>
        <PageHeader
          title={draft.id ? 'Edit campaign' : 'New campaign'}
          description="Compose media and copy, preview how clients will see it, then send or schedule."
          icon={Megaphone}
        />
        {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_META) as CampaignKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={locked}
                  onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border ${draft.kind === k ? KIND_META[k].chip : 'bg-white text-slate-500 border-slate-200'}`}
                >
                  {KIND_META[k].label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Title</span>
              <input
                value={draft.title}
                disabled={locked}
                maxLength={80}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                placeholder="Weekend waste pickup — 20% off"
              />
              <span className="text-[11px] text-slate-400">{draft.title.length}/80 · used as the push title</span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Message</span>
              <textarea
                value={draft.body}
                disabled={locked}
                maxLength={240}
                rows={3}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                placeholder="Book this week and save on scheduled Smart Sort collections."
              />
              <span className="text-[11px] text-slate-400">{draft.body.length}/240 · push and in-app body</span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Longer email copy (optional)</span>
              <textarea
                value={draft.email_body}
                disabled={locked}
                rows={3}
                onChange={(e) => setDraft((d) => ({ ...d, email_body: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                placeholder="Add extra detail for the email. Leave blank to reuse the message."
              />
            </label>

            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">Campaign image</p>
              {draft.media_url ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-200">
                  <img src={draft.media_url} alt="" className="w-full h-40 object-cover" />
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, media_url: '', media_path: '' }))}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 h-36 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                  <ImagePlus className="w-6 h-6 text-slate-400" />
                  <span className="text-xs text-slate-500">{uploading ? 'Uploading…' : 'Drop or click to upload'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={locked}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                    }}
                  />
                </label>
              )}
              {!locked && (
                <button type="button" onClick={() => setLibraryOpen(true)} className="mt-2 text-xs font-semibold text-emerald-600">
                  Choose from media library
                </button>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">Audience</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={locked}
                    onClick={() => setDraft((d) => ({ ...d, audience: option.id }))}
                    className={`p-3 rounded-xl text-left border transition-colors ${
                      draft.audience === option.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-xs font-bold">{option.label}</span>
                    <span className={`block text-[11px] mt-0.5 ${
                      draft.audience === option.id ? 'text-slate-300' : 'text-slate-400'
                    }`}>{option.description}</span>
                  </button>
                ))}
              </div>
              {draft.audience === 'service' && (
                <div className="flex flex-wrap gap-2">
                  {services.map((s) => {
                    const on = draft.service_slugs.includes(s.slug);
                    return (
                      <button
                        key={s.slug}
                        type="button"
                        disabled={locked}
                        onClick={() => setDraft((d) => ({
                          ...d,
                          service_slugs: on ? d.service_slugs.filter((x) => x !== s.slug) : [...d.service_slugs, s.slug],
                        }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'border-slate-200 text-slate-500'}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {(draft.audience === 'new_clients' || draft.audience === 'inactive_clients' || draft.audience === 'recent_bookers') && (
                <label className="block mt-3 max-w-xs">
                  <span className="text-xs font-semibold text-slate-700">
                    {draft.audience === 'new_clients'
                      ? 'Joined within'
                      : draft.audience === 'recent_bookers'
                        ? 'Booked within'
                        : 'No bookings for'}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      disabled={locked}
                      value={draft.audience_days}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        audience_days: Math.min(365, Math.max(1, Number(e.target.value) || 1)),
                      }))}
                      className="w-24 px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    />
                    <span className="text-xs text-slate-500">days</span>
                  </span>
                </label>
              )}
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500">
                  Eligible audience: <span className="font-bold text-slate-900">{audienceCount ?? '…'}</span> opted-in clients
                </p>
                {audienceBreakdown && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Email {audienceBreakdown.email} · In-app {audienceBreakdown.inApp} ·
                    Push enabled {audienceBreakdown.push} · Devices registered {audienceBreakdown.pushRegistered}
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">Channels</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {([
                  ['channel_email', 'Email'],
                  ['channel_push', 'Push'],
                  ['channel_in_app', 'In-app'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={draft[key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Marketing opt-outs and each client's channel preferences are always respected.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">CTA label</span>
                <input
                  disabled={locked}
                  value={draft.cta_label}
                  onChange={(e) => setDraft((d) => ({ ...d, cta_label: e.target.value }))}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">CTA opens</span>
                <select
                  disabled={locked}
                  value={draft.cta_page}
                  onChange={(e) => setDraft((d) => ({ ...d, cta_page: e.target.value }))}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="home">Home</option>
                  <option value="services">Services</option>
                  <option value="bookings">Bookings</option>
                  <option value="payments">Payments</option>
                  <option value="billing">Bills</option>
                  <option value="quotes">Quotes</option>
                  <option value="support">Inbox & support</option>
                  <option value="account">Account</option>
                  {services.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Schedule (optional)</span>
                <input
                  type="datetime-local"
                  disabled={locked}
                  value={draft.scheduled_at}
                  onChange={(e) => setDraft((d) => ({ ...d, scheduled_at: e.target.value }))}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Stop showing (optional)</span>
                <input
                  type="datetime-local"
                  disabled={locked}
                  value={draft.expires_at}
                  onChange={(e) => setDraft((d) => ({ ...d, expires_at: e.target.value }))}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </label>
            </div>

            <label className="block max-w-xs">
              <span className="text-sm font-semibold text-slate-800">Banner priority</span>
              <select
                disabled={locked}
                value={draft.priority}
                onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
              >
                <option value={0}>Normal</option>
                <option value={5}>High</option>
                <option value={10}>Urgent</option>
              </select>
              <span className="block mt-1 text-[11px] text-slate-400">Higher-priority active campaigns appear first in the client portal.</span>
            </label>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-900 rounded-[2rem] p-5 shadow-xl">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-3">
                <Smartphone className="w-3.5 h-3.5" /> Push preview
              </div>
              <div className="bg-white rounded-2xl overflow-hidden">
                {draft.media_url && <img src={draft.media_url} alt="" className="w-full h-28 object-cover" />}
                <div className="p-3">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">Alphatek Nexus</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{draft.title || 'Campaign title'}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-3">{draft.body || 'Short message clients will see on their phone.'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 text-xs text-slate-400">
                <Mail className="w-3.5 h-3.5" /> Email preview
              </div>
              {draft.media_url && <img src={draft.media_url} alt="" className="w-full h-36 object-cover" />}
              <div className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">{KIND_META[draft.kind].label}</p>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{draft.title || 'Campaign title'}</h3>
                <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{draft.email_body || draft.body || 'Email body appears here.'}</p>
                {draft.cta_label && (
                  <span className="inline-flex mt-4 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg">{draft.cta_label}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {!locked && (
          <div className="sticky bottom-4 mt-6 bg-white border border-slate-200 shadow-lg rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-500 flex-1">
              {audienceCount ?? 0} clients · {[draft.channel_email && 'Email', draft.channel_push && 'Push', draft.channel_in_app && 'In-app'].filter(Boolean).join(' · ') || 'No channels'}
            </p>
            <button type="button" onClick={() => void saveCampaign('draft')} disabled={saving} className="px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-lg">
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" onClick={() => void handleTest()} disabled={testing} className="px-3 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg">
              {testing ? 'Sending test…' : 'Test to me'}
            </button>
            <button type="button" onClick={() => void handleSchedule()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-violet-700 bg-violet-50 rounded-lg">
              <Clock className="w-4 h-4" /> Schedule
            </button>
            <button type="button" onClick={() => setConfirmSend(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg">
              <Send className="w-4 h-4" /> Send now
            </button>
          </div>
        )}

        {confirmSend && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900">Send this campaign?</h3>
              <p className="text-sm text-slate-500 mt-2">
                This notifies about <span className="font-semibold text-slate-800">{audienceCount ?? 0}</span> clients
                via {[draft.channel_email && 'email', draft.channel_push && 'push', draft.channel_in_app && 'in-app'].filter(Boolean).join(', ')}.
                This cannot be undone.
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" onClick={() => setConfirmSend(false)} className="px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button type="button" onClick={() => void handleSend()} disabled={sending} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirm send
                </button>
              </div>
            </div>
          </div>
        )}

        <MediaPicker
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          categories={['campaign', 'general']}
          onSelect={(asset) => {
            setDraft((d) => ({ ...d, media_url: asset.file_url, media_path: asset.file_path }));
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Plan targeted promotions across email, push, in-app banners, and shareable links."
        icon={Megaphone}
        actions={
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> New campaign
          </button>
        }
      />
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Sent', value: summary.sent, icon: Send, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Scheduled', value: summary.scheduled, icon: Clock, tone: 'text-violet-600 bg-violet-50' },
          { label: 'Total reach', value: summary.reached, icon: Users, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Needs attention', value: summary.needsAttention, icon: Bell, tone: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center ${tone}`}>
              <Icon className="w-4 h-4" />
            </span>
            <p className="text-xl font-bold text-slate-900 mt-2">{value.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as typeof filterKind)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="all">All kinds</option>
          <option value="promo">Promo</option>
          <option value="marketing">Marketing</option>
          <option value="discount">Discount</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="all">All statuses</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s as CampaignStatus].label}</option>)}
        </select>
        <select value={filterService} onChange={(e) => setFilterService(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="all">All services</option>
          {services.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create a promo with an image and message, then send it to all clients or a service audience."
          action={
            <button type="button" onClick={openNew} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg">
              Create campaign
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-4">
              {c.media_url ? (
                <img src={c.media_url} alt="" className="w-full sm:w-36 h-24 object-cover rounded-xl flex-shrink-0" />
              ) : (
                <div className="w-full sm:w-36 h-24 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bell className="w-6 h-6 text-slate-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${KIND_META[c.kind].chip}`}>{KIND_META[c.kind].label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_META[c.status].chip}`}>{STATUS_META[c.status].label}</span>
                  <span className="text-[11px] text-slate-400">
                    {audienceLabel(c, services)}
                  </span>
                </div>
                <p className="font-bold text-slate-900 mt-1 truncate">{c.title}</p>
                <p className="text-sm text-slate-500 line-clamp-2">{c.body}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {c.status === 'sent' ? `Sent to ${c.enqueued_count}/${c.recipient_count} · ${c.sent_at ? new Date(c.sent_at).toLocaleString() : ''}` : `Updated ${new Date(c.updated_at).toLocaleString()}`}
                </p>
              </div>
              <div className="flex sm:flex-col gap-2 flex-shrink-0">
                {(c.status === 'draft' || c.status === 'scheduled' || c.status === 'failed') && (
                  <button type="button" onClick={() => openEdit(c)} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg">Edit</button>
                )}
                {c.status === 'sent' && (
                  <button type="button" onClick={() => void openDelivery(c)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg">
                    <BarChart3 className="w-3.5 h-3.5" /> Performance
                  </button>
                )}
                <button type="button" onClick={() => void handleShare(c)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg">
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
                <button type="button" onClick={() => void handleDuplicate(c)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                {c.status === 'scheduled' && (
                  <button type="button" onClick={() => void handleCancel(c)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-100 rounded-lg">
                    <Ban className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-slate-900">Campaign performance</h3>
                <p className="text-xs text-slate-400 mt-0.5">Delivery and client engagement</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close performance">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-700">{detail.title}</p>
            {detailLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Audience', value: detail.recipient_count, icon: Users },
                    { label: 'Email', value: detailStats?.delivery.email ?? 0, icon: Mail },
                    { label: 'Push', value: detailStats?.delivery.push ?? 0, icon: Smartphone },
                    { label: 'In-app', value: detailStats?.delivery.inApp ?? 0, icon: Bell },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <Icon className="w-4 h-4 text-emerald-600" />
                      <p className="text-lg font-bold text-slate-900 mt-2">{value}</p>
                      <p className="text-[11px] text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-violet-600" />
                    <h4 className="text-sm font-bold text-slate-800">Engagement</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xl font-bold text-slate-900">{detailStats?.engagement.impressions ?? 0}</p>
                      <p className="text-[11px] text-slate-400">Views</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{detailStats?.engagement.clicks ?? 0}</p>
                      <p className="text-[11px] text-slate-400">CTA clicks</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-900">
                        {detailStats?.engagement.impressions
                          ? `${Math.round((detailStats.engagement.clicks / detailStats.engagement.impressions) * 100)}%`
                          : '0%'}
                      </p>
                      <p className="text-[11px] text-slate-400">Click rate</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3 text-center">
                    {detailStats?.engagement.dismissals ?? 0} dismissals · {detailStats?.delivery.errors ?? 0} delivery errors
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>Sent {detail.sent_at ? new Date(detail.sent_at).toLocaleString() : '—'}</span>
                  <button type="button" onClick={() => void handleShare(detail)} className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg border border-slate-200 text-slate-600 font-semibold">
                    <Share2 className="w-3.5 h-3.5" /> Share campaign
                  </button>
                </div>
                {detail.error && <p className="mt-3 text-red-600 text-xs">{detail.error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
