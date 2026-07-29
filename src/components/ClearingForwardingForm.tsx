import { useState } from 'react';
import {
  Ship, X, CheckCircle2, Upload, ArrowLeft, ArrowRight,
  MapPin, Building2, Package, CreditCard, FileText, Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ServicePaymentStep, PaymentSuccessScreen, PaymentFailedScreen } from './ServicePaymentStep';

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

const INCOTERMS = ['EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', 'FCA', 'Other'];
const TRANSPORT_MODES = ['Sea', 'Air', 'Land'];
const PORTS = [
  'Queen Elizabeth II Quay',
  'Lungi International Airport',
  'Gbalamuya Border',
  'Jendema Border',
  'Other',
];
const REQUIRED_SERVICES = [
  'Customs Clearance',
  'Freight Forwarding',
  'Import Documentation',
  'Export Documentation',
  'Warehousing',
  'Transportation / Haulage',
  'Door-to-Door Delivery',
  'Cargo Tracking',
];
const PAYMENT_METHODS = ['Bank Transfer', 'Mobile Money', 'Cheque', 'Cash', 'Online Payment'];
const URGENCY = [
  { label: 'Standard', sub: 'Normal handling' },
  { label: 'Urgent', sub: 'Priority clearance' },
  { label: 'Emergency', sub: 'Expedited 24–48 hrs' },
];

function SectionHeader({ icon: Icon, step, title }: { icon: React.ElementType; step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
        {step}. {title}
      </h3>
    </div>
  );
}

