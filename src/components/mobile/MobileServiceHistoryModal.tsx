import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, MapPin, Clock, Search, Star, RotateCcw,
  Loader2, AlertCircle, X, ChevronRight, CheckCircle2,
  FileText, Phone, Mail, Receipt,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BottomSheet } from './BottomSheet';
import { ReviewModal } from '../ReviewModal';

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
  service_id: string;
  details: Record<string, any> | null;
  services: { name: string; icon: string; slug: string };
}

const SERVICE_IMAGES: Record<string, string> = {
  'clearing-forwarding': '/service-clearing-forwarding.webp',
  'procurement': '/service-procurement.webp',
  'private-security': '/service-private-security.webp',
  'cleaning-janitorial': '/service-cleaning-janitorial.webp',
  'waste-management': '/service-smart-sort.webp',
};

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
  pending:     { label: 'Pending',     badge: 'text-amber-700 bg-amber-50 border-amber-200',       dot: 'bg-amber-500' },
  confirmed:   { label: 'Confirmed',   badge: 'text-blue-700 bg-blue-50 border-blue-200',         dot: 'bg-blue-500' },
  in_progress: { label: 'In Progress', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  completed:   { label: 'Completed',   badge: 'text-slate-600 bg-slate-100 border-slate-200',     dot: 'bg-slate-400' },
  cancelled:   { label: 'Cancelled',   badge: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500' },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onRebook?: (booking: Booking) => void;
}

export function MobileServiceHistoryModal({ open, onClose, onRebook }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [reviewModal, setReviewModal] = useState<{ bookingId: string; serviceId: string; serviceName: string } | null>(null);
  const [reviewedBookings, setReviewedBookings] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, icon, slug)')
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false });
    setBookings((data as unknown as Booking[]) || []);
    setLoading(false);
  }, []);

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase.from('reviews').select('booking_id');
    if (data) setReviewedBookings(new Set(data.map((r: any) => r.booking_id)));
  }, []);

  useEffect(() => {
    if (open) {
      fetchHistory();
      fetchReviews();
    }
  }, [open, fetchHistory, fetchReviews]);

  const filtered = bookings.filter((b) => {
    if (filter === 'completed' && b.status !== 'completed') return false;
    if (filter === 'cancelled' && b.status !== 'cancelled') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.services?.name.toLowerCase().includes(q) ||
        (b.location || '').toLowerCase().includes(q) ||
        (b.contact_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const chips: { id: typeof filter; label: string }[] = [
    { id: 'all', label: `All (${bookings.length})` },
    { id: 'completed', label: `Completed (${bookings.filter(b => b.status === 'completed').length})` },
    { id: 'cancelled', label: `Cancelled (${bookings.filter(b => b.status === 'cancelled').length})` },
  ];

  return (
    <>
      <BottomSheet open={open} onClose={onClose} showHandle maxHeightClass="max-h-[92vh]">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900">Service History</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by service, location..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {chips.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilter(c.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                    filter === c.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                  <AlertCircle className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No history found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {search ? 'Try a different search term.' : 'Completed bookings will appear here.'}
                </p>
              </div>
            ) : (
              filtered.map((booking, i) => {
                const sc = statusConfig[booking.status] || statusConfig.pending;
                const serviceImage = SERVICE_IMAGES[booking.services?.slug] || '/service-smart-sort.webp';
                const hasReview = reviewedBookings.has(booking.id);
                return (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                    style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.04}s both` }}
                  >
                    {/* Image banner */}
                    <div className="relative h-14 overflow-hidden">
                      <img
                        src={serviceImage}
                        alt={booking.services?.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${sc.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                      <h3 className="absolute bottom-1.5 left-3 text-sm font-bold text-white drop-shadow">
                        {booking.services?.name}
                      </h3>
                    </div>

                    <div className="p-3.5">
                      {/* Date + time */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(booking.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {booking.scheduled_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {booking.scheduled_time}
                          </span>
                        )}
                      </div>
                      {booking.location && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{booking.location}</span>
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-slate-900">
                          Le {booking.details?.price_sle?.toLocaleString() || '—'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {booking.status === 'completed' && !hasReview && (
                            <button
                              onClick={() => setReviewModal({
                                bookingId: booking.id,
                                serviceId: booking.service_id,
                                serviceName: booking.services?.name,
                              })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-lg border border-amber-200 active:scale-95 transition-transform"
                            >
                              <Star className="w-3 h-3" /> Review
                            </button>
                          )}
                          {booking.status === 'completed' && hasReview && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-600 bg-emerald-50 rounded-full">
                              <Star className="w-3 h-3 fill-emerald-500" /> Reviewed
                            </span>
                          )}
                          <button
                            onClick={() => onRebook?.(booking)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 rounded-lg border border-blue-200 active:scale-95 transition-transform"
                          >
                            <RotateCcw className="w-3 h-3" /> Rebook
                          </button>
                          <button
                            onClick={() => setDetailBooking(booking)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 rounded-lg active:scale-95 transition-transform"
                          >
                            <FileText className="w-3 h-3" />
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Booking Detail Modal */}
      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          hasReview={reviewedBookings.has(detailBooking.id)}
          onClose={() => setDetailBooking(null)}
          onReview={() => {
            setReviewModal({
              bookingId: detailBooking.id,
              serviceId: detailBooking.service_id,
              serviceName: detailBooking.services?.name,
            });
            setDetailBooking(null);
          }}
          onRebook={() => {
            onRebook?.(detailBooking);
            setDetailBooking(null);
            onClose();
          }}
        />
      )}

      {reviewModal && (
        <ReviewModal
          bookingId={reviewModal.bookingId}
          serviceId={reviewModal.serviceId}
          serviceName={reviewModal.serviceName}
          onClose={() => setReviewModal(null)}
          onSuccess={() => {
            setReviewModal(null);
            fetchReviews();
          }}
        />
      )}
    </>
  );
}

/* ── Booking Detail Bottom-Sheet ── */

function BookingDetailModal({
  booking, hasReview, onClose, onReview, onRebook,
}: {
  booking: Booking;
  hasReview: boolean;
  onClose: () => void;
  onReview: () => void;
  onRebook: () => void;
}) {
  const sc = statusConfig[booking.status] || statusConfig.pending;
  const serviceImage = SERVICE_IMAGES[booking.services?.slug] || '/service-smart-sort.webp';
  const bookedOn = new Date(booking.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const scheduledOn = new Date(booking.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-[110] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col animate-slideUp">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Service image banner */}
        <div className="relative h-28 mx-4 mt-3 rounded-2xl overflow-hidden flex-shrink-0">
          <img
            src={serviceImage}
            alt={booking.services?.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <span className={`absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border ${sc.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
            {sc.label}
          </span>
          <div className="absolute bottom-3 left-4">
            <p className="text-white font-bold text-base drop-shadow">{booking.services?.name}</p>
            <p className="text-white/70 text-xs mt-0.5">Booked on {bookedOn}</p>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Scrollable details */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Booking info */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Booking Details</p>
            <DetailRow icon={<Calendar className="w-4 h-4 text-blue-500" />} label="Scheduled" value={scheduledOn} />
            {booking.scheduled_time && (
              <DetailRow icon={<Clock className="w-4 h-4 text-blue-500" />} label="Time" value={booking.scheduled_time} />
            )}
            {booking.location && (
              <DetailRow icon={<MapPin className="w-4 h-4 text-blue-500" />} label="Location" value={booking.location} />
            )}
            {booking.details?.price_sle && (
              <DetailRow icon={<Receipt className="w-4 h-4 text-blue-500" />} label="Amount" value={`Le ${Number(booking.details.price_sle).toLocaleString()}`} />
            )}
          </div>

          {/* Contact info */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contact</p>
            <DetailRow icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} label="Name" value={booking.contact_name} />
            <DetailRow icon={<Phone className="w-4 h-4 text-emerald-500" />} label="Phone" value={booking.contact_phone} />
            {booking.contact_email && (
              <DetailRow icon={<Mail className="w-4 h-4 text-emerald-500" />} label="Email" value={booking.contact_email} />
            )}
          </div>

          {/* Notes */}
          {booking.notes && (
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{booking.notes}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-slate-100 bg-white flex gap-2.5"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
          {booking.status === 'completed' && !hasReview && (
            <button
              onClick={onReview}
              className="flex-1 py-3 bg-amber-50 border border-amber-200 text-amber-700 font-semibold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Star className="w-4 h-4" /> Leave Review
            </button>
          )}
          <button
            onClick={onRebook}
            className="flex-1 py-3 bg-blue-600 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-md shadow-blue-600/20"
          >
            <RotateCcw className="w-4 h-4" /> Rebook
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 bg-white rounded-lg shadow-sm flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-slate-800 font-medium mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}
