import { useState } from 'react';
import {
  Shield, ShieldCheck, X, CheckCircle2, ArrowLeft, Eye, MapPin,
  Building2, Users, Clock, AlertTriangle, Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ServicePaymentStep, PaymentSuccessScreen, PaymentFailedScreen } from './ServicePaymentStep';
import { ReviewSubmittedScreen } from './ReviewSubmittedScreen';

interface Props {
  service: Service;
  onCancel: () => void;
  onSuccess: () => void;
}

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

type Step = 'form' | 'review' | 'payment' | 'success' | 'payment_failed' | 'review_submitted';

const SERVICE_TYPES = [
  { id: 'unarmed', label: 'Unarmed Guards', desc: 'Trained security personnel', price: 0 },
  { id: 'armed', label: 'Armed Guards', desc: 'Licensed armed officers', price: 15000 },
  { id: 'cctv', label: 'CCTV Monitoring', desc: '24/7 surveillance coverage', price: 10000 },
  { id: 'event', label: 'Event Security', desc: 'Crowd control & access mgmt', price: 12000 },
  { id: 'escort', label: 'Escort Services', desc: 'Valuable goods & VIP escort', price: 20000 },
];

const SITE_TYPES = ['Residential', 'Commercial', 'Industrial', 'Event Venue', 'Construction Site'];

const SHIFT_PATTERNS = [
  { id: 'day', label: 'Day Shift', hours: '6 AM – 6 PM' },
  { id: 'night', label: 'Night Shift', hours: '6 PM – 6 AM' },
  { id: '24h', label: '24/7 Coverage', hours: 'Round-the-clock' },
  { id: 'rotating', label: 'Rotating Shifts', hours: 'Alternating day/night' },
];

const CONTRACT_DURATIONS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly (3 mo)' },
  { id: 'annual', label: 'Annual (12 mo)' },
];

const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];

const ADDONS = [
  { id: 'k9', label: 'K9 Units', price: 25000 },
  { id: 'exec', label: 'Executive Protection', price: 35000 },
  { id: 'patrol', label: 'Mobile Patrols', price: 18000 },
  { id: 'alarm', label: 'Alarm Response', price: 12000 },
];

const inputCls = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all';

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, step, title }: { icon: React.ElementType; step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 mb-4 border-b border-slate-100">
      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <span className="text-xs text-slate-400 font-medium">Step {step}</span>
        <h3 className="text-sm font-bold text-slate-800 -mt-0.5">{title}</h3>
      </div>
    </div>
  );
}

