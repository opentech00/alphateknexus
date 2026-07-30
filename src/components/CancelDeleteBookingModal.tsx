import { useState } from 'react';
import { X, AlertTriangle, Loader2, Trash2, Ban } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  bookingId: string;
  bookingStatus: string;
  serviceName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CANCEL_REASONS = [
  'Schedule conflict — no longer need the service',
  'Found an alternative provider',
  'No longer required for my business',
  'Budget constraints',
  'Incorrect booking details — will rebook',
  'Other',
];

export function CancelDeleteBookingModal({
  bookingId, bookingStatus, serviceName, onClose, onSuccess,
}: Props) {
  const isCompleted = bookingStatus === 'completed';
  const isCancelled = bookingStatus === 'cancelled';
  const canCancel = !isCompleted && !isCancelled;
  const canDelete = isCompleted || isCancelled;

  const [mode, setMode] = useState<'cancel' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCancel = async () => {
    setError('');
    const finalReason = reason === 'Other' ? customReason.trim() : reason;
    if (!finalReason) {
      setError('Please select a reason for cancelling this booking.');
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: finalReason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }

    await supabase.from('notifications').insert({
      title: 'Booking Cancelled',
      body: `Your ${serviceName} booking has been cancelled. Reason: ${finalReason}`,
      type: 'booking_update',
      booking_id: bookingId,
    });

    setSubmitting(false);
    onSuccess();
  };

  const handleDelete = async () => {
    setError('');
    setSubmitting(true);
    const { error: err } = await supabase
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">Manage Booking</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {!mode && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 mb-4">
                <span className="font-semibold text-slate-700">{serviceName}</span> — choose an action below.
              </p>
              {canCancel && (
                <button
                  onClick={() => setMode('cancel')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
                >
                  <Ban className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Cancel Booking</p>
                    <p className="text-xs text-slate-500 mt-0.5">Cancel with a reason. The booking will be marked as cancelled.</p>
                  </div>
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setMode('delete')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-left"
                >
                  <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Delete Booking</p>
                    <p className="text-xs text-slate-500 mt-0.5">Permanently remove this {bookingStatus} booking from your list.</p>
                  </div>
                </button>
              )}
              {!canCancel && !canDelete && (
                <p className="text-sm text-slate-500 text-center py-4">No actions available for this booking.</p>
              )}
            </div>
          )}

          {mode === 'cancel' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">Reason for Cancellation</label>
                <div className="space-y-2">
                  {CANCEL_REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                        reason === r
                          ? 'border-amber-500 bg-amber-50 text-slate-800 font-medium'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {reason === 'Other' && (
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Explain your reason..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setMode(null); setReason(''); setCustomReason(''); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleCancel}
                  disabled={submitting}
                  className="flex-1 py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  Confirm Cancel
                </button>
              </div>
            </div>
          )}

          {mode === 'delete' && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700 leading-relaxed">
                  This will permanently remove the <span className="font-semibold">{serviceName}</span> booking from your list.
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMode(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleDelete}
                  disabled={submitting}
                  className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Permanently
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
