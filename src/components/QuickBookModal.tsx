import { useState, useEffect, useMemo } from 'react';
import {
  Zap, X, Calendar, Clock, MapPin, ArrowRight, ArrowLeft, Loader2,
  Check, Star, History, MapPinHouse, Plus, Search, User, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

interface SavedAddress {
  id: string;
  label: string;
  address_line: string;
  city: string;
  is_default: boolean;
}

interface QuickBookModalProps {
  onClose: () => void;
  onBook: (serviceId: string, preset: {
    scheduled_date: string;
    scheduled_time: string;
    location: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string | null;
  }) => void;
}

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00',
];

const SERVICE_ICONS: Record<string, string> = {
  'cleaning-janitorial': '🧹',
  'clearing-forwarding': '🚢',
  'private-security': '🛡️',
  'procurement': '🛒',
  'smart-sort': '♻️',
};

type Step = 'service' | 'details' | 'confirm';

export function QuickBookModal({ onClose, onBook }: QuickBookModalProps) {
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [recentServices, setRecentServices] = useState<Service[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [svcRes, addrRes, recentRes] = await Promise.all([
      supabase.from('services').select('*').eq('is_active', true).order('created_at'),
      supabase.from('user_addresses').select('*').order('is_default', { ascending: false }),
      supabase
        .from('bookings')
        .select('service_id, services(id, name, slug, description, icon, price_range)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    setServices((svcRes.data as Service[]) || []);
    setAddresses((addrRes.data as SavedAddress[]) || []);

    const seen = new Set<string>();
    const recents: Service[] = [];
    for (const b of (recentRes.data as any[]) || []) {
      const svc = b.services as Service | null;
      if (svc && !seen.has(svc.id)) {
        seen.add(svc.id);
        recents.push(svc);
      }
    }
    setRecentServices(recents.slice(0, 3));

    const defaultAddr = (addrRes.data as SavedAddress[])?.find((a) => a.is_default);
    if (defaultAddr) {
      setSelectedAddressId(defaultAddr.id);
      setLocation(defaultAddr.address_line);
    }

    setContactName(profile?.full_name || '');
    setContactPhone(profile?.phone || '');
    setLoading(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) return services;
    const q = searchQuery.toLowerCase();
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [services, searchQuery]);

  const selectService = (svc: Service) => {
    setSelectedService(svc);
    setStep('details');
  };

  const selectAddress = (addr: SavedAddress) => {
    setSelectedAddressId(addr.id);
    setLocation(addr.address_line);
  };

  const handleAddressToggle = () => {
    if (selectedAddressId) {
      setSelectedAddressId(null);
      setLocation('');
    }
  };

  const validateDetails = (): boolean => {
    if (!date) {
      setError('Please select a date');
      return false;
    }
    if (!contactName.trim()) {
      setError('Contact name is required');
      return false;
    }
    if (!contactPhone.trim()) {
      setError('Contact phone is required');
      return false;
    }
    setError('');
    return true;
  };

  const goToConfirm = () => {
    if (!validateDetails()) return;
    setStep('confirm');
  };

  const handleSubmit = () => {
    if (!selectedService || !validateDetails()) return;
    setSubmitting(true);
    onBook(selectedService.id, {
      scheduled_date: date,
      scheduled_time: time,
      location,
      contact_name: contactName,
      contact_phone: contactPhone,
      contact_email: null,
    });
  };

  const stepIndex = step === 'service' ? 0 : step === 'details' ? 1 : 2;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">

        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Quick Book</h2>
              <p className="text-emerald-100 text-xs">
                {step === 'service' ? 'Choose a service' : step === 'details' ? 'Pick date & details' : 'Review & confirm'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= stepIndex ? 'w-6 bg-white' : 'w-3 bg-white/30'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
            </div>
          ) : step === 'service' ? (
            <div className="space-y-4">

              {recentServices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Recently Booked
                  </p>
                  <div className="space-y-2">
                    {recentServices.map((svc) => (
                      <button
                        key={svc.id}
                        onClick={() => selectService(svc)}
                        className="w-full flex items-center gap-3 p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group active:scale-[0.98]"
                      >
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                          {SERVICE_ICONS[svc.slug] || <Zap className="w-5 h-5 text-emerald-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">{svc.name}</p>
                          <p className="text-xs text-slate-400">{svc.price_range}</p>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wide">Book again</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search services..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  />
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">All Services</p>
                <div className="space-y-2">
                  {filteredServices.map((svc) => (
                    <button
                      key={svc.id}
                      onClick={() => selectService(svc)}
                      className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left group active:scale-[0.98]"
                    >
                      <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors text-lg">
                        {SERVICE_ICONS[svc.slug] || <Zap className="w-5 h-5 text-slate-600 group-hover:text-emerald-600 transition-colors" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{svc.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{svc.description}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  ))}
                  {filteredServices.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-400">
                      No services found for "{searchQuery}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : step === 'details' ? (
            <div className="space-y-5">

              <div className="flex items-center gap-3 p-3.5 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">
                  {SERVICE_ICONS[selectedService?.slug || ''] || <Zap className="w-5 h-5 text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{selectedService?.name}</p>
                  <p className="text-xs text-slate-500">{selectedService?.price_range}</p>
                </div>
                <button
                  onClick={() => setStep('service')}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex-shrink-0"
                >
                  Change
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" /> Date <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    onClick={() => setDate(today)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                      date === today
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setDate(tomorrow)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                      date === tomorrow
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    Tomorrow
                  </button>
                </div>
                <input
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400" /> Time (optional)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setTime(time === slot ? '' : slot)}
                      className={`py-2 rounded-lg text-xs font-medium transition-all ${
                        time === slot
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" /> Location
                </label>
                {addresses.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {addresses.map((addr) => (
                      <button
                        key={addr.id}
                        onClick={() => selectAddress(addr)}
                        className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          selectedAddressId === addr.id
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-emerald-200'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          selectedAddressId === addr.id ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}>
                          <MapPinHouse className={`w-4 h-4 ${selectedAddressId === addr.id ? 'text-emerald-600' : 'text-slate-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                            {addr.label}
                            {addr.is_default && (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">Default</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{addr.address_line}{addr.city ? `, ${addr.city}` : ''}</p>
                        </div>
                        {selectedAddressId === addr.id && (
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setSelectedAddressId(null); }}
                  placeholder="Enter service address or area"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" /> Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Contact name"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-400" /> Phone <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Contact phone"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">

              <div className="text-center py-2">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mb-3">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Review your booking</h3>
                <p className="text-sm text-slate-400 mt-1">Confirm the details below to continue</p>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-100">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                    {SERVICE_ICONS[selectedService?.slug || ''] || <Zap className="w-5 h-5 text-emerald-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Service</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedService?.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Date & Time</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {new Date(date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {time && <span className="text-slate-400 font-normal"> at {time}</span>}
                    </p>
                  </div>
                </div>

                {location && (
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Location</p>
                      <p className="text-sm font-semibold text-slate-900">{location}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Contact</p>
                    <p className="text-sm font-semibold text-slate-900">{contactName}</p>
                    <p className="text-xs text-slate-500">{contactPhone}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 border-t border-slate-100 safe-area-pb bg-white">
          {error && step !== 'details' && (
            <p className="text-sm text-red-500 mb-2 text-center">{error}</p>
          )}
          {step === 'details' && (
            <div className="flex gap-2">
              <button
                onClick={() => setStep('service')}
                className="px-4 py-3.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98] text-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={goToConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all active:scale-[0.98] text-sm"
              >
                Review Booking <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {step === 'confirm' && (
            <div className="flex gap-2">
              <button
                onClick={() => setStep('details')}
                className="px-4 py-3.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98] text-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-sm"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm & Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
