import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, MapPin, Clock, User, Calendar, CheckCircle2, XCircle,
  AlertCircle, Zap, Navigation, Phone,
} from 'lucide-react';
import { useAuth } from '../../contexts/EmployeeAuthContext';
import { supabase } from '../../lib/supabase';

interface DispatchOffer {
  id: string;
  booking_id: string;
  service_id: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  bookings: {
    id: string;
    contact_name: string;
    contact_phone: string;
    location: string;
    notes: string | null;
    scheduled_date: string;
    scheduled_time: string | null;
  } | null;
  services: { name: string } | null;
  my_response: string;
}

function fmtDate(iso: string): string {
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtTime(time: string | null): string {
  if (!time) return 'Any time';
  return time.substring(0, 5);
}

function timeUntil(expiry: string | null): string {
  if (!expiry) return '';
  const diff = new Date(expiry).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m left`;
}

export function DispatchOffersScreen() {
  const { employee, user } = useAuth();
  const [offers, setOffers] = useState<DispatchOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchOffers = useCallback(async () => {
    if (!employee) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from('dispatch_offer_responses')
      .select(`
        id, status,
        offer:dispatch_offers!inner(
          id, booking_id, service_id, status, expires_at, created_at,
          bookings(id, contact_name, contact_phone, location, notes, scheduled_date, scheduled_time),
          services(name)
        )
      `)
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }

    const mapped: DispatchOffer[] = ((data as unknown as Array<{
      id: string;
      status: string;
      offer: {
        id: string;
        booking_id: string;
        service_id: string;
        status: string;
        expires_at: string;
        created_at: string;
        bookings: DispatchOffer['bookings'];
        services: { name: string } | null;
      };
    }>) || []).map(r => ({
      id: r.offer.id,
      booking_id: r.offer.booking_id,
      service_id: r.offer.service_id,
      status: r.offer.status,
      expires_at: r.offer.expires_at,
      created_at: r.offer.created_at,
      bookings: r.offer.bookings,
      services: r.offer.services,
      my_response: r.status,
    }));

    setOffers(mapped);
    setLoading(false);
  }, [employee]);

  useEffect(() => {
    fetchOffers();

    // Realtime: listen for new offer responses
    if (!employee) return;
    const channel = supabase
      .channel('dispatch-offers-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_offer_responses', filter: `employee_id=eq.${employee.id}` },
        () => fetchOffers()
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dispatch_offer_responses', filter: `employee_id=eq.${employee.id}` },
        () => fetchOffers()
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dispatch_offers' },
        () => fetchOffers()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchOffers, employee]);

  const handleAccept = async (offerId: string) => {
    if (!employee) return;
    setActionLoading(offerId);
    setError('');
    setSuccessMsg('');
    const { data, error: err } = await supabase.rpc('accept_dispatch_offer', {
      p_offer_id: offerId,
      p_employee_id: employee.id,
    });
    if (err) { setError(err.message); setActionLoading(null); return; }
    const result = data as { success: boolean; error?: string; assignment_id?: string };
    if (!result.success) { setError(result.error || 'Failed to accept offer'); setActionLoading(null); return; }
    setSuccessMsg('Job accepted! Check your Jobs tab for details.');
    fetchOffers();
    setActionLoading(null);
  };

  const handleDecline = async (offerId: string) => {
    if (!employee) return;
    setActionLoading(offerId);
    setError('');
    setSuccessMsg('');
    const { error: err } = await supabase.rpc('decline_dispatch_offer', {
      p_offer_id: offerId,
      p_employee_id: employee.id,
    });
    if (err) { setError(err.message); setActionLoading(null); return; }
    setSuccessMsg('Offer declined. You will be notified of new jobs as they come in.');
    fetchOffers();
    setActionLoading(null);
  };

  const openOffers = offers.filter(o => o.status === 'open' && o.my_response === 'pending');
  const respondedOffers = offers.filter(o => o.my_response !== 'pending' || o.status !== 'open');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <Zap className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Dispatch Offers</h1>
          <p className="text-sm text-slate-400">Jobs available for you to accept</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>
      ) : openOffers.length === 0 && respondedOffers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Zap className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">No offers right now</h3>
          <p className="text-sm text-slate-500">When clients book a job in your division, you'll see it here instantly.</p>
        </div>
      ) : (
        <>
          {/* Open offers */}
          {openOffers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{openOffers.length} Available {openOffers.length === 1 ? 'Job' : 'Jobs'}</p>
              {openOffers.map(offer => {
                const booking = offer.bookings;
                const timeLeft = timeUntil(offer.expires_at);
                const isExpired = timeLeft === 'Expired';
                return (
                  <div key={offer.id} className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
                    <div className="bg-amber-50 px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" /> NEW JOB OFFER
                      </span>
                      <span className={`text-xs font-semibold ${isExpired ? 'text-red-500' : 'text-amber-600'}`}>
                        {timeLeft}
                      </span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="font-bold text-slate-900 text-base">{offer.services?.name || 'Service'}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User className="w-3.5 h-3.5" /> {booking?.contact_name || 'Customer'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Calendar className="w-3.5 h-3.5" /> {booking ? fmtDate(booking.scheduled_date) : '—'}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Clock className="w-3.5 h-3.5" /> {booking ? fmtTime(booking.scheduled_time) : '—'}
                        </div>
                      </div>
                      {booking?.location && (
                        <div className="flex items-start gap-1.5 text-sm text-slate-600">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" /> {booking.location}
                        </div>
                      )}
                      {booking?.notes && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-xs text-slate-500">{booking.notes}</p>
                        </div>
                      )}
                      {booking?.contact_phone && (
                        <a href={`tel:${booking.contact_phone}`} className="flex items-center gap-1.5 text-sm text-blue-600">
                          <Phone className="w-3.5 h-3.5" /> {booking.contact_phone}
                        </a>
                      )}
                      {booking?.location && (
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(booking.location)}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-sm text-blue-600">
                          <Navigation className="w-3.5 h-3.5" /> Get directions
                        </a>
                      )}
                      {/* Action buttons */}
                      {isExpired ? (
                        <div className="bg-slate-100 rounded-xl py-2.5 text-center text-sm text-slate-400 font-medium">
                          This offer has expired
                        </div>
                      ) : actionLoading === offer.id ? (
                        <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDecline(offer.id)}
                            className="flex-1 py-3 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" /> Decline
                          </button>
                          <button
                            onClick={() => handleAccept(offer.id)}
                            className="flex-1 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Accept Job
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Responded / past offers */}
          {respondedOffers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">History</p>
              {respondedOffers.slice(0, 10).map(offer => {
                const booking = offer.bookings;
                const statusLabel = offer.my_response === 'accepted' ? 'Accepted' : offer.my_response === 'declined' ? 'Declined' : offer.status === 'expired' ? 'Expired' : offer.status === 'accepted' ? 'Taken by another worker' : 'Closed';
                const statusCls = offer.my_response === 'accepted' ? 'bg-emerald-50 text-emerald-700' : offer.my_response === 'declined' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-400';
                return (
                  <div key={offer.id} className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-slate-800 text-sm">{offer.services?.name || 'Service'}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <User className="w-3 h-3" /> {booking?.contact_name || 'Customer'}
                      <span className="mx-1">·</span>
                      <Calendar className="w-3 h-3" /> {booking ? fmtDate(booking.scheduled_date) : '—'}
                    </p>
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
