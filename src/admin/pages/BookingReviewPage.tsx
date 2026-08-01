import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, EmptyState, Spinner, ErrorBanner, TableShell } from '../components/ui';
import {
  ClipboardCheck, CheckCircle2, XCircle, Clock, Filter, Search,
  Calendar, Phone, Mail, MapPin, User, Briefcase, FileText, Loader2,
} from 'lucide-react';

interface ReviewBooking {
  id: string;
  service_id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  details: Record<string, unknown> | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  services: { name: string } | null;
}

export function BookingReviewPage() {
  const [bookings, setBookings] = useState<ReviewBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('pending_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<ReviewBooking | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('bookings')
        .select('id, service_id, contact_name, contact_phone, contact_email, scheduled_date, scheduled_time, location, notes, status, details, created_at, reviewed_by, reviewed_at, review_note, services(name)')
        .in('status', ['pending_review', 'approved', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error: err } = await query;
      if (err) throw err;
      setBookings((data || []) as unknown as ReviewBooking[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('admin_booking_review')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { loadBookings(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadBookings]);

  const handleApprove = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('bookings')
        .update({
          status: 'approved',
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
      if (err) throw err;

      // Notify the customer
      const booking = bookings.find(b => b.id === bookingId);
      if (booking && user) {
        await supabase.from('notifications').insert({
          user_id: booking.contact_name,
          title: 'Booking Approved',
          body: `Your ${booking.services?.name || 'service'} booking has been approved. You can now proceed to payment.`,
          type: 'booking_update',
          booking_id: bookingId,
        });
      }

      setReviewNote('');
      setSelectedBooking(null);
      loadBookings();
    } catch (err: any) {
      setError(err.message || 'Failed to approve booking');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
      if (err) throw err;

      const booking = bookings.find(b => b.id === bookingId);
      if (booking && user) {
        await supabase.from('notifications').insert({
          user_id: booking.contact_name,
          title: 'Booking Rejected',
          body: `Your ${booking.services?.name || 'service'} booking request was not approved. ${reviewNote || 'Please contact us for more information.'}`,
          type: 'booking_update',
          booking_id: bookingId,
        });
      }

      setReviewNote('');
      setSelectedBooking(null);
      loadBookings();
    } catch (err: any) {
      setError(err.message || 'Failed to reject booking');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = bookings.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        b.contact_name?.toLowerCase().includes(q) ||
        b.contact_phone?.includes(q) ||
        b.services?.name?.toLowerCase().includes(q) ||
        b.location?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingCount = bookings.filter(b => b.status === 'pending_review').length;
  const approvedCount = bookings.filter(b => b.status === 'approved').length;
  const rejectedCount = bookings.filter(b => b.status === 'cancelled').length;

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <PageHeader
        title="Booking Review"
        description="Review and approve customer booking requests before they proceed to payment"
        icon={ClipboardCheck}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Pending Review" value={pendingCount} icon={Clock} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Approved" value={approvedCount} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Rejected" value={rejectedCount} icon={XCircle} color="text-rose-600" accent="bg-rose-50" />
        <StatCard label="Total" value={bookings.length} icon={Briefcase} color="text-slate-600" accent="bg-slate-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[
            { key: 'pending_review', label: 'Pending', color: 'amber' },
            { key: 'approved', label: 'Approved', color: 'emerald' },
            { key: 'cancelled', label: 'Rejected', color: 'rose' },
            { key: 'all', label: 'All', color: 'slate' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, service, or location..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No bookings to review" description="Customer booking requests awaiting approval will appear here" />
      ) : (
        <div className="space-y-3">
          {filtered.map(booking => (
            <Card key={booking.id} className="p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColor(booking.status)}`}>
                      {statusLabel(booking.status)}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(booking.created_at).toLocaleString()}</span>
                  </div>
                  <p className="font-semibold text-sm text-slate-900">{booking.services?.name || 'Unknown Service'}</p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><User className="w-3 h-3 text-slate-400" />{booking.contact_name}</span>
                    <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" />{booking.contact_phone}</span>
                    {booking.contact_email && <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" />{booking.contact_email}</span>}
                    {booking.location && <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-slate-400" />{booking.location}</span>}
                    <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3 text-slate-400" />{booking.scheduled_date} {booking.scheduled_time || ''}</span>
                  </div>
                  {booking.notes && (
                    <p className="mt-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-2">{booking.notes}</p>
                  )}
                  {booking.review_note && (
                    <p className="mt-2 text-xs text-slate-500 bg-amber-50 rounded-lg p-2 border border-amber-100">
                      <FileText className="w-3 h-3 inline mr-1 text-amber-500" />Review note: {booking.review_note}
                    </p>
                  )}
                </div>

                {/* Actions */}
                {booking.status === 'pending_review' && (
                  <div className="flex flex-col gap-2 lg:w-64">
                    {selectedBooking?.id === booking.id ? (
                      <>
                        <textarea
                          value={reviewNote}
                          onChange={e => setReviewNote(e.target.value)}
                          placeholder="Add a review note (optional)..."
                          rows={2}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(booking.id)}
                            disabled={actionLoading === booking.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === booking.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(booking.id)}
                            disabled={actionLoading === booking.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === booking.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Reject
                          </button>
                        </div>
                        <button
                          onClick={() => { setSelectedBooking(null); setReviewNote(''); }}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setSelectedBooking(booking); setReviewNote(''); }}
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" /> Review Booking
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return map[status] || 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_review: 'Pending Review',
    approved: 'Approved',
    cancelled: 'Rejected',
  };
  return map[status] || status;
}
