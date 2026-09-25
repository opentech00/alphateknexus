import { useState } from 'react';
import { X, Plus, Trash2, Package, CheckCircle2, MapPin, Calendar, Eye, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ServicePaymentStep, PaymentSuccessScreen, PaymentFailedScreen } from './ServicePaymentStep';
import { ReviewSubmittedScreen } from './ReviewSubmittedScreen';
import { Portal } from '../lib/portal';
import { LocationAutocomplete } from './LocationAutocomplete';
import { Field, inputClass, ErrorBanner } from './service-form/ServiceFormKit';
import {
  applyFieldErrors, collectErrors, todayISO,
  validateAddress, validateDate, validateEmail, validateName, validatePhone, validateRequired,
} from '../lib/serviceFormValidation';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

interface Item {
  description: string;
  qty: number;
  unit: string;
  specs: string;
}

interface Props {
  service: Service;
  onCancel: () => void;
  onSuccess: () => void;
}

const CURRENCIES = ['SLE', 'USD', 'EUR'];
const PROCUREMENT_FEE_SLE = 100;

function newItem(): Item {
  return { description: '', qty: 1, unit: 'unit', specs: '' };
}

export function ProcurementHireForm({ service, onCancel, onSuccess }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [neededBy, setNeededBy] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'form' | 'review' | 'payment' | 'success' | 'payment_failed' | 'review_submitted'>('form');
  const [bookingId, setBookingId] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const addItem = () => setItems((prev) => [...prev, newItem()]);
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    setFieldErrors((p) => ({ ...p, items: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validItems = items.filter((it) => it.description.trim());
    const next = collectErrors({
      title: validateRequired(title, 'Title'),
      contactName: validateName(contactName, 'Contact name'),
      phone: validatePhone(phone),
      email: validateEmail(email, true),
      neededBy: validateDate(neededBy, 'Needed-by date'),
      deliveryAddress: validateAddress(deliveryAddress),
      items: validItems.length === 0
        ? 'Add at least one item with a description.'
        : items.some((it) => it.description.trim() && it.qty < 1)
          ? 'Quantity must be at least 1.'
          : '',
    });
    setFieldErrors(next);
    if (!applyFieldErrors(next)) {
      setError('Please fix the highlighted fields before continuing.');
      return;
    }

    const details = {
      type: 'procurement',
      procurement_title: title.trim(),
      procurement_description: description.trim() || null,
      currency,
      needed_by: neededBy || null,
      delivery_address: deliveryAddress.trim() || null,
      items: validItems,
      total_sle: PROCUREMENT_FEE_SLE,
    };

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to submit your request.');
        return;
      }
      const { data: bookingRow, error: err } = await supabase.from('bookings').insert({
        service_id: service.id,
        user_id: user.id,
        contact_name: contactName.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim() || null,
        scheduled_date: neededBy || new Date().toISOString().split('T')[0],
        scheduled_time: null,
        location: deliveryAddress.trim() || null,
        notes: description.trim() || null,
        details,
        payment_status: 'pending',
        status: 'pending_review',
      }).select('id').single();

      if (err) {
        setError(err.message);
      } else {
        setBookingId(bookingRow.id);
        setStep('review_submitted');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'payment') return (
    <ServicePaymentStep
      amount={PROCUREMENT_FEE_SLE}
      bookingId={bookingId}
      serviceName={service.name}
      serviceSlug={service.slug}
      onBack={() => setStep('form')}
      onSuccess={(method, ref) => { setPayMethod(method); setPayRef(ref || ''); setStep('success'); }}
      onFail={(msg) => { setPayError(msg); setStep('payment_failed'); }}
    />
  );

  if (step === 'review_submitted') return (
    <ReviewSubmittedScreen
      serviceName={service.name}
      contactName={contactName}
      contactPhone={phone}
      onDone={onCancel}
      onViewBookings={onSuccess}
    />
  );

  if (step === 'payment_failed') return (
    <PaymentFailedScreen
      message={payError}
      onRetry={() => setStep('payment')}
      onViewBookings={onSuccess}
    />
  );

  if (success || step === 'success') {
    return (
      <PaymentSuccessScreen
        serviceName={service.name}
        amount={PROCUREMENT_FEE_SLE}
        method={payMethod}
        contactName={contactName}
        contactPhone={phone}
        reference={payRef}
        onDone={onCancel}
        onViewBookings={onSuccess}
      />
    );
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 py-6" style={{ height: '100dvh' }} onTouchMove={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">New Procurement Request</h2>
              <p className="text-xs text-slate-400 mt-0.5">Submit items for sourcing & purchasing</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form id="proc-hire-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <ErrorBanner message={error} />}

          <Field name="title" label="Title" required error={fieldErrors.title}>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setFieldErrors(p => ({ ...p, title: '' })); }}
              placeholder="e.g. Office furniture for new branch"
              className={inputClass(!!fieldErrors.title, 'rose')}
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, special requirements..."
              className={`${inputClass(false, 'rose')} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="contactName" label="Contact Name" required error={fieldErrors.contactName}>
              <input
                type="text"
                value={contactName}
                onChange={(e) => { setContactName(e.target.value); setFieldErrors(p => ({ ...p, contactName: '' })); }}
                placeholder="Your full name"
                className={inputClass(!!fieldErrors.contactName, 'rose')}
                autoComplete="name"
              />
            </Field>
            <Field name="phone" label="Phone" required error={fieldErrors.phone}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setFieldErrors(p => ({ ...p, phone: '' })); }}
                placeholder="+232 76 000 000"
                className={inputClass(!!fieldErrors.phone, 'rose')}
                autoComplete="tel"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="email" label="Email" required error={fieldErrors.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }}
                placeholder="you@example.com"
                className={inputClass(!!fieldErrors.email, 'rose')}
                autoComplete="email"
              />
            </Field>
            <Field label="Currency">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputClass(false, 'rose')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="neededBy" label={<span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-400" /> Needed by</span>} required error={fieldErrors.neededBy}>
              <input
                type="date"
                value={neededBy}
                onChange={(e) => { setNeededBy(e.target.value); setFieldErrors(p => ({ ...p, neededBy: '' })); }}
                min={todayISO()}
                className={inputClass(!!fieldErrors.neededBy, 'rose')}
              />
            </Field>
            <Field name="deliveryAddress" label={<span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> Delivery Address</span>} required error={fieldErrors.deliveryAddress}>
              <LocationAutocomplete
                value={deliveryAddress}
                onChange={(v) => { setDeliveryAddress(v); setFieldErrors(p => ({ ...p, deliveryAddress: '' })); }}
                showLocate
                invalid={!!fieldErrors.deliveryAddress}
                placeholder="Street, city, country"
                inputClassName={`${inputClass(!!fieldErrors.deliveryAddress, 'rose')} pl-9`}
              />
            </Field>
          </div>

          <div data-field="items">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                Items <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-400 px-3 py-1.5 rounded-lg transition-colors bg-rose-50 hover:bg-rose-100"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    placeholder="Item description"
                    className={`${inputClass(!!fieldErrors.items, 'rose')} flex-1 min-w-0`}
                  />
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                    className={`${inputClass(!!fieldErrors.items && item.qty < 1, 'rose')} sm:w-16 text-center`}
                  />
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateItem(i, { unit: e.target.value })}
                    placeholder="unit"
                    className={`${inputClass(false, 'rose')} sm:w-20`}
                  />
                  <input
                    type="text"
                    value={item.specs}
                    onChange={(e) => updateItem(i, { specs: e.target.value })}
                    placeholder="Specs"
                    className={`${inputClass(false, 'rose')} sm:w-28`}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {fieldErrors.items ? (
              <p className="mt-1.5 text-xs text-red-600">{fieldErrors.items}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">
                Fill in description, quantity, unit (e.g. pcs, kg, box) and optional specs per item.
              </p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-slate-100 flex-shrink-0 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={loading}
            className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
