import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, Home, Building2, Plus, Trash2, Star, Loader2, X,
  CheckCircle2, ChevronRight, Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export interface SavedAddress {
  id: string;
  label: string;
  address_line: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
}

interface SearchResult {
  display_name: string;
  address_line: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
}

const LABEL_PRESETS = [
  { value: 'Home', icon: Home },
  { value: 'Office', icon: Building2 },
  { value: 'Other', icon: MapPin },
];

export function AddressPage() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [label, setLabel] = useState('Home');
  const [customLabel, setCustomLabel] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Autocomplete
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loadAddresses = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (!error && data) setAddresses(data as SavedAddress[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAddresses(); }, [loadAddresses]);

  // Autocomplete search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/address-search?q=${encodeURIComponent(query.trim())}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        setResults(data.results || []);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close results on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectResult = (r: SearchResult) => {
    setAddressLine(r.address_line || r.display_name.split(',').slice(0, 2).join(', ').trim());
    setCity(r.city);
    setRegion(r.region);
    setPostalCode(r.postal_code);
    setCountry(r.country);
    setLat(r.latitude);
    setLng(r.longitude);
    setQuery(r.display_name);
    setShowResults(false);
  };

  const openAdd = () => {
    setEditing(null);
    setLabel('Home');
    setCustomLabel('');
    setAddressLine('');
    setCity('');
    setRegion('');
    setPostalCode('');
    setCountry('');
    setLat(null);
    setLng(null);
    setQuery('');
    setResults([]);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (a: SavedAddress) => {
    setEditing(a);
    setLabel(LABEL_PRESETS.some(p => p.value === a.label) ? a.label : 'Other');
    setCustomLabel(LABEL_PRESETS.some(p => p.value === a.label) ? '' : a.label);
    setAddressLine(a.address_line);
    setCity(a.city || '');
    setRegion(a.region || '');
    setPostalCode(a.postal_code || '');
    setCountry(a.country || '');
    setLat(a.latitude);
    setLng(a.longitude);
    setQuery(a.address_line);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const finalLabel = label === 'Other' ? customLabel.trim() || 'Other' : label;
    if (!finalLabel) { setError('Please choose a label'); return; }
    if (!addressLine.trim()) { setError('Please enter an address'); return; }
    setSaving(true);

    const payload = {
      label: finalLabel,
      address_line: addressLine.trim(),
      city: city.trim() || null,
      region: region.trim() || null,
      postal_code: postalCode.trim() || null,
      country: country.trim() || null,
      latitude: lat,
      longitude: lng,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase
        .from('user_addresses')
        .update(payload)
        .eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
      setToast('Address updated');
    } else {
      const { error } = await supabase
        .from('user_addresses')
        .insert({ ...payload, user_id: user!.id });
      if (error) { setError(error.message); setSaving(false); return; }
      setToast('Address saved');
    }
    setSaving(false);
    setModalOpen(false);
    await loadAddresses();
    setTimeout(() => setToast(''), 3000);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('user_addresses').delete().eq('id', id);
    if (error) { setToast('Could not delete address'); setTimeout(() => setToast(''), 3000); return; }
    await loadAddresses();
    setToast('Address removed');
    setTimeout(() => setToast(''), 3000);
  };

  const setDefault = async (id: string) => {
    // Clear existing defaults
    await supabase.from('user_addresses').update({ is_default: false }).eq('is_default', true);
    await supabase.from('user_addresses').update({ is_default: true }).eq('id', id);
    await loadAddresses();
    setToast('Default address updated');
    setTimeout(() => setToast(''), 3000);
  };

  const labelIcon = (l: string) => {
    const preset = LABEL_PRESETS.find(p => p.value === l);
    return preset ? preset.icon : MapPin;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Saved Addresses</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Store home, office, or other addresses for faster booking</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Address
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* Address list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <MapPin className="w-7 h-7 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">No saved addresses yet</p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Add your home or office address to speed up booking</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => {
            const Icon = labelIcon(a.label);
            return (
              <div
                key={a.id}
                className="group flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-800 black:bg-[#111] rounded-xl border border-slate-200 dark:border-slate-700 black:border-[#222] hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              >
                <div className="w-10 h-10 bg-white dark:bg-slate-700 black:bg-[#222] rounded-xl border border-slate-200 dark:border-slate-600 black:border-[#333] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.label}</p>
                    {a.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                        <Star className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{a.address_line}</p>
                  {(a.city || a.region || a.postal_code || a.country) && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {[a.city, a.region, a.postal_code, a.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!a.is_default && (
                    <button
                      onClick={() => setDefault(a.id)}
                      title="Set as default"
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(a)}
                    title="Edit"
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div
            className="bg-white dark:bg-slate-900 black:bg-[#0a0a0a] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 black:bg-[#0a0a0a] rounded-t-2xl z-10">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{editing ? 'Edit Address' : 'Add Address'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

              {/* Label selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Label</label>
                <div className="flex gap-2">
                  {LABEL_PRESETS.map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLabel(value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                        label === value
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {value}
                    </button>
                  ))}
                </div>
                {label === 'Other' && (
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Custom label name"
                    className="w-full mt-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all"
                  />
                )}
              </div>

              {/* Address autocomplete */}
              <div ref={resultsRef} className="relative">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Search Address</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => results.length > 0 && setShowResults(true)}
                    placeholder="Start typing your address…"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />
                  )}
                </div>
                {showResults && results.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {results.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectResult(r)}
                        className="flex items-start gap-2 w-full px-4 py-2.5 text-left hover:bg-emerald-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700 leading-snug">{r.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual fields */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Street Address</label>
                <input
                  type="text"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="House number and street"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">City</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Region / State</label>
                  <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="State / Province" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Postal Code</label>
                  <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Country</label>
                  <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 black:bg-[#111] border border-slate-200 dark:border-slate-700 black:border-[#222] rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none transition-all" />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {saving ? 'Saving…' : editing ? 'Update Address' : 'Save Address'}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
