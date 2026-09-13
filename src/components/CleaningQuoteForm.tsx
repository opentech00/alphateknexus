import { useState } from 'react';
import {
  Sparkles, X, Send, ArrowLeft, MapPin,
  Building2, BarChart3, CheckCircle2, AlertCircle, FileText, Upload,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReviewSubmittedScreen } from './ReviewSubmittedScreen';
import { LocationAutocomplete } from './LocationAutocomplete';
import { Field, inputClass, ErrorBanner } from './service-form/ServiceFormKit';
import {
  applyFieldErrors, collectErrors, todayISO,
  validateAddress, validateDate, validateEmail, validateName, validatePhone, validateRequired,
} from '../lib/serviceFormValidation';

interface Service {
  id: string; name: string; slug: string;
  description: string; icon: string; price_range: string;
}
interface Props { service: Service; onCancel: () => void; onSuccess: () => void; }

const BUSINESS_TYPES = ['Residential', 'Commercial', 'Industrial', 'Government / NGO', 'Other'];
const SERVICE_TYPES = [
  'Regular Office Cleaning', 'Deep Cleaning', 'Post-Construction Cleanup',
  'Carpet & Upholstery', 'Window Cleaning', 'Floor Stripping & Waxing',
  'Sanitization / Disinfection', 'Waste Collection', 'Landscaping / Grounds',
];
const FREQUENCIES = ['One-time', 'Daily', 'Weekly', 'Bi-weekly', 'Monthly'];
const SIZES = ['< 1,000 sqft', '1,000–5,000 sqft', '5,000–10,000 sqft', '10,000+ sqft'];
const PAYMENT_METHODS = ['Bank Transfer', 'Mobile Money', 'Cheque', 'Cash', 'Online Payment'];

function SectionHeader({ icon: Icon, id, title }: { icon: React.ElementType; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-blue-600" />
      </div>
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">{id}. {title}</h3>
    </div>
  );
}

