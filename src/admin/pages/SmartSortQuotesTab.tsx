import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Search, RefreshCw, Download, X, AlertCircle,
  Clock, MapPin, Phone, Mail, Building2, CheckCircle2,
  ChevronDown, ChevronRight, Trash2, Recycle, Sparkles, Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { StatCard, EmptyState, Spinner } from '../components/ui';

interface QuoteDetails {
  type: string;
  quote_request: boolean;
  company?: string;
  position?: string;
  whatsapp?: string;
  property_type?: string;
  city?: string;
  landmark?: string;
  occupants?: string;
  access_notes?: string;
  waste_streams?: string[];
  volume_per_pickup?: string;
  containers?: string;
  num_bins?: number;
  has_hazardous?: boolean;
  service_type?: string;
  pickup_frequency?: string;
  preferred_time?: string;
  preferred_days?: string[];
  contract_duration?: string;
  add_ons?: string[];
  include_recycling_report?: boolean;
  monthly_budget?: string;
}

interface QuoteBooking {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  scheduled_date: string | null;
  location: string;
  notes: string | null;
  status: string;
  created_at: string;
  details: QuoteDetails | null;
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-400' },
  confirmed: { label: 'Quoted',    cls: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-400' },
  completed: { label: 'Closed',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600 border-red-200',          dot: 'bg-red-400' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{text}</span>;
}

function DetailRow({ label, value }: { label: string; value?: string | string[] | number | boolean | null }) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value)
    ? value.join(', ')
    : typeof value === 'boolean'
    ? (value ? 'Yes' : 'No')
    : String(value);
  return (
    <div className="flex gap-3 py-1.5 text-sm border-b border-slate-50 last:border-0">
      <span className="text-slate-400 w-36 flex-shrink-0 text-xs">{label}</span>
      <span className="text-slate-800 font-medium text-xs break-words min-w-0">{display}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-left"
      >
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && <div className="px-4 py-2">{children}</div>}
    </div>
  );
}

