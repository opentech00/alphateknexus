import { useState } from 'react';
import {
  AlertTriangle, X, Loader2, CheckCircle2, MessageSquare,
  ShieldAlert, Clock, Ban, HelpCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Transaction {
  id: string;
  type: string;
  amount_sle: number;
  description: string | null;
  created_at: string;
}

const REASONS = [
  { id: 'incorrect_amount', label: 'Incorrect Amount', icon: AlertTriangle, desc: 'The charged amount doesn\'t match what I expected' },
  { id: 'duplicate_charge', label: 'Duplicate Charge', icon: Ban, desc: 'I was charged more than once for the same thing' },
  { id: 'service_not_received', label: 'Service Not Received', icon: Clock, desc: 'I paid but never received the service' },
  { id: 'unauthorized', label: 'Unauthorized Transaction', icon: ShieldAlert, desc: 'I did not authorize this transaction' },
  { id: 'other', label: 'Other Issue', icon: HelpCircle, desc: 'Something else went wrong' },
];

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DisputeModal({ transaction, onClose, onSubmitted }: {
  transaction: Transaction;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason'); return; }
    if (description.trim().length < 10) { setError('Please provide more detail (at least 10 characters)'); return; }
    setError('');
    setSubmitting(true);

    const { error: err } = await supabase.from('wallet_disputes').insert({
      transaction_id: transaction.id,
      reason,
      description: description.trim(),
    });

    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => onSubmitted(), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-900">Report an Issue</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Dispute Submitted</h3>
            <p className="text-sm text-slate-500">We'll review your report and get back to you as soon as possible.</p>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              {/* Transaction summary */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium mb-1">Transaction</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{transaction.description || transaction.type}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(transaction.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${Number(transaction.amount_sle) > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {fmtMoney(Number(transaction.amount_sle))}
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              {/* Reason selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">What went wrong?</label>
                <div className="space-y-2">
                  {REASONS.map(r => {
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setReason(r.id); setError(''); }}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                          reason === r.id
                            ? 'border-red-400 bg-red-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${reason === r.id ? 'bg-red-100' : 'bg-slate-50'}`}>
                          <Icon className={`w-4 h-4 ${reason === r.id ? 'text-red-500' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{r.label}</p>
                          <p className="text-xs text-slate-400">{r.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">Tell us more</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Please describe the issue in detail so we can investigate..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">{description.length}/500 characters</p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3.5 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                ) : (
                  <><MessageSquare className="w-5 h-5" /> Submit Dispute</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
