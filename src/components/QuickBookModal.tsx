import { useState, useEffect } from 'react';
import { Zap, X, Calendar, Clock, MapPin, ArrowRight, Loader2 } from 'lucide-react';
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

export function QuickBookModal({ onClose, onBook }: QuickBookModalProps) {
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'service' | 'details'>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('created_at');
      setServices((data as Service[]) || []);
      setLoading(false);
    };
    fetchServices();
  }, []);

  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = () => {
    if (!selectedService || !date) return;
    setSubmitting(true);
    onBook(selectedService.id, {
      scheduled_date: date,
      scheduled_time: time,
      location,
      contact_name: profile?.full_name || '',
      contact_phone: profile?.phone || '',
      contact_email: null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Quick Book</h2>
              <p className="text-emerald-100 text-xs">
                {step === 'service' ? 'Choose a service' : 'Pick a date & time'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
            </div>
          ) : step === 'service' ? (
            <div className="space-y-2.5">
              {services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => { setSelectedService(svc); setStep('details'); }}
                  className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left group active:scale-[0.98]"
                >
                  <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                    <Zap className="w-5 h-5 text-slate-600 group-hover:text-emerald-600 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{svc.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{svc.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Selected service */}
              <div className="flex items-center gap-3 p-3.5 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-emerald-600" />
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

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" /> Date
                </label>
                <input
                  type="date"
                  min={today}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>

              {/* Time */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400" /> Time (optional)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {TIME_SLOTS.map(slot => (
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

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" /> Location (optional)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="Service address or area"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'details' && (
          <div className="flex-shrink-0 p-4 border-t border-slate-100 safe-area-pb">
            <button
              onClick={handleSubmit}
              disabled={!date || submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Continue to Booking
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