export function SmartSortQuotesTab() {
  const [quotes, setQuotes] = useState<QuoteBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<QuoteBooking | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      const q = (data as QuoteBooking[]).filter(
        b => b.details?.type === 'smart-sort-quote' && b.details?.quote_request === true,
      );
      setQuotes(q);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total:     quotes.length,
    pending:   quotes.filter(q => q.status === 'pending').length,
    quoted:    quotes.filter(q => q.status === 'confirmed').length,
    closed:    quotes.filter(q => q.status === 'completed').length,
    hazardous: quotes.filter(q => q.details?.has_hazardous && q.status === 'pending').length,
  }), [quotes]);

  const filtered = useMemo(() => {
    let r = quotes;
    if (statusFilter !== 'all') r = r.filter(q => q.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(q =>
        q.contact_name.toLowerCase().includes(s) ||
        q.contact_phone.toLowerCase().includes(s) ||
        (q.details?.company || '').toLowerCase().includes(s) ||
        q.location.toLowerCase().includes(s) ||
        (q.details?.service_type || '').toLowerCase().includes(s),
      );
    }
    return r;
  }, [quotes, statusFilter, search]);

  const updateStatus = async (id: string, status: string) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status } : q));
    if (selected?.id === id) setSelected(p => p ? { ...p, status } : p);
    await supabase.from('bookings').update({ status }).eq('id', id);
  };

  const deleteQuote = async (id: string) => {
    if (!confirm('Delete this quote request? This cannot be undone.')) return;
    setQuotes(prev => prev.filter(q => q.id !== id));
    if (selected?.id === id) setSelected(null);
    await supabase.from('bookings').delete().eq('id', id);
  };

  const exportCsv = () => {
    const headers = [
      'Date', 'Contact', 'Company', 'Phone', 'Email', 'Property Type', 'Address',
      'Waste Streams', 'Volume', 'Service Type', 'Frequency', 'Start Date',
      'Budget', 'Add-ons', 'Status',
    ];
    const rows = filtered.map(q => [
      fmtDate(q.created_at), q.contact_name, q.details?.company || '',
      q.contact_phone, q.contact_email || '', q.details?.property_type || '',
      q.location, (q.details?.waste_streams || []).join('; '),
      q.details?.volume_per_pickup || '', q.details?.service_type || '',
      q.details?.pickup_frequency || '', fmtDate(q.scheduled_date),
      q.details?.monthly_budget || '', (q.details?.add_ons || []).join('; '), q.status,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartsort-quotes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} icon={FileText} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Quoted" value={stats.quoted} icon={CheckCircle2} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Closed" value={stats.closed} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Hazardous" value={stats.hazardous} icon={AlertCircle} color="text-red-600" accent="bg-red-50" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, company…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Quoted</option>
              <option value="completed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={exportCsv} title="Export CSV"
              className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={load} title="Refresh"
              className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No quote requests" description="Smart Sort quote requests from the client portal will appear here." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(q => {
            const sm = STATUS_META[q.status] ?? STATUS_META.pending;
            const streams = q.details?.waste_streams ?? [];
            return (
              <div
                key={q.id}
                onClick={() => setSelected(q)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-emerald-200"
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Recycle className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 leading-tight">{q.contact_name}</p>
                      {q.details?.company && <p className="text-xs text-slate-500">{q.details.company}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge text={sm.label} cls={sm.cls} />
                    {q.details?.has_hazardous && (
                      <Badge text="Hazardous" cls="bg-red-50 text-red-600 border-red-200" />
                    )}
                  </div>
                </div>

                {/* Key details */}
                <div className="space-y-1.5 text-sm text-slate-600 mb-3">
                  <p className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {q.details?.service_type || '—'} · {q.details?.volume_per_pickup || '—'}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{q.location}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {q.contact_phone}
                    {q.contact_email && <span className="text-slate-400">· {q.contact_email}</span>}
                  </p>
                </div>

                {/* Waste streams */}
                {streams.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {streams.slice(0, 4).map(s => (
                      <span key={s} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-100">{s}</span>
                    ))}
                    {streams.length > 4 && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">+{streams.length - 4} more</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2.5">
                  <span>{fmtDate(q.created_at)}</span>
                  {q.details?.monthly_budget && (
                    <span className="text-emerald-600 font-medium">Budget: {q.details.monthly_budget}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between z-10 flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">{selected.contact_name}</h3>
                {selected.details?.company && <p className="text-xs text-slate-500">{selected.details.company}</p>}
                <p className="text-xs text-slate-400 mt-0.5">{fmtDate(selected.created_at)} · #{selected.id.slice(0, 8)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-3 flex-shrink-0">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Status badge row */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${STATUS_META[selected.status]?.dot ?? 'bg-slate-400'}`} />
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_META[selected.status]?.cls ?? ''}`}>
                {STATUS_META[selected.status]?.label ?? selected.status}
              </span>
              {selected.details?.has_hazardous && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-50 text-red-600 border-red-200">Hazardous</span>
              )}
            </div>

            {/* Drawer body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <Section title="Client">
                <DetailRow label="Contact person" value={selected.contact_name} />
                <DetailRow label="Company" value={selected.details?.company} />
                <DetailRow label="Position" value={selected.details?.position} />
                <DetailRow label="Phone" value={selected.contact_phone} />
                <DetailRow label="WhatsApp" value={selected.details?.whatsapp} />
                <DetailRow label="Email" value={selected.contact_email} />
              </Section>

              <Section title="Pickup Location">
                <DetailRow label="Property type" value={selected.details?.property_type} />
                <DetailRow label="Address" value={selected.location} />
                <DetailRow label="Landmark" value={selected.details?.landmark} />
                <DetailRow label="Occupants" value={selected.details?.occupants} />
                <DetailRow label="Access notes" value={selected.details?.access_notes} />
              </Section>

              <Section title="Waste Profile">
                <DetailRow label="Waste streams" value={selected.details?.waste_streams} />
                <DetailRow label="Volume per pickup" value={selected.details?.volume_per_pickup} />
                <DetailRow label="Containers" value={selected.details?.containers} />
                <DetailRow label="Number of bins" value={selected.details?.num_bins} />
                <DetailRow label="Hazardous present" value={selected.details?.has_hazardous} />
              </Section>

              <Section title="Service Plan">
                <DetailRow label="Service type" value={selected.details?.service_type} />
                <DetailRow label="Pickup frequency" value={selected.details?.pickup_frequency} />
                <DetailRow label="Preferred time" value={selected.details?.preferred_time} />
                <DetailRow label="Preferred days" value={selected.details?.preferred_days} />
                <DetailRow label="Start date" value={fmtDate(selected.scheduled_date)} />
                <DetailRow label="Contract duration" value={selected.details?.contract_duration} />
              </Section>

              <Section title="Add-ons & Budget">
                <DetailRow label="Add-ons" value={selected.details?.add_ons} />
                <DetailRow label="Recycling report" value={selected.details?.include_recycling_report} />
                <DetailRow label="Monthly budget" value={selected.details?.monthly_budget} />
                <DetailRow label="Additional notes" value={selected.notes} />
              </Section>

              {/* Status actions */}
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Update Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {selected.status !== 'confirmed' && (
                    <button onClick={() => updateStatus(selected.id, 'confirmed')}
                      className="py-2.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Quoted
                    </button>
                  )}
                  {selected.status !== 'completed' && (
                    <button onClick={() => updateStatus(selected.id, 'completed')}
                      className="py-2.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Close
                    </button>
                  )}
                  {selected.status !== 'pending' && (
                    <button onClick={() => updateStatus(selected.id, 'pending')}
                      className="py-2.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Reopen
                    </button>
                  )}
                  {selected.status !== 'cancelled' && (
                    <button onClick={() => updateStatus(selected.id, 'cancelled')}
                      className="py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  )}
                  <button onClick={() => deleteQuote(selected.id)}
                    className="col-span-2 py-2.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Delete Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
