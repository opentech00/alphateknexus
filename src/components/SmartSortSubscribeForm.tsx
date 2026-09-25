import { useEffect, useState } from 'react';
import {
  ArrowLeft, Recycle, MapPin, Package, Leaf, HardHat, Zap,
  Clock, Trash2, ChevronDown, CheckCircle2, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './toast/toast';
import { LocationAutocomplete } from './LocationAutocomplete';
import { Field, inputClass, ErrorBanner } from './service-form/ServiceFormKit';
import {
  applyFieldErrors, collectErrors, validateAddress, validatePhone, validateRequired,
} from '../lib/serviceFormValidation';

interface Service {
  id: string; name: string; slug: string; description: string; icon: string; price_range: string;
}

interface SmartSortSubscribeFormProps {
  service: Service;
  onCancel: () => void;
  onSuccess?: () => void;
}

interface Plan {
  id: string;
  name: string;
  subtitle: string | null;
  price_sle: number;
  bin_size_liters: number;
  frequency: string;
  features: string[] | null;
}

const FALLBACK_PLANS: Plan[] = [
  { id: 'basic', name: 'Basic weekly', subtitle: 'Basic weekly offer', price_sle: 100, bin_size_liters: 25, frequency: 'weekly', features: null },
  { id: 'pro', name: 'Pro Bi-weekly', subtitle: 'Pro BI-weekly offer', price_sle: 200, bin_size_liters: 50, frequency: 'bi-weekly', features: null },
];

const WASTE_TYPES = [
  { id: 'general', label: 'General Waste', Icon: Trash2 },
  { id: 'recyclables', label: 'Recyclables', Icon: Recycle },
  { id: 'organic', label: 'Organic / Green', Icon: Leaf },
  { id: 'construction', label: 'Construction', Icon: HardHat },
  { id: 'ewaste', label: 'E-Waste', Icon: Zap },
  { id: 'bulk', label: 'Bulk Items', Icon: Package },
];

const BIN_SIZES = [
  { value: '25', label: '25 L' },
  { value: '50', label: '50 L' },
  { value: '120', label: '120 L' },
  { value: '250', label: '250 L' },
  { value: '350', label: '350 L' },
  { value: '600', label: '600 L' },
  { value: '1000', label: '1,000 L' },
];

const FREQUENCIES = [
  { id: 'daily', label: 'Daily' },
  { id: 'twice-weekly', label: 'Twice Weekly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'bi-weekly', label: 'Bi-Weekly' },
  { id: 'three-weeks', label: 'Every Three Weeks' },
  { id: 'monthly', label: 'Monthly' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning (7 AM – 11 AM)' },
  { id: 'afternoon', label: 'Afternoon (12 PM – 4 PM)' },
  { id: 'evening', label: 'Evening (5 PM – 6:30 PM)' },
];

export function SmartSortSubscribeForm({ service, onCancel, onSuccess }: SmartSortSubscribeFormProps) {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [customPlan, setCustomPlan] = useState(false);

  const [subWasteType, setSubWasteType] = useState('');
  const [subBinSize, setSubBinSize] = useState('25');
  const [subFrequency, setSubFrequency] = useState('weekly');
  const [subTimeSlot, setSubTimeSlot] = useState('');
  const [subAddress, setSubAddress] = useState('');
  const [subLandmark, setSubLandmark] = useState('');
  const [subPhone, setSubPhone] = useState('');
  const [subError, setSubError] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from('smart_sort_plans')
      .select('id, name, subtitle, price_sle, bin_size_liters, frequency, features')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data && data.length > 0) setPlans(data as Plan[]);
      });
  }, []);

  const choosePlan = (plan: Plan | null) => {
    if (plan) {
      setSubFrequency(plan.frequency);
      setSubBinSize(String(plan.bin_size_liters));
      setSelectedPlan(plan);
      setCustomPlan(false);
    } else {
      setSelectedPlan(null);
      setCustomPlan(true);
    }
    setFieldErrors({});
    setSubError('');
  };

  const showForm = selectedPlan !== null || customPlan;

  const validateSubForm = () => {
    const next = collectErrors({
      subWasteType: validateRequired(subWasteType, 'Waste type'),
      subTimeSlot: validateRequired(subTimeSlot, 'Time slot'),
      subAddress: validateAddress(subAddress),
      subPhone: validatePhone(subPhone),
    });
    setFieldErrors(next);
    if (!applyFieldErrors(next)) {
      setSubError('Please fix the highlighted fields before continuing.');
      return false;
    }
    setSubError('');
    return true;
  };

  const handleCreateSub = async () => {
    if (!validateSubForm()) return;
    setSubLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubError('Please sign in to create a subscription.');
      setSubLoading(false);
      return;
    }
    const { error: err } = await supabase.from('smart_sort_subscriptions').insert({
      user_id: user.id,
      waste_type: subWasteType,
      bin_size_liters: parseInt(subBinSize, 10),
      frequency: subFrequency,
      time_slot: subTimeSlot,
      address: subAddress,
      landmark: subLandmark || null,
      contact_phone: subPhone,
      plan_name: selectedPlan?.name || null,
      plan_price_sle: selectedPlan?.price_sle ?? null,
      status: 'active',
      auto_pay: true,
    });
    setSubLoading(false);
    if (err) { setSubError(err.message); return; }
    toast.success('Subscription created. Your first invoice and pickups are ready.');
    onSuccess?.();
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      <div className="max-w-3xl mx-auto px-4 pt-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className="p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Recycle className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Subscribe to {service.name}</h1>
              <p className="text-xs text-slate-500">Choose a plan, then add your collection address</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-6 space-y-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">1. Choose a plan</h2>
          <div className="space-y-3">
            {plans.map(plan => (
              <button
                key={plan.id}
                type="button"
                onClick={() => choosePlan(plan)}
                className={`w-full min-h-[44px] flex items-center justify-between p-4 border-2 rounded-xl text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  selectedPlan?.id === plan.id ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <Recycle className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{plan.name}</p>
                    {plan.subtitle && <p className="text-xs text-teal-600">{plan.subtitle}</p>}
                    <div className="flex gap-1.5 mt-1.5">
                      <span className="px-2 py-0.5 border border-slate-200 rounded-full text-xs text-slate-600">{plan.bin_size_liters}L bin</span>
                      <span className="px-2 py-0.5 border border-slate-200 rounded-full text-xs text-slate-600">{plan.frequency}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-xl font-bold text-slate-900">SLE {plan.price_sle}</p>
                  <p className="text-xs text-slate-400">/period</p>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => choosePlan(null)}
              className={`w-full min-h-[44px] py-3 border-2 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                customPlan ? 'border-slate-800 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Continue without a catalog plan
            </button>
          </div>
        </section>

        {showForm && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">2. Collection details</h2>
              {selectedPlan && (
                <p className="text-xs text-teal-600">{selectedPlan.name} · SLE {selectedPlan.price_sle}/period</p>
              )}
            </div>

            <div data-field="subWasteType">
              <p className="text-sm font-semibold text-slate-800 mb-2.5">Waste type <span className="text-rose-500">*</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {WASTE_TYPES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setSubWasteType(id); setFieldErrors(p => ({ ...p, subWasteType: '' })); }}
                    className={`flex flex-col items-center gap-1.5 p-3 min-h-[44px] rounded-xl border-2 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      subWasteType === id ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${subWasteType === id ? 'text-slate-800' : 'text-slate-400'}`} aria-hidden="true" />
                    <span className={`text-xs font-semibold leading-tight ${subWasteType === id ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span>
                  </button>
                ))}
              </div>
              {fieldErrors.subWasteType && <p className="mt-2 text-xs text-red-600">{fieldErrors.subWasteType}</p>}
            </div>

            {customPlan && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Bin size</label>
                  <div className="relative">
                    <select value={subBinSize} onChange={e => setSubBinSize(e.target.value)} className={`${inputClass()} appearance-none`}>
                      {BIN_SIZES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Pickup frequency</label>
                  <div className="relative">
                    <select value={subFrequency} onChange={e => setSubFrequency(e.target.value)} className={`${inputClass()} appearance-none`}>
                      {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </>
            )}

            <div data-field="subTimeSlot">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <label className="text-sm font-semibold text-slate-800">Preferred time slot <span className="text-rose-500">*</span></label>
              </div>
              <div className="space-y-2">
                {TIME_SLOTS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setSubTimeSlot(id); setFieldErrors(p => ({ ...p, subTimeSlot: '' })); }}
                    className={`w-full min-h-[44px] flex items-center gap-3 px-4 rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      subTimeSlot === id ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                  </button>
                ))}
              </div>
              {fieldErrors.subTimeSlot && <p className="mt-2 text-xs text-red-600">{fieldErrors.subTimeSlot}</p>}
            </div>

            <Field name="subAddress" label="Street address" required error={fieldErrors.subAddress}>
              <LocationAutocomplete
                value={subAddress}
                onChange={(v) => { setSubAddress(v); setFieldErrors(p => ({ ...p, subAddress: '' })); }}
                showLocate
                invalid={!!fieldErrors.subAddress}
                placeholder="e.g. 15 Siaka Stevens Street"
                inputClassName={`${inputClass(!!fieldErrors.subAddress)} pl-9`}
              />
            </Field>

            <Field label="Nearest landmark">
              <input type="text" value={subLandmark} onChange={e => setSubLandmark(e.target.value)} placeholder="e.g. Opposite National Stadium" className={inputClass()} />
            </Field>

            <Field name="subPhone" label="Contact phone" required error={fieldErrors.subPhone}>
              <input type="tel" value={subPhone} onChange={e => { setSubPhone(e.target.value); setFieldErrors(p => ({ ...p, subPhone: '' })); }} placeholder="+232 76 000 000" className={inputClass(!!fieldErrors.subPhone)} autoComplete="tel" />
            </Field>

            {subError && <ErrorBanner message={subError} />}

            <button
              type="button"
              onClick={handleCreateSub}
              disabled={subLoading}
              className="w-full min-h-[44px] py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {subLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {subLoading ? 'Creating…' : 'Confirm subscription'}
            </button>
            <p className="text-xs text-slate-400 text-center inline-flex items-center justify-center gap-1 w-full">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              You can change address, plan, and pickups from My Subscriptions after signup.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
