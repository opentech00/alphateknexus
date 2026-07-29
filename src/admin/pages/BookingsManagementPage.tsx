import { useEffect, useState } from 'react';
import {
  Calendar, MapPin, Clock, Filter, XCircle, MessageSquare, Paperclip,
  ChevronDown, ChevronUp, Ship, FileText, Building2, Package, CreditCard,
  Hash, AlertCircle, Briefcase, Shield, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MessageThread } from '../../components/MessageThread';
import { DocumentUpload } from '../../components/DocumentUpload';
import { PageHeader, EmptyState, Spinner } from '../components/ui';

interface BookingDetails {
  // C&F hire
  company?: string;
  direction?: string;
  cargo_description?: string;
  hs_code?: string;
  weight?: string;
  packages?: string;
  containers?: string;
  incoterm?: string;
  transport_mode?: string;
  origin?: string;
  destination?: string;
  port_of_entry?: string;
  urgency?: string;
  required_services?: string[];
  delivery_address?: string;
  city?: string;
  payment_method?: string;
  po_number?: string;
  // C&F quote
  quote_request?: boolean;
  company_name?: string;
  business_registration_number?: string;
  tin?: string;
  position?: string;
  whatsapp?: string;
  address?: string;
  country?: string;
  website?: string;
  business_type?: string;
  goods_nature?: string;
  preferred_ports?: string[];
  shipment_frequency?: string;
  other_service?: string;
  monthly_volume?: string;
  agreed_service_fee?: string;
  special_terms?: string;
  // Private Security (hire + quote)
  full_name?: string;
  service_types?: string[];
  service_type_labels?: string[];
  guard_count?: string;
  shift_pattern?: string;
  shift_label?: string;
  contract_duration?: string;
  site_type?: string;
  risk_level?: string;
  addons?: string[];
  addon_labels?: string[];
  site_address?: string;
  subtotal_sle?: number;
  discount_sle?: number;
  total_sle?: number;
  // Security quote extras
  property_type?: string;
  property_size?: string;
  service_scopes?: string[];
  coverage_level?: string;
  coverage_label?: string;
  staff_size?: string;
  contract_term?: string;
  response_time?: string;
  armed_preference?: string;
  special_requirements?: string;
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
  details: BookingDetails | null;
  services: { name: string; slug: string };
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-50 text-slate-600 border-slate-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const allStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
type ModeFilter = 'all' | 'hire' | 'quote';

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
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

function ShipmentDetails({ details }: { details: BookingDetails }) {
  const isQuote = details.quote_request;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50/50 -mx-5 -mb-5 px-5 pb-5 rounded-b-xl">
      <div className="flex items-center gap-2 mb-3">
        {isQuote ? <FileText className="w-4 h-4 text-blue-600" /> : <Ship className="w-4 h-4 text-slate-600" />}
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {isQuote ? 'Quote Request Details' : 'Shipment Details'}
        </h4>
      </div>

      {isQuote ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <DetailRow icon={Building2} label="Company" value={details.company_name} />
          <DetailRow icon={Hash} label="Reg. Number" value={details.business_registration_number} />
          <DetailRow icon={Hash} label="TIN" value={details.tin} />
          <DetailRow icon={Briefcase} label="Position" value={details.position} />
          <DetailRow icon={Building2} label="Business Type" value={details.business_type} />
          <DetailRow icon={Package} label="Goods Nature" value={details.goods_nature} />
          <DetailRow icon={MapPin} label="Address" value={details.address ? `${details.address}, ${details.city || ''}, ${details.country || ''}` : null} />
          <DetailRow icon={Clock} label="Frequency" value={details.shipment_frequency} />
          <DetailRow icon={Package} label="Monthly Volume" value={details.monthly_volume} />
          <DetailRow icon={CreditCard} label="Payment" value={details.payment_method} />
          <DetailRow icon={CreditCard} label="Agreed Fee" value={details.agreed_service_fee ? `Le ${details.agreed_service_fee}` : null} />
          <DetailRow icon={AlertCircle} label="Website" value={details.website} />
          {details.special_terms && (
            <div className="col-span-full">
              <DetailRow icon={FileText} label="Special Terms" value={details.special_terms} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <DetailRow icon={Building2} label="Company" value={details.company} />
          <DetailRow icon={Ship} label="Direction" value={details.direction} />
          <DetailRow icon={Package} label="Cargo" value={details.cargo_description} />
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
          <DetailRow icon={CreditCard} label="Payment" value={details.payment_method} />
          <DetailRow icon={FileText} label="PO Number" value={details.po_number} />
          {details.delivery_address && (
            <DetailRow icon={MapPin} label="Delivery Addr" value={`${details.delivery_address}, ${details.city || ''}`} />
          )}
        </div>
      )}

      {details.required_services && details.required_services.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Required Services</p>
          <div className="flex flex-wrap gap-1.5">
            {details.required_services.map((s) => <Chip key={s} label={s} />)}
          </div>
        </div>
      )}
      {details.preferred_ports && details.preferred_ports.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Preferred Ports / Borders</p>
          <div className="flex flex-wrap gap-1.5">
            {details.preferred_ports.map((p) => <Chip key={p} label={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityDetails({ details }: { details: BookingDetails }) {
  const isQuote = details.quote_request;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50/50 -mx-5 -mb-5 px-5 pb-5 rounded-b-xl">
      <div className="flex items-center gap-2 mb-3">
        {isQuote ? <FileText className="w-4 h-4 text-blue-600" /> : <Shield className="w-4 h-4 text-slate-600" />}
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {isQuote ? 'Security Quote Request' : 'Security Deployment Details'}
        </h4>
      </div>
      {isQuote ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <DetailRow icon={Building2} label="Company" value={details.company_name} />
          <DetailRow icon={Briefcase} label="Position" value={details.position} />
          <DetailRow icon={MapPin} label="Property Type" value={details.property_type} />
          <DetailRow icon={MapPin} label="Property Size" value={details.property_size} />
          <DetailRow icon={Users} label="Staff Size" value={details.staff_size} />
          <DetailRow icon={Clock} label="Contract Term" value={details.contract_term} />
          <DetailRow icon={AlertCircle} label="Response Time" value={details.response_time} />
          <DetailRow icon={Shield} label="Armed Pref" value={details.armed_preference} />
          <DetailRow icon={MapPin} label="Address" value={details.address ? `${details.address}, ${details.city || ''}, ${details.country || ''}` : null} />
          {details.special_requirements && (
            <div className="col-span-full"><DetailRow icon={FileText} label="Requirements" value={details.special_requirements} /></div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <DetailRow icon={Users} label="Contact" value={details.full_name} />
          <DetailRow icon={Users} label="Guards" value={details.guard_count} />
          <DetailRow icon={Clock} label="Shift" value={details.shift_label} />
          <DetailRow icon={Clock} label="Contract" value={details.contract_duration} />
          <DetailRow icon={Building2} label="Site Type" value={details.site_type} />
          <DetailRow icon={AlertCircle} label="Risk Level" value={details.risk_level} />
          <DetailRow icon={MapPin} label="Site Address" value={details.site_address ? `${details.site_address}, ${details.city || ''}` : null} />
          {details.total_sle != null && (
            <DetailRow icon={CreditCard} label="Total" value={`Le ${details.total_sle.toLocaleString()}`} />
          )}
        </div>
      )}
      {details.service_type_labels && details.service_type_labels.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Service Types</p>
          <div className="flex flex-wrap gap-1.5">
            {details.service_type_labels.map(s => <Chip key={s} label={s} />)}
          </div>
        </div>
      )}
      {details.service_scopes && details.service_scopes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Security Services Needed</p>
          <div className="flex flex-wrap gap-1.5">
            {details.service_scopes.map(s => <Chip key={s} label={s} />)}
          </div>
        </div>
      )}
      {details.addon_labels && details.addon_labels.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-1.5">Add-ons</p>
          <div className="flex flex-wrap gap-1.5">
            {details.addon_labels.map(s => <Chip key={s} label={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export function BookingsManagementPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'messages' | 'documents'>('details');

  const fetchBookings = async () => {
    let query = supabase
      .from('bookings')
      .select('*, services(name, slug)')
      .order('created_at', { ascending: false });

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data } = await query;
    let rows = (data as unknown as Booking[]) || [];
    if (modeFilter === 'quote') {
      rows = rows.filter((b) => b.details?.quote_request === true);
    } else if (modeFilter === 'hire') {
      rows = rows.filter((b) => !b.details?.quote_request);
    }
    setBookings(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, [filterStatus, modeFilter]);

  const updateStatus = async (bookingId: string, newStatus: string) => {
    setUpdatingId(bookingId);
    const booking = bookings.find((b) => b.id === bookingId);
    await supabase
      .from('bookings')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (booking) {
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('user_id')
        .eq('id', bookingId)
        .maybeSingle();
      if (bookingData?.user_id) {
        await supabase.from('notifications').insert({
          user_id: bookingData.user_id,
          title: 'Booking Status Updated',
          body: `Your booking for ${booking.services.name} has been updated to "${statusLabels[newStatus]}".`,
          type: 'booking_update',
          booking_id: bookingId,
        });

        // Send email notification (fire-and-forget)
        supabase.functions.invoke('send-booking-email', {
          body: {
            eventType: newStatus === 'completed' ? 'review_prompt' : 'status_update',
            bookingId,
            userId: bookingData.user_id,
            status: newStatus,
            serviceName: booking.services.name,
          },
        }).catch(() => {});
      }
    }

    await fetchBookings();
    setUpdatingId(null);
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Manage Bookings"
        description="Review and update client booking statuses"
        icon={Calendar}
      />

      {/* Mode tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'hire', 'quote'] as ModeFilter[]).map((m) => (
          <button
            key={m}
            onClick={() => setModeFilter(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              modeFilter === m
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {m === 'all' ? 'All Requests' : m === 'hire' ? 'Hire Bookings' : 'Quote Requests'}
          </button>
        ))}
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
          }`}
        >
          All
        </button>
        {allStatuses.map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filterStatus === status ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {statusLabels[status]}
          </button>
        ))}
      </div>

      {/* Bookings */}
      {bookings.length === 0 ? (
        <EmptyState
          icon={XCircle}
          title="No bookings found"
          description={filterStatus !== 'all' || modeFilter !== 'all' ? 'Try changing the filters.' : 'No bookings have been made yet.'}
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const isQuote = booking.details?.quote_request === true;
            const isCF = booking.services?.slug === 'clearing-forwarding';
            const isSecurity = booking.services?.slug === 'private-security';
            const hasDetails = (isCF || isSecurity) && booking.details;
            return (
              <div key={booking.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-slate-900">{booking.services.name}</h3>
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusColors[booking.status]}`}>
                          {statusLabels[booking.status]}
                        </span>
                        {isQuote && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            <FileText className="w-3 h-3" />
                            Quote
                          </span>
                        )}
                        {isCF && !isQuote && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            <Ship className="w-3 h-3" />
                            Hire
                          </span>
                        )}
                        {isSecurity && !isQuote && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            <Shield className="w-3 h-3" />
                            Hire
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-700 mb-2">
                        <span className="font-medium">{booking.contact_name}</span>
                        {booking.details?.company_name && (
                          <span className="text-slate-500"> ({booking.details.company_name})</span>
                        )}
                        {booking.details?.company && (
                          <span className="text-slate-500"> ({booking.details.company})</span>
                        )}
                        <span className="mx-2 text-slate-300">|</span>
                        <span>{booking.contact_phone}</span>
                        {booking.contact_email && (
                          <>
                            <span className="mx-2 text-slate-300">|</span>
                            <span>{booking.contact_email}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(booking.scheduled_date).toLocaleDateString('en-US', {
                            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </span>
                        {booking.scheduled_time && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {booking.scheduled_time}
                          </span>
                        )}
                        {booking.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" />
                            {booking.location}
                          </span>
                        )}
                      </div>
                      {booking.notes && (
                        <p className="mt-2 text-sm text-slate-400">{booking.notes}</p>
                      )}
                    </div>
                    <div className="flex items-start gap-2 flex-shrink-0">
                      {hasDetails && (
                        <button
                          onClick={() => {
                            setExpandedBooking(expandedBooking === booking.id ? null : booking.id);
                            setActiveTab('details');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <Ship className="w-3.5 h-3.5" />
                          Details
                          {expandedBooking === booking.id && activeTab === 'details' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setExpandedBooking(expandedBooking === booking.id ? null : booking.id);
                          setActiveTab('messages');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <Paperclip className="w-3.5 h-3.5" />
                        {expandedBooking === booking.id && activeTab !== 'details' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <select
                        value={booking.status}
                        onChange={(e) => updateStatus(booking.id, e.target.value)}
                        disabled={updatingId === booking.id}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white disabled:opacity-50"
                      >
                        {allStatuses.map((s) => (
                          <option key={s} value={s}>{statusLabels[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {expandedBooking === booking.id && (
                  <div className="border-t border-slate-100">
                    {hasDetails && (
                      <div className="flex border-b border-slate-100">
                        <button
                          onClick={() => setActiveTab('details')}
                          className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${
                            activeTab === 'details'
                              ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/50'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <Ship className="w-3.5 h-3.5 inline mr-1.5" />
                          Shipment Details
                        </button>
                        <button
                          onClick={() => setActiveTab('messages')}
                          className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${
                            activeTab === 'messages'
                              ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/50'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
                          Messages
                        </button>
                        <button
                          onClick={() => setActiveTab('documents')}
                          className={`flex-1 py-3 text-xs font-medium text-center transition-colors ${
                            activeTab === 'documents'
                              ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/50'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <Paperclip className="w-3.5 h-3.5 inline mr-1.5" />
                          Documents
                        </button>
                      </div>
                    )}
                    <div className="p-5">
                      {activeTab === 'details' && hasDetails ? (
                        isSecurity ? <SecurityDetails details={booking.details!} /> : <ShipmentDetails details={booking.details!} />
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
