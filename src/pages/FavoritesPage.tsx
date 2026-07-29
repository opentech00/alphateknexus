import { useEffect, useState } from 'react';
import {
  Heart, Star, Plus, Trash2, MapPin, Phone, Mail, User,
  Zap, Loader2, X, ArrowRight, Briefcase,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface FavoriteService {
  favorite_id: string;
  service_id: string;
  service_name: string;
  service_slug: string;
  service_icon: string;
  service_description: string;
  service_price_range: string;
  avg_rating: number | null;
  review_count: number;
}

interface Preset {
  id: string;
  label: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  location: string | null;
}

interface FavoritesPageProps {
  onNavigate: (page: string) => void;
  onQuickBook: (serviceId: string, preset: Preset) => void;
}

export function FavoritesPage({ onNavigate, onQuickBook }: FavoritesPageProps) {
  const { profile } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteService[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [activePresetForBooking, setActivePresetForBooking] = useState<Preset | null>(null);
  const [selectedServiceForBooking, setSelectedServiceForBooking] = useState<FavoriteService | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [favRes, presetRes, reviewRes] = await Promise.all([
      supabase
        .from('favorites')
        .select('id, service_id, services(name, slug, icon, description, price_range)')
        .order('created_at', { ascending: false }),
      supabase.from('booking_presets').select('*').order('created_at', { ascending: false }),
      supabase.from('reviews').select('service_id, rating'),
    ]);

    const reviewMap: Record<string, { total: number; count: number }> = {};
    (reviewRes.data || []).forEach((r: any) => {
      if (!reviewMap[r.service_id]) reviewMap[r.service_id] = { total: 0, count: 0 };
      reviewMap[r.service_id].total += r.rating;
      reviewMap[r.service_id].count += 1;
    });

    const favs: FavoriteService[] = (favRes.data as any[] || []).map((f) => {
      const review = reviewMap[f.service_id];
      return {
        favorite_id: f.id,
        service_id: f.service_id,
        service_name: f.services?.name || '',
        service_slug: f.services?.slug || '',
        service_icon: f.services?.icon || '',
        service_description: f.services?.description || '',
        service_price_range: f.services?.price_range || '',
        avg_rating: review ? Math.round((review.total / review.count) * 10) / 10 : null,
        review_count: review?.count || 0,
      };
    });

    setFavorites(favs);
    setPresets((presetRes.data as Preset[]) || []);
    setLoading(false);
    setTimeout(() => setAnimateIn(true), 50);
  };

  const removeFavorite = async (favoriteId: string) => {
    setFavorites((prev) => prev.filter((f) => f.favorite_id !== favoriteId));
    await supabase.from('favorites').delete().eq('id', favoriteId);
  };

  const deletePreset = async (presetId: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== presetId));
    await supabase.from('booking_presets').delete().eq('id', presetId);
  };

  const startQuickBook = (service: FavoriteService, preset: Preset) => {
    onQuickBook(service.service_id, preset);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 transition-all duration-500 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            Favorites & Quick Book
          </h1>
          <p className="mt-1 text-slate-500 text-sm">Save services and presets to book in seconds</p>
        </div>
        <button
          onClick={() => setShowPresetModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          New Preset
        </button>
      </div>

      {/* Saved Presets */}
      <div className={`mb-8 transition-all duration-500 delay-100 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Saved Details</h2>
        {presets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-6 text-center">
            <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No presets yet. Create one to save contact details and locations for faster booking.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {presets.map((preset) => (
              <div key={preset.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{preset.label}</p>
                      <p className="text-xs text-slate-400">Quick Book preset</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <p className="flex items-center gap-2"><User className="w-3 h-3" /> {preset.contact_name}</p>
                  <p className="flex items-center gap-2"><Phone className="w-3 h-3" /> {preset.contact_phone}</p>
                  {preset.location && <p className="flex items-center gap-2"><MapPin className="w-3 h-3" /> {preset.location}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favorite Services */}
      <div className={`transition-all duration-500 delay-200 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Favorite Services</h2>
        {favorites.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-rose-50 rounded-full mb-4">
              <Heart className="w-6 h-6 text-rose-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No favorites yet</h3>
            <p className="mt-2 text-slate-500 text-sm max-w-sm mx-auto">
              Tap the heart icon on any service to save it here for quick access.
            </p>
            <button
              onClick={() => onNavigate('services')}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-sm"
            >
              <Briefcase className="w-4 h-4" />
              Browse Services
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {favorites.map((fav) => (
              <div key={fav.favorite_id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{fav.service_name}</h3>
                      <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                    </div>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{fav.service_description}</p>
                  </div>
                  <button
                    onClick={() => removeFavorite(fav.favorite_id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-4 text-xs">
                  <span className="font-semibold text-slate-700">{fav.service_price_range}</span>
                  {fav.avg_rating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span className="font-semibold text-amber-600">{fav.avg_rating}</span>
                      <span className="text-slate-400">({fav.review_count})</span>
                    </span>
                  )}
                </div>

                {/* Quick Book with preset */}
                {presets.length > 0 ? (
                  <div>
                    <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-500" />
                      Quick Book with:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => startQuickBook(fav, preset)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors active:scale-95"
                        >
                          <Zap className="w-3 h-3" />
                          {preset.label}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onNavigate('services')}
                    className="text-xs text-emerald-600 font-medium hover:text-emerald-700"
                  >
                    Create a preset to enable Quick Book
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preset Modal */}
      {showPresetModal && (
        <PresetModal
          onClose={() => setShowPresetModal(false)}
          onSuccess={() => {
            setShowPresetModal(false);
            fetchData();
          }}
          defaultName={profile?.full_name || ''}
          defaultPhone={profile?.phone || ''}
        />
      )}
    </div>
  );
}

// --- Preset creation modal ---
function PresetModal({
  onClose,
  onSuccess,
  defaultName,
  defaultPhone,
}: {
  onClose: () => void;
  onSuccess: () => void;
  defaultName: string;
  defaultPhone: string;
}) {
  const [form, setForm] = useState({
    label: '',
    contact_name: defaultName,
    contact_phone: defaultPhone,
    contact_email: '',
    location: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label || !form.contact_name || !form.contact_phone) {
      setError('Label, name, and phone are required');
      return;
    }
    setError('');
    setLoading(true);
    const { error: insertError } = await supabase.from('booking_presets').insert({
      label: form.label,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email || null,
      location: form.location || null,
    });
    if (insertError) {
      setError(insertError.message);
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">New Quick Book Preset</h2>
              <p className="text-emerald-100 text-sm mt-0.5">Save details for one-tap booking</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Preset Label *</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Office, Warehouse, Home"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contact Name *</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone *</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email (Optional)</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Location (Optional)</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Service address"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Save Preset</>}
          </button>
        </form>
      </div>
    </div>
  );
}
