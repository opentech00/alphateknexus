import { useState } from 'react';
import {
  X, MessageSquare, MapPin, Trash2, Truck, Sparkles,
  Clock, ChevronDown, CheckCircle2, AlertCircle, Send,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReviewSubmittedScreen } from './ReviewSubmittedScreen';

interface Service { id: string; name: string; slug: string; }

interface Props {
  service: Service;
  onCancel: () => void;
  onSuccess: () => void;
}

const PROPERTY_TYPES = [
  'Residential (House / Flat)', 'Apartment Block / Estate', 'Office / Commercial',
  'Hotel / Guesthouse', 'Restaurant / Bar', 'Market / Retail',
  'School / University', 'Hospital / Clinic', 'Industrial / Warehouse',
  'Construction Site', 'Government / NGO', 'Event / Temporary',
];

const WASTE_STREAMS = [
  'General / Mixed', 'Organic / Food', 'Plastics',
  'Paper & Cardboard', 'Glass', 'Metal / Cans',
  'E-waste', 'Medical', 'Hazardous / Chemical',
  'Construction Debris', 'Garden / Green', 'Used Oil / Grease',
];

const VOLUME_OPTIONS = [
  'Under 50 kg', '50–150 kg', '150–300 kg',
  '300 kg – 1 tonne', '1–3 tonnes', '3–5 tonnes', 'Over 5 tonnes',
];

const CONTAINER_OPTIONS = [
  'Provide bins', 'I have my own bins', 'Open skip required',
  'Compactor needed', 'Liquid tanker needed',
];

const SERVICE_TYPES = [
  'One-off pickup', 'Weekly', 'Every 2 weeks',
  'Monthly', 'On demand', 'Event / project',
];

const FREQ_OPTIONS = ['1× per period', '2× per period', '3× per period', '4× per period', 'As needed'];

