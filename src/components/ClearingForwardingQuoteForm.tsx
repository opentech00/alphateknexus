import { useState } from 'react';
import {
  Ship, X, CheckCircle2, Upload, ArrowLeft, Send, MapPin,
  Building2, BarChart3, FileText, AlertCircle, Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReviewSubmittedScreen } from './ReviewSubmittedScreen';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

interface Props {
  service: Service;
  onCancel: () => void;
  onSuccess: () => void;
}

const BUSINESS_TYPES = [
  'Importer', 'Exporter', 'Manufacturer', 'Distributor',
  'Retailer', 'NGO / Project', 'Government Institution', 'Other',
];
const PORTS = [
  'Queen Elizabeth II Quay',
  'Lungi International Airport',
  'Gbalamuya Border',
  'Jendema Border',
  'Other',
];
const SHIPMENT_FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly', 'Occasionally'];
const CF_SERVICES = [
  'Customs Clearance', 'Freight Forwarding',
  'Import Documentation', 'Export Documentation',
  'Warehousing', 'Transportation / Haulage',
  'Door-to-Door Delivery', 'Cargo Tracking',
];
const MONTHLY_VOLUMES = ['1–5 Shipments', '6–10 Shipments', '11–20 Shipments', '20+ Shipments'];
const PAYMENT_METHODS = ['Bank Transfer', 'Mobile Money', 'Cheque', 'Cash', 'Online Payment'];

function SectionHeader({ icon: Icon, id, title }: { icon: React.ElementType; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-600" />
      </div>
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
        {id}. {title}
      </h3>
    </div>
  );
}

