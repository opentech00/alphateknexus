import { useState } from 'react';
import { Star, X, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ReviewModalProps {
  bookingId: string;
  serviceId: string;
  serviceName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewModal({ bookingId, serviceId, serviceName, onClose, onSuccess }: ReviewModalProps) {
  const { profile } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    setError('');
    setLoading(true);

    const { error: insertError } = await supabase.from('reviews').insert({
      booking_id: bookingId,
      service_id: serviceId,
      rating,
      comment: comment.trim() || null,
      reviewer_name: profile?.full_name || 'Anonymous',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You have already reviewed this booking.');
      } else {
        setError(insertError.message);
      }
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Rate Your Experience</h2>
              <p className="text-emerald-100 text-sm mt-0.5">{serviceName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Star Rating */}
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-slate-600 mb-3">How would you rate this service?</p>
            <div className="flex items-center justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-9 h-9 transition-colors ${
                      star <= (hoveredStar || rating)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            {(hoveredStar || rating) > 0 && (
              <p className="mt-2 text-sm font-medium text-amber-600 transition-all">
                {ratingLabels[hoveredStar || rating]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Share your experience (optional)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you like about the service? Any suggestions for improvement?"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm"
            >
              Maybe Later
            </button>
            <button
              type="submit"
              disabled={loading || rating === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Review
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
