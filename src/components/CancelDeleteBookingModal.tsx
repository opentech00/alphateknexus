import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  const [mode, setMode] = useState<'cancel' | 'delete' | null>(
    canCancel && !canDelete ? 'cancel' : canDelete && !canCancel ? 'delete' : null,
  );
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

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
      setError('We could not cancel this booking. Please try again.');
      setSubmitting(false);
      return;
    }

    await supabase.rpc('refund_booking_to_wallet', { p_booking_id: bookingId });

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
      setError('We could not delete this booking. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSuccess();
  };

  const title = mode === 'cancel'
    ? 'Cancel Booking'
    : mode === 'delete'
      ? 'Delete Booking'
      : 'Manage Booking';

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{ height: '100dvh' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-action-title"
      onTouchMove={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(88dvh, calc(100dvh - 1.5rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <h2 id="booking-action-title" className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-500 truncate">{serviceName}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 mobile-scroll">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          {!mode && (
            <div className="space-y-3 pb-2">
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setMode('cancel')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-left active:scale-[0.99]"
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
                  type="button"
                  onClick={() => setMode('delete')}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-left active:scale-[0.99]"
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
            <div>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                Reason for cancellation
              </label>
              <div className="space-y-2">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                      reason === r
                        ? 'border-amber-500 bg-amber-50 text-slate-800 font-medium'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {reason === 'Other' && (
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Explain your reason..."
                  rows={3}
                  className="mt-3 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              )}
            </div>
          )}

          {mode === 'delete' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700 leading-relaxed">
                This will permanently remove the <span className="font-semibold">{serviceName}</span> booking from your list.
                This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        <div
          className="flex-shrink-0 px-5 pt-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {!mode && (
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm"
            >
              Close
            </button>
          )}

          {mode === 'cancel' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (canDelete) {
                    setMode(null);
                    setReason('');
                    setCustomReason('');
                  } else {
                    onClose();
                  }
                }}
                className="flex-1 min-h-[44px] py-3 bg-slate-100 text-slate-700 font-medium rounded-xl text-sm"
              >
                {canDelete ? 'Back' : 'Keep booking'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="flex-1 min-h-[44px] py-3 bg-amber-600 text-white font-semibold rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                Confirm Cancel
              </button>
            </div>
          )}

          {mode === 'delete' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (canCancel) setMode(null);
                  else onClose();
                }}
                className="flex-1 min-h-[44px] py-3 bg-slate-100 text-slate-700 font-medium rounded-xl text-sm"
              >
                {canCancel ? 'Back' : 'Keep booking'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="flex-1 min-h-[44px] py-3 bg-red-600 text-white font-semibold rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