const TIME_WINDOWS = [
  'Morning (6–10 AM)', 'Mid-morning (10 AM–12 PM)',
  'Afternoon (12–4 PM)', 'Late afternoon (4–6 PM)', 'Flexible',
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CONTRACT_DURATIONS = [
  'Ongoing / Open-ended', '3 months', '6 months', '12 months', 'Once-off',
];

const ADD_ONS = [
  'Staff sorting training', 'Bin wash / sanitising', 'Compliance report',
  'Deep clean after pickup', 'Disposal certificate', 'On-site weighing',
  'Witnessed disposal (CCTV)', 'On-site shredding',
];

const BUDGET_RANGES = [
  'Under SLE 500,000', 'SLE 500,000 – 1,000,000', 'SLE 1M – 2M',
  'SLE 2M – 5M', 'SLE 5M – 10M', 'Over SLE 10M', 'No budget set',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white';

function Sel({ value, onChange, options, placeholder = 'Select...' }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputCls + ' appearance-none pr-8'}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-all select-none ${
        active
          ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-medium'
          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  );
}

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-slate-600" />
        </div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | string[] | number | boolean | null }) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className="flex gap-3 py-1.5 text-sm border-b border-slate-100 last:border-0">
      <span className="text-slate-500 w-40 flex-shrink-0">{label}</span>
      <span className="text-slate-800 font-medium">{display}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function SmartSortQuoteForm({ service, onCancel, onSuccess }: Props) {
  // view: 'form' | 'preview' | 'done'
  const [view, setView] = useState<'form' | 'preview' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Client
  const [company, setCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  // ── Pickup location
  const [propertyType, setPropertyType] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Freetown');
  const [landmark, setLandmark] = useState('');
  const [occupants, setOccupants] = useState('');
  const [accessNotes, setAccessNotes] = useState('');

  // ── Waste profile
  const [wasteStreams, setWasteStreams] = useState<string[]>([]);
  const [volumePerPickup, setVolumePerPickup] = useState('');
  const [containers, setContainers] = useState('Provide bins');
  const [numBins, setNumBins] = useState(1);
  const [hasHazardous, setHasHazardous] = useState(false);

  // ── Service plan
  const [serviceType, setServiceType] = useState('Weekly');
  const [pickupFrequency, setPickupFrequency] = useState('1× per period');
  const [preferredTime, setPreferredTime] = useState('Morning (6–10 AM)');
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [contractDuration, setContractDuration] = useState('Ongoing / Open-ended');

  // ── Add-ons & budget
  const [addOns, setAddOns] = useState<string[]>([]);
  const [includeRecyclingReport, setIncludeRecyclingReport] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // ── validation ────────────────────────────────────────────────────────────

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!contactPerson.trim()) e.contactPerson = 'Contact person is required.';
    if (!phone.trim()) e.phone = 'Phone number is required.';
    if (!propertyType) e.propertyType = 'Property type is required.';
    if (!address.trim()) e.address = 'Address is required.';
    if (wasteStreams.length === 0) e.wasteStreams = 'Select at least one waste stream.';
    if (!volumePerPickup) e.volumePerPickup = 'Estimated volume is required.';
    if (!serviceType) e.serviceType = 'Service type is required.';
    if (!startDate) e.startDate = 'Preferred start date is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRequestQuote = () => {
    if (validate()) setView('preview');
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError('Please sign in to submit a quote request.');
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user.id,
      contact_name: contactPerson,
      contact_phone: phone,
      contact_email: email || null,
      scheduled_date: startDate || new Date().toISOString().split('T')[0],
      location: [address.trim(), city].filter(Boolean).join(', '),
      notes: additionalNotes || null,
      status: 'pending_review',
      details: {
        type: 'smart-sort-quote',
        quote_request: true,
        company,
        position,
        whatsapp,
        property_type: propertyType,
        city,
        landmark,
        occupants,
        access_notes: accessNotes,
        waste_streams: wasteStreams,
        volume_per_pickup: volumePerPickup,
        containers,
        num_bins: numBins,
        has_hazardous: hasHazardous,
        service_type: serviceType,
        pickup_frequency: pickupFrequency,
        preferred_time: preferredTime,
        preferred_days: preferredDays,
        contract_duration: contractDuration,
        add_ons: addOns,
        include_recycling_report: includeRecyclingReport,
        monthly_budget: monthlyBudget,
      },
    });
    setLoading(false);
    if (err) { setSubmitError(err.message); return; }
    setView('done');
  };

  // ── done screen ───────────────────────────────────────────────────────────

  if (view === 'done') {
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

  // ── preview screen ────────────────────────────────────────────────────────

  if (view === 'preview') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <h2 className="font-bold text-slate-900">Review Your Quote Request</h2>
            <button onClick={() => setView('form')} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Client</p>
              <ReviewRow label="Contact person" value={contactPerson} />
              <ReviewRow label="Company" value={company} />
              <ReviewRow label="Position" value={position} />
              <ReviewRow label="Phone" value={phone} />
              <ReviewRow label="WhatsApp" value={whatsapp} />
              <ReviewRow label="Email" value={email} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pickup Location</p>
              <ReviewRow label="Property type" value={propertyType} />
              <ReviewRow label="Address" value={address} />
              <ReviewRow label="City" value={city} />
              <ReviewRow label="Landmark" value={landmark} />
              <ReviewRow label="Occupants" value={occupants} />
              <ReviewRow label="Access notes" value={accessNotes} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Waste Profile</p>
              <ReviewRow label="Waste streams" value={wasteStreams} />
              <ReviewRow label="Volume per pickup" value={volumePerPickup} />
              <ReviewRow label="Containers" value={containers} />
              <ReviewRow label="Number of bins" value={numBins} />
              <ReviewRow label="Hazardous present" value={hasHazardous} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Service Plan</p>
              <ReviewRow label="Service type" value={serviceType} />
              <ReviewRow label="Pickup frequency" value={pickupFrequency} />
              <ReviewRow label="Preferred time" value={preferredTime} />
              <ReviewRow label="Preferred days" value={preferredDays} />
              <ReviewRow label="Start date" value={startDate ? new Date(startDate + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} />
              <ReviewRow label="Contract duration" value={contractDuration} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Add-ons & Budget</p>
              <ReviewRow label="Add-ons" value={addOns} />
              <ReviewRow label="Recycling report" value={includeRecyclingReport} />
              <ReviewRow label="Monthly budget" value={monthlyBudget} />
              <ReviewRow label="Additional notes" value={additionalNotes} />
            </div>
            {submitError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {submitError}
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
            <button
              onClick={() => setView('form')}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1e293b] text-white font-semibold rounded-xl hover:bg-[#0f172a] transition-colors disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Submitting…' : 'Confirm & Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── form ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-start gap-2.5">
            <MessageSquare className="w-5 h-5 text-slate-700 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-slate-900 leading-tight">Smart Sort — Waste Management Quote Request</h2>
              <p className="text-xs text-emerald-600 mt-1 leading-relaxed">
                Share your property, waste streams and preferred schedule so we can price the right{' '}
                <span className="font-medium">Smart Sort plan.</span>
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-3 flex-shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-4">

          {/* ── Section 1: Client ── */}
          <SectionCard icon={MessageSquare} title="Client">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company / Organization">
                <input
                  type="text" value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Optional" className={inputCls}
                />
              </Field>
              <Field label="Contact person" required>
                <input
                  type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)}
                  placeholder="Full name" className={inputCls + (errors.contactPerson ? ' border-red-400' : '')}
                />
                {errors.contactPerson && <p className="text-xs text-red-500 mt-1">{errors.contactPerson}</p>}
              </Field>
              <Field label="Position / Role">
                <input
                  type="text" value={position} onChange={e => setPosition(e.target.value)}
                  placeholder="e.g. Facility Manager" className={inputCls}
                />
              </Field>
              <Field label="Phone" required>
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+232..." className={inputCls + (errors.phone ? ' border-red-400' : '')}
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </Field>
              <Field label="WhatsApp">
                <input
                  type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                  placeholder="+232..." className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" className={inputCls}
                />
              </Field>
            </div>
          </SectionCard>

          {/* ── Section 2: Pickup location ── */}
          <SectionCard icon={MapPin} title="Pickup location">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Property type" required>
                <Sel value={propertyType} onChange={setPropertyType} options={PROPERTY_TYPES} />
                {errors.propertyType && <p className="text-xs text-red-500 mt-1">{errors.propertyType}</p>}
              </Field>
              <Field label="Address" required>
                <input
                  type="text" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Street, area" className={inputCls + (errors.address ? ' border-red-400' : '')}
                />
                {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
              </Field>
              <Field label="City">
                <input
                  type="text" value={city} onChange={e => setCity(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Landmark / directions">
                <input
                  type="text" value={landmark} onChange={e => setLandmark(e.target.value)}
                  placeholder="Near..." className={inputCls}
                />
              </Field>
            </div>
            <Field label="Occupants / Staff on site">
              <input
                type="number" min={0} value={occupants} onChange={e => setOccupants(e.target.value)}
                className={inputCls + ' w-40'}
              />
            </Field>
            <Field label="Access notes (gates, narrow road, stairs…)">
              <textarea
                rows={3} value={accessNotes} onChange={e => setAccessNotes(e.target.value)}
                className={inputCls + ' resize-none'}
              />
            </Field>
          </SectionCard>

          {/* ── Section 3: Waste profile ── */}
          <SectionCard icon={Trash2} title="Waste profile">
            <Field label="Waste streams" required>
              <div className="flex flex-wrap gap-2 mt-1">
                {WASTE_STREAMS.map(s => (
                  <ChipToggle
                    key={s} label={s}
                    active={wasteStreams.includes(s)}
                    onClick={() => setWasteStreams(prev => toggle(prev, s))}
                  />
                ))}
              </div>
              {errors.wasteStreams && <p className="text-xs text-red-500 mt-1">{errors.wasteStreams}</p>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimated volume per pickup" required>
                <Sel value={volumePerPickup} onChange={setVolumePerPickup} options={VOLUME_OPTIONS} />
                {errors.volumePerPickup && <p className="text-xs text-red-500 mt-1">{errors.volumePerPickup}</p>}
              </Field>
              <Field label="Containers">
                <Sel value={containers} onChange={setContainers} options={CONTAINER_OPTIONS} placeholder="Provide bins" />
              </Field>
            </div>
            <Field label="Number of bins needed">
              <input
                type="number" min={1} value={numBins}
                onChange={e => setNumBins(Math.max(1, Number(e.target.value)))}
                className={inputCls + ' w-32'}
              />
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox" checked={hasHazardous}
                onChange={e => setHasHazardous(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">Hazardous, medical or chemical waste is present</span>
            </label>
          </SectionCard>

          {/* ── Section 4: Service plan ── */}
          <SectionCard icon={Truck} title="Service plan">
            <Field label="Service type" required>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {SERVICE_TYPES.map(t => (
                  <label key={t} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-sm transition-all ${
                    serviceType === t
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}>
                    <input
                      type="radio" name="serviceType" value={t}
                      checked={serviceType === t}
                      onChange={() => setServiceType(t)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    {t}
                  </label>
                ))}
              </div>
              {errors.serviceType && <p className="text-xs text-red-500 mt-1">{errors.serviceType}</p>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pickup frequency">
                <Sel value={pickupFrequency} onChange={setPickupFrequency} options={FREQ_OPTIONS} placeholder="1× per period" />
              </Field>
              <Field label="Preferred time window">
                <Sel value={preferredTime} onChange={setPreferredTime} options={TIME_WINDOWS} placeholder="Morning (6–10 AM)" />
              </Field>
            </div>
            <Field label="Preferred pickup days">
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map(d => (
                  <ChipToggle
                    key={d} label={d}
                    active={preferredDays.includes(d)}
                    onClick={() => setPreferredDays(prev => toggle(prev, d))}
                  />
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred start date" required>
                <input
                  type="date" value={startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setStartDate(e.target.value)}
                  className={inputCls + (errors.startDate ? ' border-red-400' : '')}
                />
                {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
              </Field>
              <Field label="Contract duration">
                <Sel value={contractDuration} onChange={setContractDuration} options={CONTRACT_DURATIONS} placeholder="Ongoing / Open-ended" />
              </Field>
            </div>
          </SectionCard>

          {/* ── Section 5: Add-ons & budget ── */}
          <SectionCard icon={Sparkles} title="Add-ons & budget">
            <Field label="Optional add-ons">
              <div className="flex flex-wrap gap-2 mt-1">
                {ADD_ONS.map(a => (
                  <ChipToggle
                    key={a} label={a}
                    active={addOns.includes(a)}
                    onClick={() => setAddOns(prev => toggle(prev, a))}
                  />
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox" checked={includeRecyclingReport}
                onChange={e => setIncludeRecyclingReport(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <Sparkles className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm text-slate-700">Include monthly recycling / diversion report</span>
            </label>
            <Field label="Monthly budget (SLE)">
              <Sel value={monthlyBudget} onChange={setMonthlyBudget} options={BUDGET_RANGES} placeholder="Select a range (optional)" />
            </Field>
            <Field label="Additional notes">
              <textarea
                rows={3} value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)}
                placeholder="Anything else our Smart Sort team should know..."
                className={inputCls + ' resize-none'}
              />
            </Field>

            {/* Info notices */}
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  A Smart Sort coordinator will confirm scope, container drop-off and pricing within 24 hours.
                </p>
              </div>
              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  Quotes are typically delivered within{' '}
                  <span className="text-emerald-600 font-medium">24 hours</span> via email or phone.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button" onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button" onClick={handleRequestQuote}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors"
          >
            <Send className="w-4 h-4" />
            Request Quote
          </button>
        </div>
      </div>
    </div>
  );
}
