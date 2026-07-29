import { useState } from 'react';
import {
  Sparkles, X, CheckCircle2, ArrowLeft, Eye, MapPin,
  Building2, Repeat2, Tag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ServicePaymentStep, PaymentSuccessScreen, PaymentFailedScreen } from './ServicePaymentStep';

interface Service {
  id: string; name: string; slug: string;
  description: string; icon: string; price_range: string;
}
interface Props { service: Service; onCancel: () => void; onSuccess: () => void; }

const AREAS = [
  'Living Room', 'Kitchen', 'Bathrooms / Restrooms',
  'Bedrooms', 'Windows', 'Carpets / Rugs', 'Outdoor / Patio',
];
const ADDONS = [
  { label: 'Deep Clean',                      price: 150_000 },
  { label: 'Eco-Friendly Products',           price: 50_000  },
  { label: 'Post-Construction Cleanup',       price: 300_000 },
  { label: 'Inside Appliances (oven/fridge)', price: 75_000  },
];
const FREQUENCIES = [
  { label: 'One-time', discount: 0 },
  { label: 'Weekly',   discount: 0.15 },
  { label: 'Bi-weekly',discount: 0.10 },
  { label: 'Monthly',  discount: 0.05 },
];
const BASE_RATE = 15_000; // Le per area

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-emerald-600" />
      </div>
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white';

type Step = 'form' | 'review' | 'payment' | 'success' | 'payment_failed';

const fmtSLE = (n: number) => `Le ${n.toLocaleString()}`;

