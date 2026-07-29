import { useEffect, useState } from 'react';
import {
  Calendar, MapPin, Clock, Filter, XCircle, MessageSquare, Paperclip,
  ChevronDown, ChevronUp, Ship, FileText, Building2, Package, CreditCard,
  Hash, AlertCircle, Briefcase, CheckCircle2, Users, TrendingUp,
  Recycle, Repeat, DollarSign,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MessageThread } from '../../components/MessageThread';
import { DocumentUpload } from '../../components/DocumentUpload';
import { StatCard } from '../components/ui';

export interface DivisionConfig {
  name: string;
  slug: string;
  icon: React.ElementType;
  accentColor: string;      // tailwind bg e.g. 'bg-blue-600'
  accentLight: string;      // e.g. 'bg-blue-50'
  accentText: string;       // e.g. 'text-blue-600'
  accentBorder: string;     // e.g. 'border-blue-200'
  accentRing: string;       // e.g. 'ring-blue-500'
  description: string;
  staff: number;
}

interface Booking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  details: Record<string, any> | null;
  services: { name: string; slug: string };
}

const statusColors: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  confirmed:   'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed:   'bg-slate-50 text-slate-600 border-slate-200',
  cancelled:   'bg-red-50 text-red-700 border-red-200',
};

const statusLabels: Record<string, string> = {
  pending:     'Pending',
  confirmed:   'Confirmed',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

const allStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
type ModeFilter = 'all' | 'hire' | 'quote';

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
      <span className="text-xs text-slate-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-800 font-medium flex-1">{value}</span>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
      {label}
    </span>
  );
}

