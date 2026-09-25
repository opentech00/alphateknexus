import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FileText, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/toast/toast';
import { BookingPayNowModal } from '../components/BookingPayNowModal';
import { PortalPage } from '../components/portal/PortalPage';
import { moneySLE } from '../lib/money';
import { bookingDepositAmount, bookingDueAmount, bookingNeedsPayment, bookingPayAmount } from '../lib/bookingPay';

interface QuoteRow {
  id: string;
  status: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  payment_status: string | null;
  amount_paid_sle: number | null;
  details: Record<string, unknown> | null;
  services: { name: string; slug: string } | null;
}

function isQuote(details: Record<string, unknown> | null) {
  const flag = details?.quote_request;
  return flag === true || flag === 'true' || flag === 't' || flag === 1;
}

function stage(row: QuoteRow): { label: string; tone: string } {
  if (row.status === 'cancelled') return { label: 'Declined', tone: 'bg-red-50 text-red-700' };
  if (['confirmed', 'in_progress', 'completed'].includes(row.status)) return { label: 'Accepted', tone: 'bg-emerald-50 text-emerald-700' };
  const priced = bookingPayAmount({ details: row.details }, 0) > 0 && row.status === 'approved';
  if (priced) return { label: 'Ready to accept', tone: 'bg-blue-50 text-blue-700' };
  return { label: 'Waiting for a price', tone: 'bg-amber-50 text-amber-800' };
}

export function QuotesPage({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paying, setPaying] = useState<QuoteRow | null>(null);
  const [filter, setFilter] = useState<'open' | 'done'>('open');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('bookings')
      .select('id, status, location, notes, created_at, payment_status, amount_paid_sle, details, services(name, slug)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setRows(((data || []) as unknown as QuoteRow[]).filter((r) => isQuote(r.details)));
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((r) => {
    const done = r.status === 'cancelled' || r.status === 'completed';
    return filter === 'done' ? done : !done;
  }), [rows, filter]);

  const respond = async (row: QuoteRow, action: 'accept' | 'decline') => {
    setBusyId(row.id);
    const { data, error: err } = await supabase.rpc('respond_to_quote', {
      p_booking_id: row.id,
      p_action: action,
    });
    setBusyId(null);
    if (err || data?.success === false) {
      toast.error(data?.error || err?.message || 'Could not update the quote');
      return;
    }
    if (action === 'accept') {
      toast.success('Quote accepted');
      const next = { ...row, status: 'confirmed' };
      if (bookingNeedsPayment(next)) setPaying(next);
    } else {
      toast.success('Quote declined');
    }
    await load();
  };

  return (
    <PortalPage
      title="Quotes"
      subtitle="Prices from Alphatek. Accept to book and pay, or decline."
      onBack={onBack}
    >
      <div role="tablist" aria-label="Quote filter" className="flex gap-2">
        {(['open', 'done'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              filter === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {id === 'open' ? 'Open' : 'Closed'}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-label="Loading quotes" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="font-semibold text-slate-800">No quotes here</p>
          <p className="text-sm text-slate-500 mt-1">Request a quote from any service and it will land in this inbox.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((row, i) => {
            const meta = stage(row);
            const amount = bookingPayAmount({ details: row.details }, 0);
            const due = bookingDueAmount(row, 0);
            const deposit = bookingDepositAmount(row);
            const canDecide = row.status === 'approved' && amount > 0;
            const canWithdraw = ['pending', 'pending_review', 'approved'].includes(row.status);
            return (
              <li
                key={row.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 motion-safe:animate-[fadeInUp_0.35s_ease]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{row.services?.name || 'Service quote'}</h2>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.tone}`}>{meta.label}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {row.location ? ` · ${row.location}` : ''}
                </p>
                {row.notes && <p className="text-sm text-slate-600 mt-2 line-clamp-3">{row.notes}</p>}
                <p className="mt-3 text-lg font-bold text-slate-900">{amount > 0 ? moneySLE(amount) : 'Price pending'}</p>
                {deposit !== null && (
                  <p className="text-sm text-slate-500">Deposit to start: {moneySLE(deposit)}</p>
                )}
                {row.payment_status === 'deposit_paid' && (
                  <p className="text-sm text-emerald-700">Deposit received · balance {moneySLE(due)}</p>
                )}
                {canWithdraw && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canDecide && (
                      <button type="button" disabled={busyId === row.id} onClick={() => void respond(row, 'accept')} className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
                        <Check className="w-4 h-4" aria-hidden="true" /> {deposit !== null ? 'Accept and pay deposit' : 'Accept and pay'}
                      </button>
                    )}
                    <button type="button" disabled={busyId === row.id} onClick={() => void respond(row, 'decline')} className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
                      <X className="w-4 h-4" aria-hidden="true" /> Decline
                    </button>
                  </div>
                )}
                {row.status === 'confirmed' && bookingNeedsPayment(row) && (
                  <button type="button" onClick={() => setPaying(row)} className="mt-4 min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    {row.payment_status === 'deposit_paid' ? `Pay balance ${moneySLE(due)}` : `Pay ${moneySLE(due)}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {paying && (
        <BookingPayNowModal
          bookingId={paying.id}
          amount={bookingDueAmount(paying, 0)}
          depositAmount={bookingDepositAmount(paying)}
          nextPage="quotes"
          serviceName={paying.services?.name || 'Quote'}
          serviceSlug={paying.services?.slug}
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); void load(); }}
        />
      )}
    </PortalPage>
  );
}
