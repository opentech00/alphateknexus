import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Loader2, QrCode, RefreshCw, Share2, Smartphone, X } from 'lucide-react';
import {
  fieldCollectionStatus,
  fieldCollectionSummary,
  startFieldCollection,
  type FieldCollectionSummary,
} from '../../lib/fieldCollection';

const POLL_MS = 4000;
const POLL_LIMIT = 150;

function qrImageUrl(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`;
}

export function FieldCollectPanel({ bookingId }: { bookingId: string }) {
  const [summary, setSummary] = useState<FieldCollectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<{ url: string; reference: string; amount: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'paid' | 'failed'>('idle');
  const polls = useRef(0);
  const timer = useRef<number | null>(null);

  const stopPolling = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fieldCollectionSummary(bookingId);
      setSummary(data);
      setError('');
      if (data.pending?.checkout_url) {
        setSession({ url: data.pending.checkout_url, reference: data.pending.reference, amount: Number(data.pending.amount_sle) });
        setStatus('waiting');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payment status.');
    }
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { void loadSummary(); return stopPolling; }, [loadSummary]);

  const poll = useCallback((reference: string) => {
    stopPolling();
    timer.current = window.setTimeout(async () => {
      polls.current += 1;
      try {
        const res = await fieldCollectionStatus(bookingId, reference);
        setSummary(res);
        if (res.status === 'completed') { setStatus('paid'); return; }
        if (res.status === 'failed' || res.status === 'cancelled') { setStatus('failed'); return; }
      } catch {
        /* transient; keep polling */
      }
      if (polls.current < POLL_LIMIT) poll(reference);
    }, POLL_MS);
  }, [bookingId]);

  useEffect(() => {
    if (status === 'waiting' && session) {
      polls.current = 0;
      poll(session.reference);
    }
    return stopPolling;
  }, [status, session, poll]);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await startFieldCollection(bookingId);
      setSession({ url: res.checkoutUrl, reference: res.reference, amount: Number(res.amount) });
      setSummary(res);
      setStatus('waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment.');
    }
    setCreating(false);
  };

  const share = async () => {
    if (!session) return;
    const text = `Pay Le ${session.amount.toLocaleString()} to Alphatek Nexus securely with Monime: ${session.url}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Alphatek Nexus payment', text, url: session.url }); return; } catch { /* cancelled */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const copy = async () => {
    if (!session) return;
    try { await navigator.clipboard.writeText(session.url); } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking payment…
      </div>
    );
  }

  const due = summary?.due ?? 0;
  const settled = status === 'paid' || due <= 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-900">Collect payment</h3>
        {summary?.payment_status === 'deposit_paid' && !settled && (
          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Deposit paid</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {settled ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4" /> Paid in full. Nothing to collect.
        </div>
      ) : !session || status === 'failed' ? (
        <>
          <p className="text-sm text-slate-600">
            Balance due: <span className="font-bold text-slate-900">Le {due.toLocaleString()}</span>
          </p>
          {status === 'failed' && <p className="text-xs text-amber-700">The last checkout was not completed. Start a new one.</p>}
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Show Monime payment QR
          </button>
          <p className="text-[11px] text-slate-400">The customer scans and pays on their own phone. Cash stays available if they prefer.</p>
        </>
      ) : (
        <div className="space-y-3 text-center animate-scaleIn">
          <p className="text-sm text-slate-600">
            Ask the customer to scan and pay <span className="font-bold text-slate-900">Le {session.amount.toLocaleString()}</span>
          </p>
          <img src={qrImageUrl(session.url)} alt="Monime payment QR code" width={240} height={240} className="mx-auto w-full max-w-[240px] h-auto rounded-2xl border border-slate-200 shadow-sm" />
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for Monime to confirm…
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => void share()} className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 active:scale-[0.98] transition-transform">
              <Share2 className="w-3.5 h-3.5" /> Send
            </button>
            <button type="button" onClick={() => void copy()} className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 active:scale-[0.98] transition-transform">
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            <button type="button" onClick={() => { polls.current = 0; poll(session.reference); }} className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 active:scale-[0.98] transition-transform">
              <RefreshCw className="w-3.5 h-3.5" /> Check
            </button>
          </div>
          <button type="button" onClick={() => { stopPolling(); setSession(null); setStatus('idle'); }} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <X className="w-3 h-3" /> Close QR
          </button>
          <p className="text-[10px] font-mono text-slate-400">{session.reference}</p>
        </div>
      )}
    </div>
  );
}