function RadioCard({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full ${
        checked
          ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
        checked ? 'border-blue-600' : 'border-slate-300'
      }`}>
        {checked && <div className="w-2 h-2 rounded-full bg-blue-600" />}
      </div>
      <span className="text-sm text-slate-700 font-medium">{label}</span>
    </button>
  );
}

function CheckboxItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full ${
        checked ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
      }`}>
        {checked && (
          <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

function Field({
  label, required, children, hint,
}: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
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

const inputCls =
  'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white';

export function ClearingForwardingQuoteForm({ service, onCancel, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // A. Customer / Company Information
  const [companyName, setCompanyName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [tin, setTin] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Sierra Leone');
  const [website, setWebsite] = useState('');

  // B. Import / Export Profile
  const [businessType, setBusinessType] = useState('');
  const [goodsNature, setGoodsNature] = useState('');
  const [preferredPorts, setPreferredPorts] = useState<string[]>([]);
  const [shipmentFrequency, setShipmentFrequency] = useState('Monthly');

  // C. Services Required
  const [requiredServices, setRequiredServices] = useState<string[]>([]);
  const [otherService, setOtherService] = useState('');
  const [monthlyVolume, setMonthlyVolume] = useState('1–5 Shipments');
  const [serviceFee, setServiceFee] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');

  // D. Documents
  const [docFiles, setDocFiles] = useState<File[]>([]);

  // E. Terms
  const [specialTerms, setSpecialTerms] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const togglePort = (p: string) =>
    setPreferredPorts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const toggleService = (s: string) =>
    setRequiredServices((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const handleSubmit = async () => {
    if (!companyName || !contactPerson || !phone || !email || !address || !businessType || !goodsNature) {
      setError('Please fill in all required fields (sections A and B).');
      return;
    }
    if (!termsAccepted) {
      setError('You must accept the service terms to submit the quote request.');
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
      company_name: companyName,
      business_registration_number: regNumber || null,
      tin: tin || null,
      position,
      whatsapp: whatsapp || null,
      address,
      city,
      country,
      website: website || null,
      business_type: businessType,
      goods_nature: goodsNature,
      preferred_ports: preferredPorts,
      shipment_frequency: shipmentFrequency,
      required_services: requiredServices,
      other_service: otherService || null,
      monthly_volume: monthlyVolume,
      agreed_service_fee: serviceFee || null,
      payment_method: paymentMethod,
      special_terms: specialTerms || null,
    };

    const arrivalDate = expectedArrival || new Date().toISOString().split('T')[0];

    const { error: insertError } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user.id,
      contact_name: contactPerson,
      contact_phone: phone,
      contact_email: email,
      scheduled_date: arrivalDate,
      location: `${address}, ${city}, ${country}`,
      notes: specialTerms || null,
      details,
      status: 'pending_review',
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
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
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Ship className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-900">Clearing &amp; Forwarding — Request for Service &amp; Subscription</h1>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                Complete the form below. Our C&amp;F operations team will respond within 24 hours.
              </p>
            </div>
            <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Section A — Customer / Company Information */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Building2} id="A" title="Customer / Company Information" />
            <div className="space-y-4">
              <Field label="Company / Customer Name" required>
                <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Business Registration Number">
                  <input className={inputCls} value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
                </Field>
                <Field label="Tax Identification Number (TIN)">
                  <input className={inputCls} value={tin} onChange={(e) => setTin(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Person" required>
                  <input className={inputCls} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Position / Title">
                  <input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone" required>
                  <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+232..." />
                </Field>
                <Field label="WhatsApp (if any)">
                  <input className={inputCls} type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+232..." />
                </Field>
              </div>

              <Field label="Email Address" required>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>

              <Field label="Office / Customer Address" required>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    className={`${inputCls} pl-9`}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Search your business address"
                  />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="Country">
                  <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
                </Field>
              </div>

              <Field label="Website (if any)">
                <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </Field>
            </div>
          </div>

          {/* Section B — Import / Export Profile */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={BarChart3} id="B" title="Import / Export Profile" />
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Type of Business <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {BUSINESS_TYPES.map((t) => (
                    <RadioCard key={t} label={t} checked={businessType === t} onClick={() => setBusinessType(t)} />
                  ))}
                </div>
              </div>

              <Field label="Nature of Goods Handled" required>
                <input
                  className={inputCls}
                  value={goodsNature}
                  onChange={(e) => setGoodsNature(e.target.value)}
                  placeholder="e.g. Electronics, foodstuffs, building materials..."
                />
              </Field>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" />
                    Preferred Ports / Borders
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {PORTS.map((p) => (
                    <CheckboxItem key={p} label={p} checked={preferredPorts.includes(p)} onClick={() => togglePort(p)} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Estimated Shipment Frequency</p>
                <div className="grid grid-cols-2 gap-2">
                  {SHIPMENT_FREQUENCIES.map((f) => (
                    <RadioCard key={f} label={f} checked={shipmentFrequency === f} onClick={() => setShipmentFrequency(f)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section C — Services Required */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={CheckCircle2} id="C" title="Services Required" />
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Select all required services <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {CF_SERVICES.map((s) => (
                    <CheckboxItem key={s} label={s} checked={requiredServices.includes(s)} onClick={() => toggleService(s)} />
                  ))}
                </div>
              </div>

              <Field label="Other (specify)">
                <input className={inputCls} value={otherService} onChange={(e) => setOtherService(e.target.value)} />
              </Field>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Estimated Monthly Shipment Volume</p>
                <div className="grid grid-cols-2 gap-2">
                  {MONTHLY_VOLUMES.map((v) => (
                    <RadioCard key={v} label={v} checked={monthlyVolume === v} onClick={() => setMonthlyVolume(v)} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Agreed Service Fee / Retainer (Le)">
                  <input
                    className={inputCls}
                    type="text"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                    placeholder="e.g. 5,000,000"
                  />
                </Field>
                <Field label="Expected Time of Arrival">
                  <input
                    className={inputCls}
                    type="date"
                    value={expectedArrival}
                    onChange={(e) => setExpectedArrival(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </Field>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Preferred Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <RadioCard key={m} label={m} checked={paymentMethod === m} onClick={() => setPaymentMethod(m)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section D — Required Documents */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={FileText} id="D" title="Required Documents" />
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 leading-relaxed">
              Please attach copies of: Business Registration Certificate, Tax Clearance Certificate,
              Import/Export License (if available), Valid ID of Authorized Representative, Bill of Lading.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Upload Documents
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={(e) => setDocFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            <p className="mt-2 text-xs text-slate-400">PDF, JPG, PNG, DOC up to 10MB each.</p>
            {docFiles.length > 0 && (
              <div className="mt-3 space-y-1">
                {docFiles.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs text-slate-600">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {f.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section E — Terms & Conditions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={AlertCircle} id="E" title="Terms & Conditions" />
            <Field label="">
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                value={specialTerms}
                onChange={(e) => setSpecialTerms(e.target.value)}
                placeholder="Any special terms, conditions, or remarks (optional)"
              />
            </Field>

            <label className="mt-4 flex items-start gap-3 cursor-pointer group">
              <div
                onClick={() => setTermsAccepted(!termsAccepted)}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  termsAccepted ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-blue-400'
                }`}
              >
                {termsAccepted && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-slate-600 leading-relaxed">
                I confirm the information above is accurate and accept Alphatek's Clearing &amp; Forwarding service{' '}
                <span className="text-blue-600 underline cursor-pointer">terms</span> and{' '}
                <span className="text-blue-600 underline cursor-pointer">conditions</span>.{' '}
                <span className="text-red-500">*</span>
              </span>
            </label>

            <div className="mt-5 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 flex-shrink-0">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Quotes are typically delivered within 24 hours via email or phone.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
            ) : (
              <><Send className="w-4 h-4" /> Request Quote</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
