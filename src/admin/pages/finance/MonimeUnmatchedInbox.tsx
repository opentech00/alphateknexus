import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface UnmatchedEvent {
  id: string;
  event_id: string | null;
  event_name: string;
  outcome: string;
  session_id: string | null;
  reference: string | null;
  related_id: string | null;
  amount_minor: number | null;
  created_at: string;
}

function formatWhen(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** HMAC-valid Monime webhooks that matched no local payment. */
export function MonimeUnmatchedInbox({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<UnmatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refById, setRefById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('monime_webhook_unmatched')
      .select('id, event_id, event_name, outcome, session_id, reference, related_id, amount_minor, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) setError(err.message);
    else { setError(''); setRows((data || []) as UnmatchedEvent[]); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const close = async (row: UnmatchedEvent, status: 'resolved' | 'dismissed', note: string, matchedId?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from('monime_webhook_unmatched')
      .update({
        status,
        note,
        matched_payment_id: matchedId || null,
        resolved_by: user?.id || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (err) throw new Error(err.message);
  };

  const match = async (row: UnmatchedEvent) => {
    const reference = (refById[row.id] ?? row.reference ?? '').trim();
    if (!reference) { setMessage('Enter the local payment reference to match.'); return; }
    setBusyId(row.id);
    setMessage('');
    try {
      const { data: local } = await supabase
        .from('monime_payments')
        .select('id')
        .eq('reference', reference)
        .maybeSingle();
      if (!local) throw new Error(`No local payment with reference ${reference}.`);
      const { data, error: err } = await supabase.functions.invoke('verify-monime-payment', { body: { reference } });
      if (err) throw new Error(err.message || 'Verify failed');
      if (data?.status !== 'completed' && row.outcome === 'completed') {
        throw new Error(`Monime reports ${reference} as ${data?.status || 'unknown'}, not completed.`);
      }
      await close(row, 'resolved', `Matched to ${reference} (${data?.status})`, local.id);
      setMessage(`${reference} is ${data?.status}. Event closed.`);
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not match this event.');
    }
    setBusyId(null);
  };

  const dismiss = async (row: UnmatchedEvent) => {
    const note = window.prompt('Why is this event safe to dismiss?');
    if (!note?.trim()) return;
    setBusyId(row.id);
    try {
      await close(row, 'dismissed', note.trim());
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not dismiss.');
    }
    setBusyId(null);
  };

  if (!loading && !error && rows.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-bold text-slate-900">Unmatched Monime events</h3>
        <span className="text-xs text-slate-500">Signed webhooks with no local payment. Completed ones may be money received.</span>
      </div>
      {error && <p className="px-5 py-3 text-sm text-red-700">{error}</p>}
      {message && <p className="px-5 py-3 text-sm text-slate-700 bg-slate-50 border-b border-slate-100">{message}</p>}
      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                    row.outcome === 'completed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                  }`}>{row.outcome}</span>
                  <span className="text-xs font-mono text-slate-500">{row.event_name || 'unknown event'}</span>
                  {row.amount_minor != null && (
                    <span className="text-sm font-bold text-slate-800">SLE {(row.amount_minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {formatWhen(row.created_at)} · session {row.session_id || '—'} · ref {row.reference || '—'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    aria-label="Local reference"
                    value={refById[row.id] ?? row.reference ?? ''}
                    onChange={(e) => setRefById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="Local reference"
                    className="pl-8 pr-3 py-1.5 w-48 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void match(row)}
                  disabled={busyId === row.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busyId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Match & verify
                </button>
                <button
                  type="button"
                  onClick={() => void dismiss(row)}
                  disabled={busyId === row.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
