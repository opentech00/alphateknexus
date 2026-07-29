import { useEffect, useState, useCallback } from 'react';
import {
  Star, Search, Loader2, RefreshCw, Trash2, MessageSquare, Smartphone,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';

interface Review {
  id: string;
  user_id: string;
  booking_id: string | null;
  service_id: string | null;
  rating: number;
  comment: string | null;
  reviewer_name: string | null;
  created_at: string;
  services: { name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
        />
      ))}
    </div>
  );
}

export function ReviewsManagementPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, avgRating: 0, fiveStar: 0, oneStar: 0, appReviews: 0 });

  const loadReviews = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reviews')
      .select('*, services!reviews_service_id_fkey(name), profiles!reviews_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200);
    setReviews((data as Review[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  useEffect(() => {
    setStats({
      total: reviews.length,
      avgRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0,
      fiveStar: reviews.filter(r => r.rating === 5).length,
      oneStar: reviews.filter(r => r.rating === 1).length,
      appReviews: reviews.filter(r => !r.service_id && !r.booking_id).length,
    });
  }, [reviews]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this review? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('reviews').delete().eq('id', id);
    setReviews(prev => prev.filter(r => r.id !== id));
    setDeletingId(null);
  };

  const isAppReview = (r: Review) => !r.service_id && !r.booking_id;

  const filtered = reviews.filter(r => {
    if (typeFilter === 'app' && !isAppReview(r)) return false;
    if (typeFilter === 'service' && isAppReview(r)) return false;
    if (ratingFilter !== 'all' && r.rating !== parseInt(ratingFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = r.profiles?.full_name || r.reviewer_name || '';
      const email = r.profiles?.email || '';
      const service = r.services?.name || '';
      return name.toLowerCase().includes(q) ||
             email.toLowerCase().includes(q) ||
             service.toLowerCase().includes(q) ||
             (r.comment || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Client Reviews"
        description="Monitor and moderate client feedback across all services"
        icon={Star}
        actions={
          <button
            onClick={loadReviews}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL REVIEWS" value={String(stats.total)} icon={MessageSquare} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="AVG RATING" value={stats.avgRating.toFixed(1)} icon={Star} color="text-amber-500" accent="bg-amber-50" />
        <StatCard label="5-STAR REVIEWS" value={String(stats.fiveStar)} icon={Star} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="APP REVIEWS" value={String(stats.appReviews)} icon={Smartphone} color="text-blue-500" accent="bg-blue-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, service, or comment…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="all">All Types</option>
          <option value="service">Service Reviews</option>
          <option value="app">App Reviews</option>
        </select>
        <select
          value={ratingFilter}
          onChange={e => setRatingFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="all">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
            <Star className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No reviews found</h3>
          <p className="mt-2 text-sm text-slate-400">Client reviews will appear here once submitted.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-700 font-semibold text-sm">
                      {(r.profiles?.full_name || r.reviewer_name || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{r.profiles?.full_name || r.reviewer_name || 'Anonymous'}</p>
                      <StarRating rating={r.rating} />
                      {isAppReview(r) ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
                          <Smartphone className="w-3 h-3" /> App
                        </span>
                      ) : r.services?.name ? (
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                          {r.services.name}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.profiles?.email || ''} · {formatDate(r.created_at)}
                    </p>
                    {r.comment && (
                      <p className="text-sm text-slate-600 mt-2 leading-relaxed">{r.comment}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deletingId === r.id}
                  title="Delete review"
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