function RadioCard({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full ${checked ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'border-blue-600' : 'border-slate-300'}`}>
        {checked && <div className="w-2 h-2 rounded-full bg-blue-600" />}
      </div>
      <span className="text-sm text-slate-700 font-medium">{label}</span>
    </button>
  );
}

function CheckboxItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full ${checked ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
        {checked && <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

export function CleaningQuoteForm({ service, onCancel, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // A. Customer
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Sierra Leone');

  // B. Property Profile
  const [businessType, setBusinessType] = useState('');
  const [propertySize, setPropertySize] = useState('');
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('Weekly');
  const [startDate, setStartDate] = useState('');

  // C. Requirements
  const [suppliesProvided, setSuppliesProvided] = useState<'We provide' | 'Client provides' | 'Shared'>('We provide');
  const [staffCount, setStaffCount] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');

  // D. Documents
  const [docFiles, setDocFiles] = useState<File[]>([]);

  // E. Terms
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const toggleService = (s: string) => {
    setServiceTypes(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
    setFieldErrors(p => ({ ...p, serviceTypes: '' }));
  };

  const handleSubmit = async () => {
    const next = collectErrors({
      companyName: validateRequired(companyName, 'Company / customer name'),
      contactPerson: validateName(contactPerson, 'Contact person'),
      phone: validatePhone(phone),
      whatsapp: validatePhone(whatsapp, false),
      email: validateEmail(email, true),
      address: validateAddress(address),
      businessType: validateRequired(businessType, 'Property type'),
      propertySize: validateRequired(propertySize, 'Property size'),
      serviceTypes: serviceTypes.length === 0 ? 'Select at least one service.' : '',
      startDate: validateDate(startDate, 'Preferred start date', false),
      terms: termsAccepted ? '' : 'You must accept the service terms to submit.',
    });
    setFieldErrors(next);
    if (!applyFieldErrors(next)) {
      setError('Please fix the highlighted fields before continuing.');
      return;
    }
    setError('');
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Please sign in to submit a quote request.');
      setLoading(false);
      return;
    }

    const details = {
      quote_request: true,
      company_name: companyName, position, whatsapp: whatsapp || null,
      address, city, country,
      business_type: businessType, property_size: propertySize,
      service_types: serviceTypes, frequency, start_date: startDate || null,
      supplies_provided: suppliesProvided, staff_count: staffCount || null,
      special_requirements: specialRequirements || null,
      payment_method: paymentMethod,
    };

    const arrivalDate = startDate || new Date().toISOString().split('T')[0];
    const { error: err } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user.id,
      contact_name: contactPerson, contact_phone: phone,
      contact_email: email,
      scheduled_date: arrivalDate,
      location: `${address}, ${city}, ${country}`,
      notes: specialRequirements || null,
      details,
      status: 'pending_review',
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSubmitted(true);
  };

  if (submitted) return (
    <ReviewSubmittedScreen
      serviceName={service.name}
      contactName={contactPerson}
      contactPhone={phone}
      onDone={onCancel}
      onViewBookings={onSuccess}
    />
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
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-900">Cleaning &amp; Janitorial — Request for Quote</h1>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                Complete the form below. Our operations team will respond within 24 hours with a tailored quote.
              </p>
            </div>
            <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

        <div className="space-y-4">
          {/* Section A — Customer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Building2} id="A" title="Customer / Company Information" />
            <div className="space-y-4">
              <Field name="companyName" label="Company / Customer Name" required error={fieldErrors.companyName}>
                <input className={inputClass(!!fieldErrors.companyName, 'blue')} value={companyName} onChange={e => { setCompanyName(e.target.value); setFieldErrors(p => ({ ...p, companyName: '' })); }} placeholder="Your company or name" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field name="contactPerson" label="Contact Person" required error={fieldErrors.contactPerson}>
                  <input className={inputClass(!!fieldErrors.contactPerson, 'blue')} value={contactPerson} onChange={e => { setContactPerson(e.target.value); setFieldErrors(p => ({ ...p, contactPerson: '' })); }} placeholder="Full name" autoComplete="name" />
                </Field>
                <Field label="Position / Title">
                  <input className={inputClass(false, 'blue')} value={position} onChange={e => setPosition(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field name="phone" label="Phone" required error={fieldErrors.phone}>
                  <input className={inputClass(!!fieldErrors.phone, 'blue')} type="tel" value={phone} onChange={e => { setPhone(e.target.value); setFieldErrors(p => ({ ...p, phone: '' })); }} placeholder="+232..." autoComplete="tel" />
                </Field>
                <Field name="whatsapp" label="WhatsApp (if any)" error={fieldErrors.whatsapp}>
                  <input className={inputClass(!!fieldErrors.whatsapp, 'blue')} type="tel" value={whatsapp} onChange={e => { setWhatsapp(e.target.value); setFieldErrors(p => ({ ...p, whatsapp: '' })); }} placeholder="+232..." />
                </Field>
              </div>
              <Field name="email" label="Email Address" required error={fieldErrors.email}>
                <input className={inputClass(!!fieldErrors.email, 'blue')} type="email" value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }} placeholder="email@example.com" autoComplete="email" />
              </Field>
              <Field name="address" label="Service Address" required error={fieldErrors.address}>
                <LocationAutocomplete
                  value={address}
                  onChange={(v) => { setAddress(v); setFieldErrors(p => ({ ...p, address: '' })); }}
                  onSelect={(s) => { if (s.city) setCity(s.city); if (s.country) setCountry(s.country); }}
                  showLocate
                  invalid={!!fieldErrors.address}
                  placeholder="Property address"
                  inputClassName={`${inputClass(!!fieldErrors.address, 'blue')} pl-9`}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="City"><input className={inputClass(false, 'blue')} value={city} onChange={e => setCity(e.target.value)} /></Field>
                <Field label="Country"><input className={inputClass(false, 'blue')} value={country} onChange={e => setCountry(e.target.value)} /></Field>
              </div>
            </div>
          </div>

          {/* Section B — Property Profile */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={BarChart3} id="B" title="Property Profile" />
            <div className="space-y-5">
              <div data-field="businessType">
                <p className="text-sm font-medium text-slate-700 mb-3">Property Type <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BUSINESS_TYPES.map(t => <RadioCard key={t} label={t} checked={businessType === t} onClick={() => { setBusinessType(t); setFieldErrors(p => ({ ...p, businessType: '' })); }} />)}
                </div>
                {fieldErrors.businessType && <p className="mt-2 text-xs text-red-600">{fieldErrors.businessType}</p>}
              </div>
              <div data-field="propertySize">
                <p className="text-sm font-medium text-slate-700 mb-3">Property Size <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SIZES.map(s => <RadioCard key={s} label={s} checked={propertySize === s} onClick={() => { setPropertySize(s); setFieldErrors(p => ({ ...p, propertySize: '' })); }} />)}
                </div>
                {fieldErrors.propertySize && <p className="mt-2 text-xs text-red-600">{fieldErrors.propertySize}</p>}
              </div>
              <div data-field="serviceTypes">
                <p className="text-sm font-medium text-slate-700 mb-3">Services Required <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SERVICE_TYPES.map(s => <CheckboxItem key={s} label={s} checked={serviceTypes.includes(s)} onClick={() => toggleService(s)} />)}
                </div>
                {fieldErrors.serviceTypes && <p className="mt-2 text-xs text-red-600">{fieldErrors.serviceTypes}</p>}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Service Frequency</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {FREQUENCIES.map(f => <RadioCard key={f} label={f} checked={frequency === f} onClick={() => setFrequency(f)} />)}
                </div>
              </div>
              <Field name="startDate" label="Preferred Start Date" error={fieldErrors.startDate}>
                <input className={inputClass(!!fieldErrors.startDate, 'blue')} type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setFieldErrors(p => ({ ...p, startDate: '' })); }} min={todayISO()} />
              </Field>
            </div>
          </div>

          {/* Section C — Requirements */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={CheckCircle2} id="C" title="Requirements & Preferences" />
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Cleaning Supplies &amp; Equipment</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['We provide', 'Client provides', 'Shared'] as const).map(s => (
                    <RadioCard key={s} label={s} checked={suppliesProvided === s} onClick={() => setSuppliesProvided(s)} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Number of Staff Needed">
                  <input className={inputClass(false, 'blue')} type="number" value={staffCount} onChange={e => setStaffCount(e.target.value)} placeholder="e.g. 3" />
                </Field>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Preferred Payment Method</p>
                  <select className={inputClass(false, 'blue')} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <Field label="Special Requirements">
                <textarea className={`${inputClass(false, 'blue')} resize-none`} rows={3} value={specialRequirements} onChange={e => setSpecialRequirements(e.target.value)} placeholder="Access restrictions, security clearance, eco-friendly products, etc." />
              </Field>
            </div>
          </div>

          {/* Section D — Documents */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={FileText} id="D" title="Supporting Documents" />
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 leading-relaxed">
              Optional: Site photos, floor plans, previous cleaning contracts, or any reference documents.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" /> Upload Documents
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={e => setDocFiles(Array.from(e.target.files ?? []))} />
            </label>
            <p className="mt-2 text-xs text-slate-400">PDF, JPG, PNG, DOC up to 10MB each.</p>
            {docFiles.length > 0 && (
              <div className="mt-3 space-y-1">
                {docFiles.map(f => <div key={f.name} className="flex items-center gap-2 text-xs text-slate-600"><FileText className="w-3.5 h-3.5 text-slate-400" />{f.name}</div>)}
              </div>
            )}
          </div>

          {/* Section E — Terms */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={AlertCircle} id="E" title="Terms & Conditions" />
            <label data-field="terms" className="flex items-start gap-3 cursor-pointer group">
              <div onClick={() => { setTermsAccepted(!termsAccepted); setFieldErrors(p => ({ ...p, terms: '' })); }}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${termsAccepted ? 'bg-blue-600 border-blue-600' : fieldErrors.terms ? 'border-red-400' : 'border-slate-300 group-hover:border-blue-400'}`}>
                {termsAccepted && <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span className="text-sm text-slate-600 leading-relaxed">
                I confirm the information above is accurate and accept Alphatek's Cleaning &amp; Janitorial service{' '}
                <span className="text-blue-600 underline cursor-pointer">terms</span> and{' '}
                <span className="text-blue-600 underline cursor-pointer">conditions</span>. <span className="text-red-500">*</span>
              </span>
            </label>
            {fieldErrors.terms && <p className="mt-2 text-xs text-red-600">{fieldErrors.terms}</p>}
            <div className="mt-5 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 flex-shrink-0"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Quotes are typically delivered within 24 hours via email or phone.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="px-6 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><Send className="w-4 h-4" />Request Quote</>}
          </button>
        </div>
      </div>
    </div>
  );
}