export function CleaningHireForm({ service, onCancel, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [address, setAddress] = useState('');
  const [sqft, setSqft] = useState('');
  const [rooms, setRooms] = useState('');
  const [areas, setAreas] = useState<string[]>(['Living Room']);
  const [addons, setAddons] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('One-time');
  const [notes, setNotes] = useState('');

  const toggleArea = (a: string) =>
    setAreas(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a]);
  const toggleAddon = (a: string) =>
    setAddons(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a]);

  const freq = FREQUENCIES.find(f => f.label === frequency)!;
  const subtotal = areas.length * BASE_RATE +
    addons.reduce((s, a) => s + (ADDONS.find(x => x.label === a)?.price ?? 0), 0);
  const discount = Math.round(subtotal * freq.discount);
  const total = subtotal - discount;

  const handleReview = () => {
    if (!fullName || !phone || !preferredDate || areas.length === 0) {
      setError('Please fill in all required fields and select at least one area to clean.');
      return;
    }
    setError('');
    setStep('review');
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const details = {
      full_name: fullName, phone, email: email || null,
      preferred_time: preferredTime || null, address: address || null,
      sqft: sqft || null, rooms: rooms || null,
      areas, addons, frequency,
      subtotal_sle: subtotal, discount_sle: discount, total_sle: total,
    };
    const { data: bookingRow, error: err } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user?.id,
      contact_name: fullName, contact_phone: phone,
      contact_email: email || null,
      scheduled_date: preferredDate,
      scheduled_time: preferredTime || null,
      location: address || null,
      notes: notes || null,
      details,
      payment_status: 'pending',
    }).select('id').single();
    setLoading(false);
    if (err) { setError(err.message); setStep('form'); return; }
    setBookingId(bookingRow.id);
    setStep('payment');
  };

  if (step === 'payment') return (
    <ServicePaymentStep
      amount={total}
      bookingId={bookingId}
      serviceName={service.name}
      onBack={() => setStep('review')}
      onSuccess={(method, ref) => { setPayMethod(method); setPayRef(ref || ''); setStep('success'); }}
      onFail={(msg) => { setPayError(msg); setStep('payment_failed'); }}
    />
  );

  if (step === 'payment_failed') return (
    <PaymentFailedScreen
      message={payError}
      onRetry={() => setStep('payment')}
      onViewBookings={onSuccess}
    />
  );

  if (step === 'success') return (
    <PaymentSuccessScreen
      serviceName={service.name}
      amount={total}
      method={payMethod}
      contactName={fullName}
      contactPhone={phone}
      reference={payRef}
      onDone={onCancel}
      onViewBookings={onSuccess}
    />
  );

  if (step === 'review') return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
        <button onClick={() => setStep('form')} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Edit form
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-white" />
            <div>
              <h1 className="text-lg font-bold text-white">Review Booking</h1>
              <p className="text-emerald-100 text-sm">Cleaning &amp; Janitorial</p>
            </div>
          </div>
          <div className="p-6 space-y-3 text-sm">
            {[
              { label: 'Name', value: fullName },
              { label: 'Phone', value: phone },
              ...(email ? [{ label: 'Email', value: email }] : []),
              { label: 'Date', value: preferredDate },
              ...(preferredTime ? [{ label: 'Time', value: preferredTime }] : []),
              ...(address ? [{ label: 'Address', value: address }] : []),
              ...(sqft || rooms ? [{ label: 'Property', value: [sqft && `${sqft} sqft`, rooms && `${rooms} rooms`].filter(Boolean).join(' · ') }] : []),
              { label: 'Areas', value: areas.join(', ') },
              ...(addons.length ? [{ label: 'Add-ons', value: addons.join(', ') }] : []),
              { label: 'Frequency', value: frequency },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 py-2 border-b border-slate-100 last:border-0">
                <span className="w-28 flex-shrink-0 text-slate-400 font-medium">{label}</span>
                <span className="text-slate-800">{value}</span>
              </div>
            ))}
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{fmtSLE(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>{frequency} discount (-{Math.round(freq.discount * 100)}%)</span><span>-{fmtSLE(discount)}</span></div>}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200"><span>Estimated Total</span><span>{fmtSLE(total)}</span></div>
              <p className="text-xs text-slate-400">Final price confirmed after on-site assessment.</p>
            </div>
          </div>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        <div className="flex gap-3">
          <button onClick={() => setStep('form')} className="flex-1 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm">Back &amp; Edit</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><CheckCircle2 className="w-4 h-4" />Proceed to Payment</>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
        <button onClick={onCancel} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Services
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900">Book Cleaning &amp; Janitorial</h1>
              <p className="mt-1 text-sm text-slate-500">Fill in your details to book this service. From {service.price_range}</p>
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          {/* Contact */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Building2} title="Contact Information" />
            <div className="space-y-4">
              <Field label="Full Name" required>
                <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone" required>
                  <input className={inputCls} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+232..." />
                </Field>
                <Field label="Email">
                  <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Preferred Date" required>
                  <input className={inputCls} type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                </Field>
                <Field label="Preferred Time">
                  <input className={inputCls} type="time" value={preferredTime} onChange={e => setPreferredTime(e.target.value)} />
                </Field>
              </div>
              <Field label="Service Address">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} value={address} onChange={e => setAddress(e.target.value)} placeholder="Where should we deliver the service?" />
                </div>
              </Field>
            </div>
          </div>

          {/* Property */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Tag} title="Property Size" />
            <div className="grid grid-cols-2 gap-4 mb-5">
              <input className={inputCls} type="number" value={sqft} onChange={e => setSqft(e.target.value)} placeholder="Square feet" />
              <input className={inputCls} type="number" value={rooms} onChange={e => setRooms(e.target.value)} placeholder="Rooms" />
            </div>

            <p className="text-sm font-medium text-slate-700 mb-3">What should we clean? <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-2 gap-2">
              {AREAS.map(a => (
                <button key={a} type="button" onClick={() => toggleArea(a)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${areas.includes(a) ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${areas.includes(a) ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'}`}>
                    {areas.includes(a) && <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span className="text-sm text-slate-700">{a}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Add-ons & Frequency */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Sparkles} title="Add-ons &amp; Frequency" />

            <p className="text-sm font-medium text-slate-700 mb-3">Optional Add-ons</p>
            <div className="space-y-2 mb-5">
              {ADDONS.map(a => (
                <button key={a.label} type="button" onClick={() => toggleAddon(a.label)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full ${addons.includes(a.label) ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${addons.includes(a.label) ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'}`}>
                    {addons.includes(a.label) && <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span className="text-sm text-slate-700 flex-1">{a.label}</span>
                  <span className="text-xs text-slate-400">+{fmtSLE(a.price)}</span>
                </button>
              ))}
            </div>

            <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5"><Repeat2 className="w-4 h-4 text-slate-400" /> Frequency</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {FREQUENCIES.map(f => (
                <button key={f.label} type="button" onClick={() => setFrequency(f.label)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${frequency === f.label ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${frequency === f.label ? 'border-emerald-600' : 'border-slate-300'}`}>
                    {frequency === f.label && <div className="w-2 h-2 rounded-full bg-emerald-600" />}
                  </div>
                  <span className="text-sm text-slate-700 flex-1">{f.label}</span>
                  {f.discount > 0 && <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">-{Math.round(f.discount * 100)}%</span>}
                </button>
              ))}
            </div>

            {/* Pricing */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{fmtSLE(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>{frequency} discount (-{Math.round(freq.discount * 100)}%)</span><span>-{fmtSLE(discount)}</span></div>}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200"><span>Estimated Total</span><span>{fmtSLE(total)}</span></div>
              <p className="text-xs text-slate-400">Final price confirmed after on-site assessment.</p>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <Field label="Additional Notes">
              <textarea className={`${inputCls} resize-none`} rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requirements..." />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="px-6 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm">Cancel</button>
          <button type="button" onClick={handleReview} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors text-sm flex items-center justify-center gap-2">
            <Eye className="w-4 h-4" /> Review Booking
          </button>
        </div>
      </div>
    </div>
  );
}