function RadioCard({
  label, checked, onClick, sub,
}: { label: string; checked: boolean; onClick: () => void; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
        checked
          ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
        checked ? 'border-slate-800' : 'border-slate-300'
      }`}>
        {checked && <div className="w-2 h-2 rounded-full bg-slate-800" />}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}

function CheckboxCard({
  label, checked, onClick,
}: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full ${
        checked
          ? 'border-slate-800 bg-slate-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-slate-800' : 'border-2 border-slate-300 bg-white'
      }`}>
        {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 transition-all bg-white';

type Step = 'form' | 'review' | 'payment' | 'success' | 'payment_failed';

export function ClearingForwardingForm({ service, onCancel, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState('');

  // 1. Shipper / Consignee
  const [company, setCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // 2. Shipment Details
  const [direction, setDirection] = useState<'Import' | 'Export'>('Import');
  const [cargoDescription, setCargoDescription] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [weight, setWeight] = useState('');
  const [packages, setPackages] = useState('');
  const [containers, setContainers] = useState('');
  const [incoterm, setIncoterm] = useState('CIF');
  const [transportMode, setTransportMode] = useState('Sea');

  // 3. Route & Port of Entry
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('Freetown, Sierra Leone');
  const [port, setPort] = useState('Queen Elizabeth II Quay');
  const [arrivalDate, setArrivalDate] = useState('');
  const [urgency, setUrgency] = useState('Standard');

  // 4. Required Services
  const [requiredServices, setRequiredServices] = useState<string[]>(['Customs Clearance']);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [city, setCity] = useState('');

  // 5. Payment
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [poNumber, setPoNumber] = useState('');

  // 6. Documents & Notes
  const [notes, setNotes] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [docFiles, setDocFiles] = useState<File[]>([]);

  const toggleService = (s: string) =>
    setRequiredServices((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const handleReview = () => {
    if (!company || !contactPerson || !phone || !email || !cargoDescription || !origin || !arrivalDate) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!termsAccepted) {
      setError('You must accept the service terms to continue.');
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
      company,
      direction,
      cargo_description: cargoDescription,
      hs_code: hsCode,
      weight,
      packages,
      containers,
      incoterm,
      transport_mode: transportMode,
      origin,
      destination,
      port_of_entry: port,
      urgency,
      required_services: requiredServices,
      delivery_address: deliveryAddress,
      city,
      payment_method: paymentMethod,
      po_number: poNumber,
    };

    const { data: bookingRow, error: insertError } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user?.id,
      contact_name: contactPerson,
      contact_phone: phone,
      contact_email: email,
      scheduled_date: arrivalDate,
      location: destination,
      notes: notes || null,
      details,
      payment_status: 'pending',
    }).select('id').single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      setStep('form');
    } else {
      setBookingId(bookingRow.id);
      setStep('payment');
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Booking Submitted!</h2>
          <p className="mt-3 text-slate-500 leading-relaxed">
            Your Clearing &amp; Forwarding request has been received. Our team will contact
            <span className="font-medium text-slate-700"> {contactPerson}</span> at{' '}
            <span className="font-medium text-slate-700">{phone}</span> to confirm the details
            and begin clearance.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onSuccess}
              className="px-6 py-3 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors"
            >
              View My Bookings
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
            >
              Back to Services
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-slate-50 pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
          <button
            onClick={() => setStep('form')}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Edit form
          </button>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
            <div className="bg-slate-800 px-6 py-5 flex items-center gap-3">
              <Ship className="w-6 h-6 text-white" />
              <div>
                <h1 className="text-lg font-bold text-white">Review Booking</h1>
                <p className="text-slate-300 text-sm">Clearing &amp; Forwarding Shipment</p>
              </div>
            </div>

            <div className="p-6 space-y-5 text-sm">
              {[
                { label: 'Company', value: company },
                { label: 'Contact Person', value: contactPerson },
                { label: 'Phone', value: phone },
                { label: 'Email', value: email },
                { label: 'Direction', value: direction },
                { label: 'Cargo', value: cargoDescription },
                { label: 'Incoterm', value: incoterm },
                { label: 'Transport Mode', value: transportMode },
                { label: 'Origin', value: origin },
                { label: 'Port of Entry', value: port },
                { label: 'Expected Arrival', value: arrivalDate },
                { label: 'Urgency', value: urgency },
                { label: 'Required Services', value: requiredServices.join(', ') },
                { label: 'Payment Method', value: paymentMethod },
                ...(notes ? [{ label: 'Notes', value: notes }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4 py-2 border-b border-slate-100 last:border-0">
                  <span className="w-36 flex-shrink-0 text-slate-400 font-medium">{label}</span>
                  <span className="text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('form')}
              className="flex-1 py-3.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
            >
              Back &amp; Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Proceed to Payment</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main form
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
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Ship className="w-6 h-6 text-slate-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Book Clearing &amp; Forwarding Shipment</h1>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                Provide shipment, route and payment details. Our C&amp;F team will start clearance immediately.
              </p>
            </div>
            <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-4">
          {/* Section 1 — Shipper / Consignee */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Building2} step={1} title="Shipper / Consignee" />
            <div className="space-y-4">
              <Field label="Company Name" required>
                <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company or trading name" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Person" required>
                  <input className={inputCls} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Phone" required>
                  <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+232..." />
                </Field>
              </div>
              <Field label="Email" required>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </Field>
            </div>
          </div>

          {/* Section 2 — Shipment Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={Package} step={2} title="Shipment Details" />
            <div className="space-y-4">
              {/* Direction */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Direction</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['Import', 'Export'] as const).map((d) => (
                    <RadioCard key={d} label={d} checked={direction === d} onClick={() => setDirection(d)} />
                  ))}
                </div>
              </div>

              <Field label="Cargo Description" required>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  value={cargoDescription}
                  onChange={(e) => setCargoDescription(e.target.value)}
                  placeholder="e.g. 200 cartons of electronics, packing list available"
                />
              </Field>

              <div className="grid grid-cols-4 gap-3">
                <Field label="HS Code">
                  <input className={inputCls} value={hsCode} onChange={(e) => setHsCode(e.target.value)} />
                </Field>
                <Field label="Weight (kg)">
                  <input className={inputCls} type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </Field>
                <Field label="Packages">
                  <input className={inputCls} type="number" value={packages} onChange={(e) => setPackages(e.target.value)} />
                </Field>
                <Field label="Containers">
                  <input className={inputCls} value={containers} onChange={(e) => setContainers(e.target.value)} placeholder="20'/40'" />
                </Field>
              </div>

              {/* Incoterm */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Incoterm</p>
                <div className="flex flex-wrap gap-2">
                  {INCOTERMS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setIncoterm(t)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                        incoterm === t
                          ? 'border-slate-800 bg-slate-800 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode of Transport */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Mode of Transport</p>
                <div className="flex gap-3">
                  {TRANSPORT_MODES.map((m) => (
                    <RadioCard key={m} label={m} checked={transportMode === m} onClick={() => setTransportMode(m)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 — Route & Port of Entry */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={MapPin} step={3} title="Route & Port of Entry" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Origin" required>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input className={`${inputCls} pl-9`} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Port / city of origin" />
                  </div>
                </Field>
                <Field label="Destination" required>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input className={`${inputCls} pl-9`} value={destination} onChange={(e) => setDestination(e.target.value)} />
                  </div>
                </Field>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Preferred Port / Border of Entry</p>
                <div className="grid grid-cols-2 gap-3">
                  {PORTS.map((p) => (
                    <RadioCard key={p} label={p} checked={port === p} onClick={() => setPort(p)} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Expected Arrival Date" required>
                  <input
                    className={inputCls}
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </Field>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Urgency</p>
                  <div className="flex flex-col gap-2">
                    {URGENCY.map((u) => (
                      <RadioCard key={u.label} label={u.label} sub={u.sub} checked={urgency === u.label} onClick={() => setUrgency(u.label)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4 — Required Services */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={CheckCircle2} step={4} title="Required Services" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              {REQUIRED_SERVICES.map((s) => (
                <CheckboxCard key={s} label={s} checked={requiredServices.includes(s)} onClick={() => toggleService(s)} />
              ))}
            </div>
            <div className="space-y-3">
              <Field label="Delivery Address">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input className={`${inputCls} pl-9`} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Final delivery point" />
                </div>
              </Field>
              <Field label="City">
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Section 5 — Payment */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={CreditCard} step={5} title="Payment" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              {PAYMENT_METHODS.map((m) => (
                <RadioCard key={m} label={m} checked={paymentMethod === m} onClick={() => setPaymentMethod(m)} />
              ))}
            </div>
            <Field label="PO / Reference Number">
              <input className={inputCls} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </Field>
          </div>

          {/* Section 6 — Supporting Documents */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <SectionHeader icon={FileText} step={6} title="Supporting Documents" />
            <p className="text-xs text-slate-500 mb-4">
              Recommended: Bill of Lading, Commercial Invoice, Packing List, Import/Export License, Valid ID.
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

            <div className="mt-5 space-y-3">
              <Field label="Additional Notes">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special handling, references, contact preferences..."
                />
              </Field>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div
                  onClick={() => setTermsAccepted(!termsAccepted)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    termsAccepted ? 'bg-slate-800 border-slate-800' : 'border-slate-300 group-hover:border-slate-500'
                  }`}
                >
                  {termsAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm text-slate-600 leading-relaxed">
                  I confirm the shipment details above and accept Alphatek's Clearing &amp; Forwarding service terms.{' '}
                  <span className="text-red-500">*</span>
                </span>
              </label>
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
            onClick={handleReview}
            className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4" />
            Review Booking
          </button>
        </div>
      </div>
    </div>
  );
}
