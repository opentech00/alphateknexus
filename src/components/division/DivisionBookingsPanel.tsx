import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import {
  Calendar, MapPin, Clock, Filter, XCircle, MessageSquare, Paperclip,
  ChevronDown, ChevronUp, FileText, Briefcase, CheckCircle2, Users, TrendingUp,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../../lib/supabase';
import { MessageThread } from '../MessageThread';
import { DocumentUpload } from '../DocumentUpload';
import { ServiceDetailsPanel } from '../ServiceDetailsPanel';
import { StatCard } from '../../admin/components/ui';
import { ServiceRequestExportMenu } from '../ServiceRequestExportMenu';
import { bookingToExportRow } from '../../lib/exportServiceRequests';

export interface DivisionConfig {
  name: string;
  slug: string;
  icon: ElementType;
  accentColor: string;
  accentLight: string;
  accentText: string;
  accentBorder: string;
  accentRing: string;
  description: string;
  staff: number;
}

export interface DivisionBooking {
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
  assigned_to?: string | null;
  assigned_employee_id?: string | null;
  services: { name: string; slug: string };
}

export interface DivisionTeammate {
  id: string;
  user_id: string | null;
  full_name: string;
}

export interface DivisionActor {
  id: string;
  name?: string;
  isAdmin?: boolean;
}

const statusColors: Record<string, string> = {
  pending:        'bg-amber-50 text-amber-700 border-amber-200',
  pending_review: 'bg-orange-50 text-orange-700 border-orange-200',
  approved:       'bg-teal-50 text-teal-700 border-teal-200',
  confirmed:      'bg-blue-50 text-blue-700 border-blue-200',
  in_progress:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed:      'bg-slate-50 text-slate-600 border-slate-200',
  cancelled:      'bg-red-50 text-red-700 border-red-200',
};

const statusLabels: Record<string, string> = {
  pending:        'Pending',
  pending_review: 'Pending Review',
  approved:       'Approved',
  confirmed:      'Confirmed',
  in_progress:    'In Progress',
  completed:      'Completed',
  cancelled:      'Cancelled',
};

const allStatuses = ['pending', 'pending_review', 'approved', 'confirmed', 'in_progress', 'completed', 'cancelled'];
type ModeFilter = 'all' | 'hire' | 'quote';

interface Props {
  config: DivisionConfig;
  showHeader?: boolean;
  showAssign?: boolean;
  listVisible?: boolean;
  afterStats?: ReactNode;
  team?: DivisionTeammate[];
  actor?: DivisionActor;
  client?: SupabaseClient;
  onBookingsChange?: (rows: DivisionBooking[]) => void;
}

export function DivisionBookingsPanel({
  config,
  showHeader = true,
  showAssign = false,
  listVisible = true,
  afterStats,
  team: teamProp,
  actor,
  client = defaultClient,
  onBookingsChange,
}: Props) {
  const [bookings, setBookings] = useState<DivisionBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'messages' | 'documents'>('details');
  const [team, setTeam] = useState<DivisionTeammate[]>(teamProp || []);

  const DivIcon = config.icon;

  const fetchBookings = async () => {
    setLoading(true);
    let query = client
      .from('bookings')
      .select('*, services(name, slug)')
      .eq('services.slug', config.slug)
      .order('created_at', { ascending: false });

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    const { data } = await query;
    let rows = ((data as unknown as DivisionBooking[]) || []).filter(
      (b) => b.services?.slug === config.slug,
    );
    if (modeFilter === 'quote') rows = rows.filter((b) => b.details?.quote_request === true);
    else if (modeFilter === 'hire') rows = rows.filter((b) => !b.details?.quote_request);
    if (config.slug === 'waste-management') {
      rows = rows.filter((b) => b.details?.type !== 'smart-sort-quote');
    }
    setBookings(rows);
    onBookingsChange?.(rows);
    setLoading(false);
  };

  useEffect(() => { fetchBookings(); }, [filterStatus, modeFilter, config.slug]);

  useEffect(() => {
    if (teamProp) {
      setTeam(teamProp);
      return;
    }
    if (!showAssign) return;
    (async () => {
      const { data: svc } = await client.from('services').select('id').eq('slug', config.slug).maybeSingle();
      if (!svc?.id) return;
      const { data } = await client
        .from('employees')
        .select('id, user_id, full_name')
        .eq('service_id', svc.id)
        .eq('status', 'active')
        .order('full_name');
      setTeam((data as DivisionTeammate[]) || []);
    })();
  }, [showAssign, config.slug, teamProp, client]);

  const updateStatus = async (bookingId: string, newStatus: string) => {
    setUpdatingId(bookingId);
    const booking = bookings.find((b) => b.id === bookingId);
    await client.from('bookings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', bookingId);
    if (booking) {
      if (actor) {
        await client.rpc('notify_booking_party', {
          p_booking_id: bookingId,
          p_title: 'Booking Status Updated',
          p_body: `Your ${config.name} booking has been updated to "${statusLabels[newStatus]}".`,
          p_type: 'booking_update',
        });
      } else {
        const { data: bd } = await client.from('bookings').select('user_id').eq('id', bookingId).maybeSingle();
        if (bd?.user_id) {
          await client.from('notifications').insert({
            user_id: bd.user_id,
            title: 'Booking Status Updated',
            body: `Your ${config.name} booking has been updated to "${statusLabels[newStatus]}".`,
            type: 'booking_update',
            booking_id: bookingId,
          });
        }
      }
    }
    await fetchBookings();
    setUpdatingId(null);
  };

  const assignTeammate = async (bookingId: string, userId: string) => {
    const member = team.find((t) => t.user_id === userId);
    setUpdatingId(bookingId);
    await client.from('bookings').update({
      assigned_to: userId || null,
      assigned_employee_id: member?.id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', bookingId);
    await fetchBookings();
    setUpdatingId(null);
  };

  const total = bookings.length;
  const pending = bookings.filter((b) => b.status === 'pending').length;
  const active = bookings.filter((b) => ['confirmed', 'in_progress'].includes(b.status)).length;
  const completed = bookings.filter((b) => b.status === 'completed').length;
  const quotes = bookings.filter((b) => b.details?.quote_request === true).length;
  const uniqueClients = new Set(bookings.map((b) => b.contact_phone)).size;
  const assignable = team.filter((t) => t.user_id);

  return (
    <div className={showHeader ? 'max-w-6xl mx-auto' : ''}>
      {showHeader && (
        <div className="flex items-start gap-4 mb-6">
          <div className={`w-12 h-12 ${config.accentLight} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <DivIcon className={`w-6 h-6 ${config.accentText}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{config.name}</h1>
            <p className="mt-0.5 text-slate-500 text-sm">{config.description}</p>
          </div>
          {listVisible && (
            <ServiceRequestExportMenu
              documentTitle={`${config.name} — Client Service Requests`}
              rows={bookings.map(bookingToExportRow)}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={total} icon={Briefcase} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Pending" value={pending} icon={Clock} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Active" value={active} icon={TrendingUp} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Done" value={completed} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Quotes" value={quotes} icon={FileText} color="text-indigo-600" accent="bg-indigo-50" />
        <StatCard label="Clients" value={uniqueClients} icon={Users} color="text-slate-600" accent="bg-slate-50" />
      </div>

      {afterStats}

      {listVisible && (
        <>
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
                const hasDetails = (!!booking.details && Object.keys(booking.details).length > 0) || !!booking.notes;
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

                        <div className="flex items-start gap-2 flex-shrink-0 flex-wrap justify-end">
                          {hasDetails && (
                            <button
                              onClick={() => { setExpandedId(isExpanded && activeTab === 'details' ? null : booking.id); setActiveTab('details'); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Full Details
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
                          {showAssign && assignable.length > 0 && (
                            <select
                              value={booking.assigned_to || ''}
                              onChange={(e) => void assignTeammate(booking.id, e.target.value)}
                              disabled={updatingId === booking.id}
                              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white disabled:opacity-50 cursor-pointer max-w-[160px]"
                            >
                              <option value="">Assign teammate…</option>
                              {assignable.map((t) => (
                                <option key={t.id} value={t.user_id!}>{t.full_name}</option>
                              ))}
                            </select>
                          )}
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
                              Full Details
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
                            <ServiceDetailsPanel
                              details={(booking.details || {}) as Record<string, unknown>}
                              notes={booking.notes}
                              serviceName={booking.services?.name}
                              clientName={booking.contact_name}
                              clientPhone={booking.contact_phone}
                              clientEmail={booking.contact_email}
                              scheduledDate={booking.scheduled_date}
                              scheduledTime={booking.scheduled_time}
                              location={booking.location}
                              submittedAt={booking.created_at}
                            />
                          ) : activeTab === 'messages' ? (
                            <MessageThread bookingId={booking.id} actor={actor} />
                          ) : (
                            <DocumentUpload bookingId={booking.id} serviceSlug={booking.services?.slug} actor={actor} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
