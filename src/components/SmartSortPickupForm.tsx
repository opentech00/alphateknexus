import { useState, useEffect } from 'react';
import {
  ArrowLeft, Trash2, Recycle, Leaf, HardHat, Zap, Package,
  MapPin, Clock, Calendar, CheckCircle2, Crosshair, ChevronDown, Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ServicePaymentStep, PaymentSuccessScreen, PaymentFailedScreen } from './ServicePaymentStep';

interface Service {
  id: string; name: string; slug: string; description: string; icon: string; price_range: string;
}

interface SmartSortPickupFormProps {
  service: Service;
  onCancel: () => void;
  onSuccess: () => void;
  rebookData?: {
    contact_name?: string;
    contact_phone?: string;
    location?: string | null;
    notes?: string | null;
    scheduled_date?: string | null;
    details?: Record<string, any> | null;
  } | null;
}

const WASTE_TYPES = [
  { id: 'general', label: 'General Waste', subtitle: 'Household & office waste', Icon: Trash2 },
  { id: 'recyclables', label: 'Recyclables', subtitle: 'Paper, plastic, glass, metal', Icon: Recycle },
  { id: 'organic', label: 'Organic / Green', subtitle: 'Food waste, garden trimmings', Icon: Leaf },
  { id: 'construction', label: 'Construction', subtitle: 'Rubble, timber, fixtures', Icon: HardHat },
  { id: 'ewaste', label: 'E-Waste', subtitle: 'Electronics & appliances', Icon: Zap },
  { id: 'bulk', label: 'Bulk Items', subtitle: 'Furniture, mattresses, large items', Icon: Package },
];

