import { useState } from 'react';
import {
  Shield, ShieldCheck, X, CheckCircle2, ArrowLeft, Upload,
  Building2, Users, MapPin, FileText, AlertCircle, Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
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

const inputCls = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all';

const PROPERTY_TYPES = [
  'Residential Complex', 'Office Building', 'Retail / Mall', 'Warehouse',
  'Factory / Industrial', 'Event Venue', 'Construction Site', 'Government Building',
  'Hospital / Clinic', 'School / University', 'Hotel / Resort', 'Bank / Financial',
];

const SERVICE_SCOPES = [
  'Armed Guards', 'Unarmed Guards', 'CCTV / Surveillance', 'Access Control',
  'Event Security', 'Executive Protection', 'Mobile Patrols', 'K9 Units',
  'Alarm Monitoring', 'Escort Services', 'Crowd Control', 'Loss Prevention',
];

const COVERAGE_LEVELS = [
  { id: 'basic', label: 'Basic', desc: 'Daytime patrol, single shift' },
  { id: 'standard', label: 'Standard', desc: '12-hour coverage, 2 shifts' },
  { id: 'premium', label: 'Premium', desc: '24/7 coverage, multiple guards' },
  { id: 'custom', label: 'Custom', desc: 'Tailored to specific needs' },
];

const STAFF_SIZES = ['1–5 guards', '6–10 guards', '11–20 guards', '21–50 guards', '50+ guards'];
const CONTRACT_TERMS = ['One-off event', 'Short-term (1–3 mo)', '6 months', 'Annual', 'Multi-year'];
const RESPONSE_TIMES = ['Same day', 'Within 24h', 'Within 48h', 'Within 1 week'];

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

function SectionHeader({ icon: Icon, id, title }: { icon: React.ElementType; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 mb-4 border-b border-slate-100">
      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <span className="text-xs text-slate-400 font-medium">Section {id}</span>
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

function CheckboxItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${checked ? 'border-slate-600 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className={`w-4.5 h-4.5 rounded border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'bg-slate-700 border-slate-700' : 'border-slate-300'}`} style={{ width: '18px', height: '18px' }}>
        {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

export function PrivateSecurityQuoteForm({ service, onCancel, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // A. Company / Contact
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
  const [propertyType, setPropertyType] = useState('');
  const [propertySize, setPropertySize] = useState('');
  const [serviceScopes, setServiceScopes] = useState<string[]>([]);
  const [coverageLevel, setCoverageLevel] = useState('standard');
  const [startDate, setStartDate] = useState('');

  // C. Requirements
  const [staffSize, setStaffSize] = useState('1–5 guards');
  const [contractTerm, setContractTerm] = useState('Annual');
  const [responseTime, setResponseTime] = useState('Within 24h');
  const [armedPreference, setArmedPreference] = useState('either');
  const [specialRequirements, setSpecialRequirements] = useState('');

  // D. Documents
  const [docFiles, setDocFiles] = useState<File[]>([]);

  // E. Terms
  const [termsAccepted, setTermsAccepted] = useState(false);

  const toggleScope = (s: string) => setServiceScopes(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const canSubmit = companyName.trim() && contactPerson.trim() && phone.trim() && email.trim()
    && address.trim() && propertyType && serviceScopes.length > 0 && termsAccepted;

  const handleSubmit = async () => {
    if (!canSubmit) { setError('Please fill all required fields and accept the terms.'); return; }
    setLoading(true); setError('');

    const details = {
      quote_request: true,
      company_name: companyName, position, whatsapp,
      address, city, country,
      property_type: propertyType, property_size: propertySize,
      service_scopes: serviceScopes, coverage_level: coverageLevel,
      coverage_label: COVERAGE_LEVELS.find(c => c.id === coverageLevel)?.label,
      start_date: startDate,
      staff_size: staffSize, contract_term: contractTerm,
      response_time: responseTime, armed_preference: armedPreference,
      special_requirements: specialRequirements,
    };

    const { error: err } = await supabase.from('bookings').insert({
      service_id: service.id,
      contact_name: contactPerson, contact_phone: phone, contact_email: email,
      scheduled_date: startDate || new Date().toISOString().split('T')[0],
      location: `${address}, ${city}, ${country}`,
      notes: specialRequirements || null,
      details,
      status: 'pending_review',
    });

    setLoading(false);
    if (err) setError(err.message);
    else setSuccess(true);
  };

  if (success) {
    return (
      <ReviewSubmittedScreen
        serviceName={service.name}
        contactName={contactPerson}
        contactPhone={phone}
        onDone={onCancel}
        onViewBookings={onSuccess}
      />
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
              <h1 className="text-xl font-bold text-slate-900">Request a Security Quote</h1>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                Tell us about your property and security needs. We'll prepare a custom quotation within 24 hours.
              </p>
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          {/* A. Company / Contact */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Building2} id="A" title="Company / Contact Information" />
            <div className="space-y-4">
              <Field label="Company / Organization Name" required>
                <input className={inputCls} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company or organization" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Contact Person" required><input className={inputCls} value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Full name" /></Field>
                <Field label="Position / Title"><input className={inputCls} value={position} onChange={e => setPosition(e.target.value)} placeholder="Security Manager, CEO, etc." /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Phone" required><input className={inputCls} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+232..." /></Field>
                <Field label="WhatsApp"><input className={inputCls} type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+232..." /></Field>
              </div>
              <Field label="Email" required><input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
              <Field label="Address" required><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address of the site" /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="City" required><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="Freetown" /></Field>
                <Field label="Country"><input className={inputCls} value={country} onChange={e => setCountry(e.target.value)} /></Field>
              </div>
            </div>
          </div>

          {/* B. Property Profile */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={MapPin} id="B" title="Property Profile" />
            <div className="space-y-4">
              <Field label="Property Type" required>
                <select className={inputCls} value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                  <option value="">Select property type...</option>
                  {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Property Size / Area" hint="Approximate size of the area to be secured">
                <input className={inputCls} value={propertySize} onChange={e => setPropertySize(e.target.value)} placeholder="e.g. 5,000 sqm, 3 floors, 2-acre campus" />
              </Field>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Security Services Needed <span className="text-red-500">*</span></p>
                <p className="text-xs text-slate-400 mb-3">Select all that apply.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SERVICE_SCOPES.map(s => <CheckboxItem key={s} label={s} checked={serviceScopes.includes(s)} onClick={() => toggleScope(s)} />)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Coverage Level</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {COVERAGE_LEVELS.map(c => <RadioCard key={c.id} label={c.label} sub={c.desc} checked={coverageLevel === c.id} onClick={() => setCoverageLevel(c.id)} />)}
                </div>
              </div>
              <Field label="Preferred Start Date">
                <input className={inputCls} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
              </Field>
            </div>
          </div>

          {/* C. Requirements & Preferences */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Users} id="C" title="Requirements & Preferences" />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Estimated Staff Size" required>
                  <select className={inputCls} value={staffSize} onChange={e => setStaffSize(e.target.value)}>
                    {STAFF_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Contract Term" required>
                  <select className={inputCls} value={contractTerm} onChange={e => setContractTerm(e.target.value)}>
                    {CONTRACT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Required Response Time">
                  <select className={inputCls} value={responseTime} onChange={e => setResponseTime(e.target.value)}>
                    {RESPONSE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Armed / Unarmed Preference">
                  <select className={inputCls} value={armedPreference} onChange={e => setArmedPreference(e.target.value)}>
                    <option value="armed">Armed Only</option>
                    <option value="unarmed">Unarmed Only</option>
                    <option value="either">Either / Mixed</option>
                  </select>
                </Field>
              </div>
              <Field label="Special Requirements & Threat Profile" hint="Describe specific threats, access control needs, equipment requirements, uniform preferences, etc.">
                <textarea className={`${inputCls} resize-none`} rows={4} value={specialRequirements} onChange={e => setSpecialRequirements(e.target.value)} placeholder="e.g. High-risk area requiring armed guards with night vision equipment. Access control via biometric scanners. Guards must wear body cameras..." />
              </Field>
            </div>
          </div>

          {/* D. Supporting Documents */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={FileText} id="D" title="Supporting Documents" />
            <p className="text-xs text-slate-500 mb-4">
              Optional: Site photos, floor plans, risk assessment reports, or previous security contracts.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" /> Upload Documents
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                onChange={e => setDocFiles(Array.from(e.target.files ?? []))} />
            </label>
            <p className="mt-2 text-xs text-slate-400">PDF, JPG, PNG, DOC up to 10MB each.</p>
            {docFiles.length > 0 && (
              <div className="mt-3 space-y-1">
                {docFiles.map(f => (
                  <div key={f.name} className="flex items-center gap-2 text-xs text-slate-600">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> {f.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* E. Terms */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={AlertCircle} id="E" title="Terms & Conditions" />
            <label className="flex items-start gap-3 cursor-pointer group">
              <div onClick={() => setTermsAccepted(!termsAccepted)}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${termsAccepted ? 'bg-slate-800 border-slate-800' : 'border-slate-300 group-hover:border-slate-500'}`}>
                {termsAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-sm text-slate-600 leading-relaxed">
                I confirm the information provided is accurate and accept Alphatek Nexus's Private Security service terms. I understand this is a quote request and not a binding contract. <span className="text-red-500">*</span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} className="px-6 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !canSubmit} className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><FileText className="w-4 h-4" />Submit Quote Request</>}
          </button>
        </div>
      </div>
    </div>
  );
}