function RadioCard({ label, sub, checked, onClick }: { label: string; sub?: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full text-left p-3 rounded-xl border transition-all active:scale-[0.98] ${checked ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {sub && <span className="block text-xs text-slate-500 mt-0.5">{sub}</span>}
    </button>
  );
}

function fmtSLE(n: number) { return `Le ${n.toLocaleString()}`; }

export function PrivateSecurityHireForm({ service, onCancel, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState('');

  // Contact
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [city, setCity] = useState('');

  // Security details
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [guardCount, setGuardCount] = useState('2');
  const [shiftPattern, setShiftPattern] = useState('day');
  const [contractDuration, setContractDuration] = useState('monthly');
  const [siteType, setSiteType] = useState('Commercial');
  const [riskLevel, setRiskLevel] = useState('Medium');
  const [addons, setAddons] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const toggleService = (id: string) => setServiceTypes(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id]);
  const toggleAddon = (id: string) => setAddons(p => p.includes(id) ? p.filter(a => a !== id) : [...p, id]);

  const basePrice = serviceTypes.reduce((sum, id) => {
    const st = SERVICE_TYPES.find(s => s.id === id);
    return sum + (st?.price || 0);
  }, 0);
  const addonPrice = addons.reduce((sum, id) => {
    const a = ADDONS.find(x => x.id === id);
    return sum + (a?.price || 0);
  }, 0);
  const guardMultiplier = parseInt(guardCount) || 1;
  const subtotal = (basePrice + addonPrice) * Math.max(guardMultiplier, 1);
  const durationDiscount = contractDuration === 'quarterly' ? 0.05 : contractDuration === 'annual' ? 0.10 : 0;
  const discount = Math.round(subtotal * durationDiscount);
  const total = subtotal - discount;

  const canReview = fullName.trim() && phone.trim() && startDate && siteAddress.trim() && serviceTypes.length > 0;

  const handleReview = () => {
    if (!canReview) { setError('Please fill all required fields and select at least one service type.'); return; }
    setError(''); setStep('review');
  };

  const handleSubmit = async () => {
    setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Please sign in to submit your request.');
      setLoading(false);
      setStep('form');
      return;
    }
    const details = {
      full_name: fullName, phone, email: email || null,
      service_types: serviceTypes, service_type_labels: serviceTypes.map(id => SERVICE_TYPES.find(s => s.id === id)?.label).filter(Boolean),
      guard_count: guardCount, shift_pattern: shiftPattern, shift_label: SHIFT_PATTERNS.find(s => s.id === shiftPattern)?.label,
      contract_duration: contractDuration, site_type: siteType, risk_level: riskLevel,
      addons, addon_labels: addons.map(id => ADDONS.find(a => a.id === id)?.label).filter(Boolean),
      site_address: siteAddress, city,
      subtotal_sle: subtotal, discount_sle: discount, total_sle: total,
    };
    const { data: bookingRow, error: err } = await supabase.from('bookings').insert({
      service_id: service.id, user_id: user?.id,
      contact_name: fullName, contact_phone: phone, contact_email: email || null,
      scheduled_date: startDate, location: `${siteAddress}, ${city}`,
      notes: notes || null, details, payment_status: 'pending',
      status: 'pending_review',
    }).select('id').single();
    setLoading(false);
    if (err) { setError(err.message); setStep('form'); return; }
    setBookingId(bookingRow.id); setStep('review_submitted');
  };

  if (step === 'payment') return (
    <ServicePaymentStep amount={total} bookingId={bookingId} serviceName={service.name} serviceSlug={service.slug}
      onBack={() => setStep('review')}
      onSuccess={(m, r) => { setPayMethod(m); setPayRef(r || ''); setStep('success'); }}
      onFail={(msg) => { setPayError(msg); setStep('payment_failed'); }} />
  );
  if (step === 'review_submitted') return (
    <ReviewSubmittedScreen
      serviceName={service.name}
      contactName={fullName}
      contactPhone={phone}
      onDone={onCancel}
      onViewBookings={onSuccess}
    />
  );

  if (step === 'payment_failed') return <PaymentFailedScreen message={payError} onRetry={() => setStep('payment')} onViewBookings={onSuccess} />;
  if (step === 'success') return (
    <PaymentSuccessScreen serviceName={service.name} amount={total} method={payMethod}
      contactName={fullName} contactPhone={phone} reference={payRef} onDone={onCancel} onViewBookings={onSuccess} />
  );

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
          <button onClick={() => setStep('form')} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to form
          </button>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
            <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-5">
              <h1 className="text-lg font-bold text-white">Review Your Security Request</h1>
              <p className="text-slate-300 text-sm mt-1">{service.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-400">Contact</p><p className="text-sm font-medium text-slate-800">{fullName}</p></div>
                <div><p className="text-xs text-slate-400">Phone</p><p className="text-sm font-medium text-slate-800">{phone}</p></div>
                <div><p className="text-xs text-slate-400">Start Date</p><p className="text-sm font-medium text-slate-800">{new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
                <div><p className="text-xs text-slate-400">Site Address</p><p className="text-sm font-medium text-slate-800">{siteAddress}, {city}</p></div>
                <div><p className="text-xs text-slate-400">Guards</p><p className="text-sm font-medium text-slate-800">{guardCount}</p></div>
                <div><p className="text-xs text-slate-400">Shift</p><p className="text-sm font-medium text-slate-800">{SHIFT_PATTERNS.find(s => s.id === shiftPattern)?.label}</p></div>
                <div><p className="text-xs text-slate-400">Contract</p><p className="text-sm font-medium text-slate-800">{CONTRACT_DURATIONS.find(c => c.id === contractDuration)?.label}</p></div>
                <div><p className="text-xs text-slate-400">Site Type</p><p className="text-sm font-medium text-slate-800">{siteType}</p></div>
                <div><p className="text-xs text-slate-400">Risk Level</p><p className="text-sm font-medium text-slate-800">{riskLevel}</p></div>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Service Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {serviceTypes.map(id => <span key={id} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">{SERVICE_TYPES.find(s => s.id === id)?.label}</span>)}
                </div>
              </div>
              {addons.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Add-ons</p>
                  <div className="flex flex-wrap gap-1.5">
                    {addons.map(id => <span key={id} className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-medium">{ADDONS.find(a => a.id === id)?.label}</span>)}
                  </div>
                </div>
              )}
              {notes && <div><p className="text-xs text-slate-400">Notes</p><p className="text-sm text-slate-700">{notes}</p></div>}
              <div className="border-t border-slate-100 pt-4 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="font-medium text-slate-800">{fmtSLE(subtotal)}</span></div>
                {discount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Duration Discount</span><span className="font-medium text-emerald-600">-{fmtSLE(discount)}</span></div>}
                <div className="flex justify-between items-baseline pt-1"><span className="font-bold text-slate-900">Total</span><span className="text-xl font-bold text-slate-900">{fmtSLE(total)}</span></div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('form')} className="px-6 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">Edit</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><CheckCircle2 className="w-4 h-4" />Submit for Review</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
        <button onClick={onCancel} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Services
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-slate-700" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900">Hire Private Security</h1>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">Deploy trained security personnel to your site. Choose your service type, guard count, and shift pattern.</p>
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          {/* Section 1 — Contact & Schedule */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Users} step={1} title="Contact & Schedule" />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name" required><input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" /></Field>
                <Field label="Phone" required><input className={inputCls} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+232..." /></Field>
              </div>
              <Field label="Email"><input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Start Date" required><input className={inputCls} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min={new Date().toISOString().split('T')[0]} /></Field>
                <Field label="City" required><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="Freetown" /></Field>
              </div>
              <Field label="Site Address" required>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} value={siteAddress} onChange={e => setSiteAddress(e.target.value)} placeholder="Street, building name, or landmark" />
                </div>
              </Field>
            </div>
          </div>

          {/* Section 2 — Service Type */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Shield} step={2} title="Service Type" />
            <p className="text-xs text-slate-500 mb-3">Select one or more security services needed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SERVICE_TYPES.map(s => (
                <button key={s.id} type="button" onClick={() => toggleService(s.id)} className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${serviceTypes.includes(s.id) ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${serviceTypes.includes(s.id) ? 'bg-slate-700 border-slate-700' : 'border-slate-300'}`}>
                    {serviceTypes.includes(s.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-slate-800">{s.label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{s.desc}</span>
                    {s.price > 0 && <span className="block text-xs font-medium text-slate-600 mt-1">{fmtSLE(s.price)}/mo per guard</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3 — Deployment Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Building2} step={3} title="Deployment Details" />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Number of Guards" required>
                  <input className={inputCls} type="number" value={guardCount} onChange={e => setGuardCount(e.target.value)} min="1" max="50" />
                </Field>
                <Field label="Site Type" required>
                  <select className={inputCls} value={siteType} onChange={e => setSiteType(e.target.value)}>
                    {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Shift Pattern <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {SHIFT_PATTERNS.map(s => <RadioCard key={s.id} label={s.label} sub={s.hours} checked={shiftPattern === s.id} onClick={() => setShiftPattern(s.id)} />)}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Contract Duration" required>
                  <select className={inputCls} value={contractDuration} onChange={e => setContractDuration(e.target.value)}>
                    {CONTRACT_DURATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </Field>
                <Field label="Risk Level" required>
                  <select className={inputCls} value={riskLevel} onChange={e => setRiskLevel(e.target.value)}>
                    {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          </div>

          {/* Section 4 — Add-ons */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Plus} step={4} title="Add-on Services" />
            <p className="text-xs text-slate-500 mb-3">Optional enhancements for your security deployment.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ADDONS.map(a => (
                <button key={a.id} type="button" onClick={() => toggleAddon(a.id)} className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${addons.includes(a.id) ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${addons.includes(a.id) ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                    {addons.includes(a.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-slate-800">{a.label}</span>
                    <span className="block text-xs font-medium text-slate-500 mt-0.5">{fmtSLE(a.price)}/mo</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 5 — Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={AlertTriangle} step={5} title="Additional Notes" />
            <Field label="Special Requirements">
              <textarea className={`${inputCls} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Specific threats, access codes, equipment needs, uniform preferences..." />
            </Field>
          </div>

          {/* Price Summary */}
          <div className="bg-slate-800 rounded-2xl p-5 text-white">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-slate-300">Subtotal</span><span>{fmtSLE(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-300">Duration Discount</span><span className="text-emerald-400">-{fmtSLE(discount)}</span></div>}
              <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-700"><span className="font-bold">Total</span><span className="text-xl font-bold">{fmtSLE(total)}</span></div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} className="px-6 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">Cancel</button>
          <button onClick={handleReview} disabled={!canReview} className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            <Eye className="w-4 h-4" />Review & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