function BookingDetails({ details }: { details: Record<string, any> }) {
  const isQuote = details.quote_request;
  const isSmartSort = details.type === 'smart-sort-pickup';

  if (isSmartSort) {
    const wasteLabels: Record<string, string> = {
      general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
      construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
    };
    const freqLabels: Record<string, string> = {
      'one-time': 'One-Time Pickup', daily: 'Daily', 'twice-weekly': 'Twice Weekly',
      weekly: 'Weekly', 'three-weeks': 'Every Three Weeks', monthly: 'Monthly',
    };
    return (
      <div className="bg-slate-50/60 rounded-xl p-4 mt-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Smart Sort Pickup Details
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <DetailRow icon={Recycle} label="Waste Type" value={wasteLabels[details.waste_type] ?? details.waste_type} />
          <DetailRow icon={Repeat} label="Frequency" value={freqLabels[details.frequency] ?? details.frequency} />
          <DetailRow icon={Clock} label="Time Slot" value={details.time_slot_label ?? details.time_slot} />
          <DetailRow icon={Building2} label="Customer Category" value={details.customer_category} />
          <DetailRow icon={AlertCircle} label="Waste Class" value={details.waste_class} />
          <DetailRow icon={Package} label="Bin Size" value={details.bin_size_liters ? `${details.bin_size_liters} L` : null} />
          <DetailRow icon={MapPin} label="Landmark" value={details.landmark} />
        </div>
      </div>
    );
  }

  if (details.type === 'procurement') {
    return (
      <div className="bg-slate-50/60 rounded-xl p-4 mt-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          {isQuote ? 'Procurement Quote Details' : 'Procurement Request Details'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <DetailRow icon={FileText} label="Title" value={details.procurement_title} />
          <DetailRow icon={CreditCard} label="Currency" value={details.currency} />
          <DetailRow icon={Calendar} label="Needed By" value={details.needed_by} />
          <DetailRow icon={DollarSign} label="Budget Range" value={details.budget_range} />
          <DetailRow icon={MapPin} label="Delivery Address" value={details.delivery_address} />
          <DetailRow icon={Briefcase} label="Vendor Preference" value={details.vendor_preference} />
          <DetailRow icon={AlertCircle} label="Description" value={details.procurement_description || details.description} />
        </div>
        {Array.isArray(details.items) && details.items.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1.5">Items Requested</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-200">
                    <th className="py-1.5 pr-3 font-medium">Description</th>
                    <th className="py-1.5 px-3 font-medium text-center">Qty</th>
                    <th className="py-1.5 px-3 font-medium">Unit</th>
                    <th className="py-1.5 pl-3 font-medium">Specs</th>
                  </tr>
                </thead>
                <tbody>
                  {details.items.map((it: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-700 font-medium">{it.description}</td>
                      <td className="py-1.5 px-3 text-center text-slate-600">{it.qty}</td>
                      <td className="py-1.5 px-3 text-slate-600">{it.unit}</td>
                      <td className="py-1.5 pl-3 text-slate-600">{it.specs || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-50/60 rounded-xl p-4 mt-1">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
        {isQuote ? 'Quote Request Details' : 'Service / Shipment Details'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {/* generic fields */}
        <DetailRow icon={Building2} label="Company" value={details.company_name || details.company} />
        <DetailRow icon={Briefcase} label="Business Type" value={details.business_type} />
        <DetailRow icon={Package} label="Goods / Cargo" value={details.goods_nature || details.cargo_description} />
        <DetailRow icon={Hash} label="HS Code" value={details.hs_code} />
        <DetailRow icon={Package} label="Weight" value={details.weight ? `${details.weight} kg` : null} />
        <DetailRow icon={Package} label="Packages" value={details.packages} />
        <DetailRow icon={Ship} label="Containers" value={details.containers} />
        <DetailRow icon={Ship} label="Incoterm" value={details.incoterm} />
        <DetailRow icon={Ship} label="Transport" value={details.transport_mode} />
        <DetailRow icon={MapPin} label="Origin" value={details.origin} />
        <DetailRow icon={MapPin} label="Destination" value={details.destination} />
        <DetailRow icon={MapPin} label="Port of Entry" value={details.port_of_entry} />
        <DetailRow icon={AlertCircle} label="Urgency" value={details.urgency} />
        <DetailRow icon={Clock} label="Frequency" value={details.shipment_frequency} />
        <DetailRow icon={Package} label="Monthly Volume" value={details.monthly_volume} />
        <DetailRow icon={CreditCard} label="Payment" value={details.payment_method} />
        <DetailRow icon={CreditCard} label="Agreed Fee" value={details.agreed_service_fee ? `Le ${details.agreed_service_fee}` : null} />
        <DetailRow icon={Hash} label="TIN" value={details.tin} />
        <DetailRow icon={Hash} label="Reg. Number" value={details.business_registration_number} />
        <DetailRow icon={MapPin} label="Address" value={details.address} />
        <DetailRow icon={FileText} label="PO Number" value={details.po_number} />
        <DetailRow icon={AlertCircle} label="Special Terms" value={details.special_terms} />
        <DetailRow icon={AlertCircle} label="Notes" value={details.service_notes || details.description} />
      </div>
      {details.required_services?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Required Services</p>
          <div className="flex flex-wrap gap-1.5">{details.required_services.map((s: string) => <Chip key={s} label={s} />)}</div>
        </div>
      )}
      {details.preferred_ports?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Preferred Ports / Borders</p>
          <div className="flex flex-wrap gap-1.5">{details.preferred_ports.map((p: string) => <Chip key={p} label={p} />)}</div>
        </div>
      )}
    </div>
  );
}

interface Props {
  config: DivisionConfig;
}

export function DivisionPage({ config }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'messages' | 'documents'>('details');

  const DivIcon = config.icon;

  const fetchBookings = async () => {
    setLoading(true);
    let query = supabase
      .from('bookings')
      .select('*, services(name, slug)')
      .eq('services.slug', config.slug)
      .order('created_at', { ascending: false });

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    const { data } = await query;
    let rows = ((data as unknown as Booking[]) || []).filter(
      (b) => b.services?.slug === config.slug
    );
    if (modeFilter === 'quote') rows = rows.filter((b) => b.details?.quote_request === true);
    else if (modeFilter === 'hire') rows = rows.filter((b) => !b.details?.quote_request);
    if (config.slug === 'waste-management') {
      rows = rows.filter((b) => b.details?.type !== 'smart-sort-quote');
    }
    setBookings(rows);
    setLoading(false);
  };

  useEffect(() => { fetchBookings(); }, [filterStatus, modeFilter]);

  const updateStatus = async (bookingId: string, newStatus: string) => {
    setUpdatingId(bookingId);
    const booking = bookings.find((b) => b.id === bookingId);
    await supabase.from('bookings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', bookingId);
    if (booking) {
      const { data: bd } = await supabase.from('bookings').select('user_id').eq('id', bookingId).maybeSingle();
      if (bd?.user_id) {
        await supabase.from('notifications').insert({
          user_id: bd.user_id,
          title: 'Booking Status Updated',
          body: `Your ${config.name} booking has been updated to "${statusLabels[newStatus]}".`,
          type: 'booking_update',
          booking_id: bookingId,
        });
      }
    }
    await fetchBookings();
    setUpdatingId(null);
  };

  // Computed stats
  const total = bookings.length;
  const pending = bookings.filter((b) => b.status === 'pending').length;
  const active = bookings.filter((b) => ['confirmed', 'in_progress'].includes(b.status)).length;
  const completed = bookings.filter((b) => b.status === 'completed').length;
  const quotes = bookings.filter((b) => b.details?.quote_request === true).length;
  const uniqueClients = new Set(bookings.map((b) => b.contact_phone)).size;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className={`w-12 h-12 ${config.accentLight} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <DivIcon className={`w-6 h-6 ${config.accentText}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{config.name}</h1>
          <p className="mt-0.5 text-slate-500 text-sm">{config.description}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={total} icon={Briefcase} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Pending" value={pending} icon={Clock} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Active" value={active} icon={TrendingUp} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Done" value={completed} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Quotes" value={quotes} icon={FileText} color="text-indigo-600" accent="bg-indigo-50" />
        <StatCard label="Clients" value={uniqueClients} icon={Users} color="text-slate-600" accent="bg-slate-50" />
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-2 mb-3">
        {(['all', 'hire', 'quote'] as ModeFilter[]).map((m) => (
          <button
            key={m}
            onClick={() => setModeFilter(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              modeFilter === m ? `${config.accentColor} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {m === 'all' ? 'All' : m === 'hire' ? 'Hire' : 'Quotes'}
          </button>
        ))}
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 -mx-4 sm:mx-0 px-4 sm:px-0" style={{ scrollbarWidth: 'none' }}>
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        {['all', ...allStatuses].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === s ? `${config.accentColor} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {s === 'all' ? 'All Status' : statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Booking list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
            <XCircle className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No requests found</h3>
          <p className="text-sm text-slate-400 mt-2">
            {filterStatus !== 'all' || modeFilter !== 'all' ? 'Try adjusting filters.' : `No ${config.name} requests yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {bookings.map((booking) => {
            const isQuote = booking.details?.quote_request === true;
            const hasDetails = !!booking.details && Object.keys(booking.details).length > 1;
            const isExpanded = expandedId === booking.id;

            return (
              <div key={booking.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-slate-900 truncate">{booking.contact_name}</h3>
                        {(booking.details?.company_name || booking.details?.company) && (
                          <span className="text-sm text-slate-500 truncate">
                            — {booking.details.company_name || booking.details.company}
                          </span>
                        )}
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusColors[booking.status]}`}>
                          {statusLabels[booking.status]}
                        </span>
                        {isQuote ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <FileText className="w-3 h-3" />
                            Quote
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${config.accentLight} ${config.accentText} ${config.accentBorder} border`}>
                            <Briefcase className="w-3 h-3" />
                            Hire
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{booking.contact_phone}</span>
                        {booking.contact_email && <span>{booking.contact_email}</span>}
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(booking.scheduled_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {booking.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {booking.location}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Clock className="w-3 h-3" />
                          {new Date(booking.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {booking.notes && (
                        <p className="mt-2 text-xs text-slate-400 italic line-clamp-2">{booking.notes}</p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 flex-shrink-0">
                      {hasDetails && (
                        <button
                          onClick={() => { setExpandedId(isExpanded && activeTab === 'details' ? null : booking.id); setActiveTab('details'); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Details
                          {isExpanded && activeTab === 'details' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      <button
                        onClick={() => { setExpandedId(isExpanded && activeTab === 'messages' ? null : booking.id); setActiveTab('messages'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {isExpanded && activeTab === 'messages' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => { setExpandedId(isExpanded && activeTab === 'documents' ? null : booking.id); setActiveTab('documents'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {isExpanded && activeTab === 'documents' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <select
                        value={booking.status}
                        onChange={(e) => updateStatus(booking.id, e.target.value)}
                        disabled={updatingId === booking.id}
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white disabled:opacity-50 cursor-pointer"
                      >
                        {allStatuses.map((s) => (
                          <option key={s} value={s}>{statusLabels[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100">
                    <div className="flex border-b border-slate-100 bg-slate-50/50">
                      {hasDetails && (
                        <button
                          onClick={() => setActiveTab('details')}
                          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
                            activeTab === 'details' ? `${config.accentText} border-b-2 ${config.accentBorder}` : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 inline mr-1" />
                          Details
                        </button>
                      )}
                      <button
                        onClick={() => setActiveTab('messages')}
                        className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
                          activeTab === 'messages' ? `${config.accentText} border-b-2 ${config.accentBorder}` : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                        Messages
                      </button>
                      <button
                        onClick={() => setActiveTab('documents')}
                        className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
                          activeTab === 'documents' ? `${config.accentText} border-b-2 ${config.accentBorder}` : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <Paperclip className="w-3.5 h-3.5 inline mr-1" />
                        Documents
                      </button>
                    </div>
                    <div className="p-5">
                      {activeTab === 'details' && hasDetails ? (
                        <BookingDetails details={booking.details!} />
                      ) : activeTab === 'messages' ? (
                        <MessageThread bookingId={booking.id} />
                      ) : (
                        <DocumentUpload bookingId={booking.id} serviceSlug={booking.services?.slug} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
