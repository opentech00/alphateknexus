import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone, Plus, ArrowLeft, Loader2, ImagePlus, X, Send, Clock,
  Copy, Ban, Eye, Mail, Bell, Smartphone, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { saveMediaAsset } from '../../lib/media';
import { PageHeader, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { MediaPicker } from '../components/MediaPicker';
import type { Campaign, CampaignKind, CampaignStatus } from '../../types';

const SERVICES = [
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
  audience: 'all' | 'service';
  service_slugs: string[];
  channel_email: boolean;
  channel_push: boolean;
  channel_in_app: boolean;
  scheduled_at: string;
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
  service_slugs: [],
  channel_email: true,
  channel_push: true,
  channel_in_app: true,
  scheduled_at: '',
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
    service_slugs: c.service_slugs || [],
    channel_email: c.channel_email,
    channel_push: c.channel_push,
    channel_in_app: c.channel_in_app,
    scheduled_at: c.scheduled_at ? c.scheduled_at.slice(0, 16) : '',
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
    service_slugs: draft.audience === 'service' ? draft.service_slugs : [],
    channel_email: draft.channel_email,
    channel_push: draft.channel_push,
    channel_in_app: draft.channel_in_app,
    scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null,
    status,
    created_by: userId,
  };
}

export function CampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
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
  const [confirmSend, setConfirmSend] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (qErr) setError(qErr.message);
    setCampaigns((data as Campaign[]) || []);
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

  const refreshAudience = useCallback(async (next: Draft) => {
    if (next.audience === 'all') {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('role', 'admin');
      setAudienceCount(count ?? 0);
      return;
    }
    if (next.service_slugs.length === 0) {
      setAudienceCount(0);
      return;
    }
    const { data: services } = await supabase.from('services').select('id').in('slug', next.service_slugs);
    const ids = (services || []).map((s) => s.id);
    if (ids.length === 0) { setAudienceCount(0); return; }
    const { data: bookings } = await supabase.from('bookings').select('user_id').in('service_id', ids).not('user_id', 'is', null);
    setAudienceCount(new Set((bookings || []).map((b) => b.user_id)).size);
  }, []);

  useEffect(() => {
    if (view === 'edit') void refreshAudience(draft);
  }, [view, draft.audience, draft.service_slugs.join(','), refreshAudience]);

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
              <div className="flex gap-2 mb-2">
                {(['all', 'service'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={locked}
                    onClick={() => setDraft((d) => ({ ...d, audience: a }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${draft.audience === a ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'}`}
                  >
                    {a === 'all' ? 'All clients' : 'By service'}
                  </button>
                ))}
              </div>
              {draft.audience === 'service' && (
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map((s) => {
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
              <p className="text-xs text-slate-500 mt-2">
                Estimated audience: <span className="font-semibold text-slate-800">{audienceCount ?? '…'}</span> clients
              </p>
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
                  {SERVICES.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>

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
        description="Notify clients about promos, marketing, and discounts by email and push."
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
          {SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
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
                    {c.audience === 'all' ? 'All clients' : (c.service_slugs || []).map((s) => SERVICES.find((x) => x.slug === s)?.label || s).join(', ')}
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
                  <button type="button" onClick={() => setDetail(c)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg">
                    <Eye className="w-3.5 h-3.5" /> Delivery
                  </button>
                )}
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900">Delivery</h3>
              <button type="button" onClick={() => setDetail(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-slate-600">{detail.title}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Audience</dt><dd>{detail.recipient_count}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Enqueued</dt><dd>{detail.enqueued_count}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Sent</dt><dd>{detail.sent_at ? new Date(detail.sent_at).toLocaleString() : '—'}</dd></div>
              {detail.error && <div className="text-red-600 text-xs">{detail.error}</div>}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
