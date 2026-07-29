import { useEffect, useState, useCallback } from 'react';
import {
  Banknote, Loader2, CheckCircle2, XCircle, Clock, MapPin,
  Camera, RefreshCw, ArrowLeft, Receipt,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';

interface CashPayment {
  id: string;
  reference: string;
  amount_sle: number;
  payable_type: string;
  status: string;
  created_at: string;
  client_name: string;
  client_email: string;
  booking_date?: string;
  service_name?: string;
}

interface CollectionRecord {
  id: string;
  status: string;
  amount_received: number;
  created_at: string;
  confirmed_at: string | null;
  rejection_reason: string | null;
  payment_reference: string;
  payment_amount: number;
}

function fmtMoney(n: number) {
  return `SLE ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PAYABLE_LABELS: Record<string, string> = {
  booking: 'Booking',
  invoice: 'Invoice',
  wallet_topup: 'Wallet Top-Up',
  subscription: 'Subscription',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_confirmation: { label: 'Pending', cls: 'bg-amber-50 text-amber-600' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-600' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600' },
};

export function CashCollectionsPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'history' | 'collect'>('list');
  const [pending, setPending] = useState<CashPayment[]>([]);
  const [history, setHistory] = useState<CollectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CashPayment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Collection form
  const [amountReceived, setAmountReceived] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [clientSignature, setClientSignature] = useState('');

  const loadPending = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('payments')
      .select('id, reference, amount_sle, payable_type, payable_id, status, created_at, user_id')
      .eq('method', 'cash')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); setLoading(false); return; }

    const rows = (data || []) as any[];
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    let profileMap: Record<string, { full_name: string; email: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name || '', email: p.email || '' }; });
    }

    const bookingIds = rows.filter(r => r.payable_type === 'booking' && r.payable_id).map(r => r.payable_id);
    let bookingMap: Record<string, { scheduled_date: string; service_name: string }> = {};
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, scheduled_date, services(name)')
        .in('id', [...new Set(bookingIds)]);
      (bookings || []).forEach((b: any) => {
        bookingMap[b.id] = { scheduled_date: b.scheduled_date, service_name: b.services?.name || '' };
      });
    }

    const enriched: CashPayment[] = rows.map(r => {
      const profile = profileMap[r.user_id] || { full_name: '', email: '' };
      const booking = r.payable_type === 'booking' && r.payable_id ? bookingMap[r.payable_id] : null;
      return {
        id: r.id,
        reference: r.reference,
        amount_sle: Number(r.amount_sle),
        payable_type: r.payable_type,
        status: r.status,
        created_at: r.created_at,
        client_name: profile.full_name || 'Unknown',
        client_email: profile.email,
        booking_date: booking?.scheduled_date,
        service_name: booking?.service_name,
      };
    });
    setPending(enriched);
    setLoading(false);
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cash_collections')
      .select('id, status, amount_received, created_at, confirmed_at, rejection_reason, payment_id, payments(reference, amount_sle)')
      .eq('employee_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data || []) as any[];
    const enriched: CollectionRecord[] = rows.map(r => ({
      id: r.id,
      status: r.status,
      amount_received: Number(r.amount_received),
      created_at: r.created_at,
      confirmed_at: r.confirmed_at,
      rejection_reason: r.rejection_reason,
      payment_reference: r.payments?.reference || '',
      payment_amount: Number(r.payments?.amount_sle || 0),
    }));
    setHistory(enriched);
  }, [user]);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  const getLocation = () => {
    setGettingLocation(true);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      setGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
        setGettingLocation(false);
      },
      () => {
        setError('Could not get your location. You can still submit without it.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmitCollection = async () => {
    if (!selected || !user) return;
    const amt = parseFloat(amountReceived);
    if (!amt || amt <= 0) { setError('Enter the amount received'); return; }
    setSubmitting(true);
    setError('');

    const { error: collErr } = await supabase.from('cash_collections').insert({
      payment_id: selected.id,
      employee_id: user.id,
      amount_received: amt,
      gps_lat: gpsLat,
      gps_lng: gpsLng,
      client_signature: clientSignature.trim() || null,
      status: 'pending_confirmation',
    });

    if (collErr) { setError(collErr.message); setSubmitting(false); return; }

    await supabase.from('payments').update({
      status: 'collected',
      collector_id: user.id,
      collected_at: new Date().toISOString(),
    }).eq('id', selected.id);

    setSuccess('Cash collection submitted. An admin will confirm it shortly.');
    setSubmitting(false);
    setSelected(null);
    setAmountReceived('');
    setGpsLat(null);
    setGpsLng(null);
    setClientSignature('');
    setTimeout(() => { setSuccess(''); setView('list'); loadPending(); }, 1800);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-amber-600" /> Cash Collections
          </h1>
          <p className="text-xs text-slate-500">Log cash collected from clients on-site</p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView('list')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          Pending ({pending.length})
        </button>
        <button onClick={() => setView('history')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'history' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          My History
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {success}</div>}

      {/* Pending list */}
      {view === 'list' && (
        loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-amber-500 animate-spin" /></div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <Banknote className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No pending cash collections</p>
            <p className="text-xs text-slate-400 mt-1">Cash payments awaiting collection will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{p.client_name}</p>
                    <p className="text-xs text-slate-400">{p.client_email}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">{PAYABLE_LABELS[p.payable_type] || p.payable_type}</span>
                      <span className="text-[10px] font-mono text-slate-400">{p.reference}</span>
                    </div>
                    {p.service_name && (
                      <p className="text-xs text-slate-500 mt-1">{p.service_name} · {p.booking_date && formatDate(p.booking_date)}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">{fmtMoney(p.amount_sle)}</p>
                    <button onClick={() => { setSelected(p); setAmountReceived(String(p.amount_sle)); setView('collect'); }}
                      className="mt-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors">
                      Collect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* History */}
      {view === 'history' && (
        history.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <Receipt className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No collections yet</p>
            <p className="text-xs text-slate-400 mt-1">Your submitted cash collections will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(h => {
              const meta = STATUS_META[h.status] ?? STATUS_META.pending_confirmation;
              return (
                <div key={h.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{fmtMoney(h.amount_received)}</p>
                      <p className="text-xs text-slate-400 font-mono">{h.payment_reference}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(h.created_at)}</p>
                      {h.rejection_reason && <p className="text-xs text-red-500 mt-1">Rejected: {h.rejection_reason}</p>}
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Collection form */}
      {view === 'collect' && selected && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Banknote className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-bold text-slate-900">Collect Cash</h2>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 mb-4">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Client</span><span className="font-semibold text-slate-800">{selected.client_name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Amount Due</span><span className="font-semibold text-slate-800">{fmtMoney(selected.amount_sle)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Reference</span><span className="font-mono text-xs text-slate-600">{selected.reference}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">For</span><span className="text-slate-600">{PAYABLE_LABELS[selected.payable_type] || selected.payable_type}</span></div>
            </div>

            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount Received (SLE)</label>
            <input type="number" step="0.01" min="0.01" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none mb-4" />

            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Client Name / Signature</label>
            <input type="text" value={clientSignature} onChange={e => setClientSignature(e.target.value)}
              placeholder="Client name as signed"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none mb-4" />

            <div className="mb-4">
              <button onClick={getLocation} disabled={gettingLocation}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50">
                {gettingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                {gpsLat !== null ? `Location captured` : 'Capture GPS Location'}
              </button>
              {gpsLat !== null && (
                <p className="text-xs text-slate-400 mt-1.5">{gpsLat.toFixed(5)}, {gpsLng?.toFixed(5)}</p>
              )}
            </div>

            <button onClick={handleSubmitCollection} disabled={submitting}
              className="w-full py-3.5 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Submit Collection
            </button>
            <button onClick={() => { setSelected(null); setView('list'); }}
              className="w-full py-2.5 mt-2 text-slate-500 text-sm font-medium hover:text-slate-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