const FREQUENCIES = [
  { id: 'one-time', label: 'One-Time Pickup' },
  { id: 'daily', label: 'Daily' },
  { id: 'twice-weekly', label: 'Twice Weekly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'three-weeks', label: 'Every Three Weeks' },
  { id: 'monthly', label: 'Monthly' },
];

const CUSTOMER_CATEGORIES = ['Residential', 'Commercial', 'Industrial', 'Government / NGO'];

const WASTE_CLASSES = [
  'Class A — Non-Hazardous',
  'Class B — Recyclable',
  'Class C — Organic / Green',
  'Class D — Hazardous (Restricted)',
];

const BIN_SIZES = [
  { value: '25', label: '25 L — Le 15' },
  { value: '50', label: '50 L — Le 25' },
  { value: '120', label: '120 L — Le 50' },
  { value: '250', label: '250 L — Le 90' },
  { value: '350', label: '350 L — Le 120' },
  { value: '600', label: '600 L — Le 250' },
  { value: '1000', label: '1,000 L — Le 350' },
  { value: '1000+', label: 'Above 1,000 L — Negotiable' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning (7 AM – 11 AM)', time: '09:00' },
  { id: 'afternoon', label: 'Afternoon (12 PM – 4 PM)', time: '14:00' },
  { id: 'evening', label: 'Evening (5 PM – 6:30 PM)', time: '17:30' },
];

const STEP_LABELS = ['Select waste type', 'Choose date & time', 'Pickup location', 'Review & confirm'];

export function SmartSortPickupForm({ service, onCancel, onSuccess, rebookData }: SmartSortPickupFormProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState('');
  const [paymentStep, setPaymentStep] = useState<'payment' | 'success' | 'payment_failed'>('payment');

  const [wasteType, setWasteType] = useState('');
  const [frequency, setFrequency] = useState('one-time');
  const [customerCategory, setCustomerCategory] = useState('');
  const [wasteClass, setWasteClass] = useState('');
  const [binSize, setBinSize] = useState('25');
  const [pickupDate, setPickupDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  useEffect(() => {
    if (!rebookData) return;
    const d = rebookData.details;
    if (d) {
      if (d.waste_type) setWasteType(d.waste_type);
      if (d.frequency) setFrequency(d.frequency);
      if (d.customer_category) setCustomerCategory(d.customer_category);
      if (d.waste_class) setWasteClass(d.waste_class);
      if (d.bin_size_liters) setBinSize(String(d.bin_size_liters));
      if (d.time_slot) setTimeSlot(d.time_slot);
      if (d.landmark) setLandmark(d.landmark);
    }
    if (rebookData.scheduled_date) setPickupDate(rebookData.scheduled_date);
    if (rebookData.location) setAddress(rebookData.location);
    if (rebookData.notes) setSpecialInstructions(rebookData.notes);
  }, [rebookData]);

  const canProceed = [
    wasteType && frequency && customerCategory && wasteClass && binSize,
    pickupDate && timeSlot,
    address && contactPhone,
    true,
  ][step - 1];

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles').select('full_name').eq('id', user?.id).maybeSingle();
    const contactName = (profile as any)?.full_name || contactPhone;

    const { data: bookingRow, error: err } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user?.id,
      contact_name: contactName,
      contact_phone: contactPhone,
      scheduled_date: pickupDate,
      scheduled_time: TIME_SLOTS.find(t => t.id === timeSlot)?.time ?? null,
      location: address,
      notes: specialInstructions || null,
      details: {
        type: 'smart-sort-pickup',
        waste_type: wasteType,
        frequency,
        customer_category: customerCategory,
        waste_class: wasteClass,
        bin_size_liters: parseInt(binSize),
        bin_size_label: BIN_SIZES.find(b => b.value === binSize)?.label,
        time_slot: timeSlot,
        time_slot_label: TIME_SLOTS.find(t => t.id === timeSlot)?.label,
        landmark,
      },
      payment_status: 'pending',
    }).select('id').single();

    setLoading(false);
    if (err) { setError('We could not schedule your pickup. Please try again.'); return; }
    setBookingId(bookingRow.id);
    setPaymentStep('payment');
  };

  const pickupPrice = (() => {
    const bin = BIN_SIZES.find(b => b.value === binSize);
    if (!bin) return 0;
    const match = bin.label.match(/Le\s+(\d+)/);
    return match ? parseInt(match[1]) : 0;
  })();

  if (done) {
    return (
      <PaymentSuccessScreen
        serviceName={service.name}
        amount={pickupPrice}
        method={payMethod}
        contactName={contactPhone}
        contactPhone={contactPhone}
        reference={payRef}
        onDone={onCancel}
        onViewBookings={onSuccess}
      />
    );
  }

  if (bookingId && paymentStep === 'payment') {
    return (
      <ServicePaymentStep
        amount={pickupPrice}
        bookingId={bookingId}
        serviceName={service.name}
        serviceSlug={service.slug}
        onBack={() => { setBookingId(''); setStep(4); }}
        onSuccess={(method, ref) => { setPayMethod(method); setPayRef(ref || ''); setDone(true); }}
        onFail={(msg) => { setPayError(msg); setPaymentStep('payment_failed'); }}
      />
    );
  }

  if (paymentStep === 'payment_failed') {
    return (
      <PaymentFailedScreen
        message={payError}
        onRetry={() => setPaymentStep('payment')}
        onViewBookings={onSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="font-bold text-slate-900 text-base">Schedule a Pickup</h1>
          <p className="text-xs text-slate-500">Smart Sort Collection Service</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white px-4 pb-3 border-b border-slate-100">
        <div className="flex gap-1 mt-2.5">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${step >= s ? 'bg-[#1e293b]' : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">Step {step} of 4 — {STEP_LABELS[step - 1]}</p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-28">

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
            {/* Waste type tiles */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-0.5">What type of waste?</h2>
              <p className="text-sm text-slate-500 mb-4">Select the primary waste category</p>
              <div className="grid grid-cols-3 gap-2.5">
                {WASTE_TYPES.map(({ id, label, subtitle, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setWasteType(id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all ${
                      wasteType === id
                        ? 'border-[#1e293b] bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${wasteType === id ? 'text-[#1e293b]' : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-xs font-semibold leading-tight ${wasteType === id ? 'text-slate-900' : 'text-slate-700'}`}>{label}</p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Pickup Frequency */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Pickup Frequency</h3>
              <div className="grid grid-cols-2 gap-2">
                {FREQUENCIES.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setFrequency(id)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-all ${
                      frequency === id
                        ? 'border-[#1e293b] bg-slate-50 ring-1 ring-[#1e293b]'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${frequency === id ? 'border-[#1e293b]' : 'border-slate-300'}`}>
                      {frequency === id && <div className="w-2 h-2 rounded-full bg-[#1e293b]" />}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dropdowns */}
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Customer Category <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={customerCategory}
                    onChange={e => setCustomerCategory(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 appearance-none bg-white focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                  >
                    <option value="">Select customer category</option>
                    {CUSTOMER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Waste Type Class <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={wasteClass}
                    onChange={e => setWasteClass(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 appearance-none bg-white focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                  >
                    <option value="">Select waste class</option>
                    {WASTE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Estimated Quantity / Bin Size <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={binSize}
                    onChange={e => setBinSize(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 appearance-none bg-white focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                  >
                    {BIN_SIZES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-xs text-teal-600 mt-1.5">Prices are per pickup. Above 1,000 L is negotiable.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-500" />
                <h2 className="text-lg font-bold text-slate-900">When should we collect?</h2>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Pickup Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={pickupDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setPickupDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <label className="text-sm font-semibold text-slate-800">
                    Preferred Time Slot <span className="text-rose-500">*</span>
                  </label>
                </div>
                <div className="space-y-2">
                  {TIME_SLOTS.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setTimeSlot(id)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                        timeSlot === id
                          ? 'border-[#1e293b] bg-slate-50 ring-1 ring-[#1e293b]'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${timeSlot === id ? 'border-[#1e293b]' : 'border-slate-300'}`}>
                        {timeSlot === id && <div className="w-2 h-2 rounded-full bg-[#1e293b]" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-slate-500" />
                <h2 className="text-lg font-bold text-slate-900">Pickup Location</h2>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Street Address <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="e.g. 15 Siaka Stevens Street"
                      className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    className="px-3 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0"
                    title="Use current location"
                  >
                    <Crosshair className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Nearest Landmark</label>
                <input
                  type="text"
                  value={landmark}
                  onChange={e => setLandmark(e.target.value)}
                  placeholder="e.g. Opposite National Stadium"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Contact Phone <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="+232 76 000 000"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Special Instructions</label>
                <textarea
                  rows={4}
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                  placeholder="Gate code, access hours, hazardous items..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4 (Review & Edit) ── */}
        {step === 4 && (
          <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">Review Your Pickup</h2>
                <span className="text-xs text-slate-400">Tap any field to edit</span>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  { label: 'Waste Type', value: WASTE_TYPES.find(w => w.id === wasteType)?.label, step: 1 },
                  { label: 'Frequency', value: FREQUENCIES.find(f => f.id === frequency)?.label, step: 1 },
                  { label: 'Customer Category', value: customerCategory, step: 1 },
                  { label: 'Waste Class', value: wasteClass, step: 1 },
                  { label: 'Bin Size', value: BIN_SIZES.find(b => b.value === binSize)?.label, step: 1 },
                  {
                    label: 'Pickup Date',
                    value: pickupDate
                      ? new Date(pickupDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : '',
                    step: 2,
                  },
                  { label: 'Time Slot', value: TIME_SLOTS.find(t => t.id === timeSlot)?.label, step: 2 },
                  { label: 'Address', value: address, step: 3 },
                  { label: 'Landmark', value: landmark || '—', step: 3 },
                  { label: 'Contact Phone', value: contactPhone, step: 3 },
                  ...(specialInstructions ? [{ label: 'Instructions', value: specialInstructions, step: 3 }] : []),
                ].map(({ label, value, step: editStep }) => (
                  <button
                    key={label}
                    onClick={() => setStep(editStep)}
                    className="w-full flex justify-between items-center py-2.5 text-sm group hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors text-left"
                  >
                    <span className="text-slate-500 flex-shrink-0 mr-4">{label}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-slate-800 text-right truncate">{value || '—'}</span>
                      <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#1e293b] transition-colors flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-10">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Back
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed}
              className="flex-1 py-3.5 bg-[#1e293b] text-white font-semibold rounded-xl hover:bg-[#0f172a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Submitting…' : 'Proceed to Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
