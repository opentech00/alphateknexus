import { useState, useEffect, lazy, Suspense } from 'react';
import {
  ArrowLeft, Calendar, MapPin, Clock, CheckCircle2,
  ChevronRight, Wallet, Smartphone, ShieldCheck,
  Loader2, Receipt as ReceiptIcon, XCircle, Banknote,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/toast/toast';
import { pollPaymentStatus, startMonimePayment } from '../lib/monime';

const SERVICE_FEE = 25;
import { SchedulingCalendar } from '../components/SchedulingCalendar';
import { ReceiptModal } from '../components/ReceiptModal';
import { LocationAutocomplete } from '../components/LocationAutocomplete';
import { Field, inputClass, ErrorBanner } from '../components/service-form/ServiceFormKit';
import {
  applyFieldErrors, collectErrors,
  validateAddress, validateDate, validateEmail, validateName, validatePhone,
} from '../lib/serviceFormValidation';
const AddressPickerMap = lazy(() =>
  import('../components/map/AddressPickerMap').then((m) => ({ default: m.AddressPickerMap })),
);
import { ClearingForwardingForm } from '../components/ClearingForwardingForm';
import { ClearingForwardingQuoteForm } from '../components/ClearingForwardingQuoteForm';
import { SmartSortPickupForm } from '../components/SmartSortPickupForm';
import { SmartSortSubscribeForm } from '../components/SmartSortSubscribeForm';
import { SmartSortQuoteForm } from '../components/SmartSortQuoteForm';
import { CleaningHireForm } from '../components/CleaningHireForm';
import { CleaningQuoteForm } from '../components/CleaningQuoteForm';
import { ProcurementHireForm } from '../components/ProcurementHireForm';
import { ProcurementQuoteForm } from '../components/ProcurementQuoteForm';
import { PrivateSecurityHireForm } from '../components/PrivateSecurityHireForm';
import { PrivateSecurityQuoteForm } from '../components/PrivateSecurityQuoteForm';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { ChannelPills, le, PayOption, SecureNote } from '../components/checkout/CheckoutUi';

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

interface RebookData {
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  location: string | null;
  notes: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface BookingPageProps {
  service: Service | null;
  onNavigate: (page: string) => void;
  rebookData?: RebookData | null;
  mode?: 'hire' | 'quote' | 'pickup' | 'subscribe';
}

type Step = 'form' | 'summary' | 'payment' | 'success' | 'payment_failed';

function MobileHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex-shrink-0 bg-white border-b border-slate-100 safe-area-pt no-select">
      <div className="relative flex items-center justify-between px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-blue-600 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-bold text-slate-900 pointer-events-none">
          {title}
        </h1>
        <div className="w-16" />
      </div>
    </header>
  );
}

function SummaryStep({
  service,
  formData,
  onBack,
  onProceed,
}: {
  service: Service;
  formData: any;
  onBack: () => void;
  onProceed: () => void;
}) {
  const dateLabel = formData.scheduled_date
    ? new Date(formData.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Not selected';

  const rows = [
    { icon: <Calendar className="w-4 h-4 text-slate-400" />, label: 'Date', value: dateLabel },
    { icon: <Clock className="w-4 h-4 text-slate-400" />, label: 'Time', value: formData.scheduled_time || 'Any time' },
    { icon: <MapPin className="w-4 h-4 text-slate-400" />, label: 'Location', value: formData.location || 'Not specified' },
  ];

  const serviceFee = SERVICE_FEE;
  const total = SERVICE_FEE;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto mobile-scroll p-4 md:p-6 pb-28">
        <h2 className="text-lg font-bold text-slate-900 mb-1 md:hidden">Booking Summary</h2>
        <p className="text-sm text-slate-500 mb-5 md:hidden">Review your booking details before payment.</p>

        {/* Service card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
            <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Service</p>
            <p className="text-white font-bold text-base mt-0.5">{service.name}</p>
            <p className="text-blue-100 text-xs mt-1 line-clamp-2">{service.description}</p>
          </div>
          <div className="p-5 space-y-3.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-medium">{r.label}</p>
                  <p className="text-sm text-slate-800 font-medium mt-0.5">{r.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3">Contact</p>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Name</span>
              <span className="text-slate-800 font-medium">{formData.contact_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Phone</span>
              <span className="text-slate-800 font-medium">{formData.contact_phone}</span>
            </div>
            {formData.contact_email && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Email</span>
                <span className="text-slate-800 font-medium truncate ml-3">{formData.contact_email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Price breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3">Price Breakdown</p>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Service charge</span>
              <span className="text-slate-800 font-medium">Le {serviceFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Platform fee</span>
              <span className="text-slate-500">Free</span>
            </div>
            <div className="h-px bg-slate-100 my-2" />
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900">Total</span>
              <span className="text-xl font-bold text-slate-900">Le {total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky proceed button */}
      <div className="flex-shrink-0 bg-white border-t border-slate-100 px-4 md:px-6 py-3 safe-area-pb">
        <button
          onClick={onProceed}
          className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm no-select flex items-center justify-center gap-2"
        >
          Proceed to Payment
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PaymentStep({
  service,
  formData,
  total,
  onBack,
  onPay,
  paying,
}: {
  service: Service;
  formData: any;
  total: number;
  onBack: () => void;
  onPay: (methodId: string) => void;
  paying: boolean;
}) {
  const [selected, setSelected] = useState<string>('monime');
  const { wallet_enabled } = useFeatureFlags();

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto mobile-scroll p-4 md:p-6 pb-4">
        <h2 className="text-lg font-bold text-slate-900 mb-1">How would you like to pay?</h2>
        <p className="text-sm text-slate-500 mb-5">{service.name}</p>

        <div className="md:grid md:grid-cols-[minmax(0,1fr)_240px] md:gap-5 md:items-start">
          <div role="radiogroup" aria-label="Payment method" className="space-y-2.5">
            <PayOption
              accent="blue"
              selected={selected === 'monime'}
              onSelect={() => setSelected('monime')}
              title="Pay with Monime"
              hint="Mobile money, card, or bank"
              icon={<span className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white"><Smartphone className="w-5 h-5" /></span>}
            />
            {selected === 'monime' && (
              <div className="px-1 animate-slideUp"><ChannelPills /></div>
            )}
            {wallet_enabled && (
              <PayOption
                accent="blue"
                selected={selected === 'wallet'}
                onSelect={() => setSelected('wallet')}
                title="Wallet balance"
                hint="Use store credit"
                icon={<span className="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center text-white"><Wallet className="w-5 h-5" /></span>}
              />
            )}
            <PayOption
              accent="blue"
              selected={selected === 'cash'}
              onSelect={() => setSelected('cash')}
              title="Cash on delivery"
              hint="Pay the crew when they arrive"
              icon={<span className="w-11 h-11 rounded-xl bg-amber-600 flex items-center justify-center text-white"><Banknote className="w-5 h-5" /></span>}
            />
            {selected === 'cash' && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 leading-relaxed animate-slideUp">
                Have {le(total)} ready. A numbered receipt is issued when it is collected.
              </div>
            )}
          </div>
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-xs font-medium text-slate-500">Due now</p>
            <p key={total} className="text-2xl font-bold text-slate-900 tabular-nums animate-scaleIn">{le(total)}</p>
            <SecureNote />
          </div>
        </div>
        <div className="mt-4 md:hidden"><SecureNote /></div>
      </div>

      <div className="flex-shrink-0 bg-white/95 backdrop-blur border-t border-slate-100 px-4 md:px-6 py-3 safe-area-pb">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <div className="md:hidden min-w-0">
            <p className="text-[11px] text-slate-500">Due now</p>
            <p key={selected} className="text-lg font-bold text-slate-900 tabular-nums animate-scaleIn">{le(total)}</p>
          </div>
          <button
            onClick={() => onPay(selected)}
            disabled={paying}
            className="flex-1 min-h-[48px] py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm no-select flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span className="truncate">{paying ? 'Opening secure checkout…' : selected === 'monime' ? 'Pay with Monime' : `Pay ${le(total)}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function BookingPage({ service, onNavigate, rebookData, mode = 'hire' }: BookingPageProps) {
  const [formData, setFormData] = useState({
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    scheduled_date: '',
    scheduled_time: '',
    location: '',
    notes: '',
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState('');
  const [payReference, setPayReference] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rebookData) {
      setFormData({
        contact_name: rebookData.contact_name || '',
        contact_phone: rebookData.contact_phone || '',
        contact_email: rebookData.contact_email || '',
        scheduled_date: rebookData.scheduled_date || '',
        scheduled_time: rebookData.scheduled_time || '',
        location: rebookData.location || '',
        notes: rebookData.notes || '',
        latitude: rebookData.latitude ?? null,
        longitude: rebookData.longitude ?? null,
      });
    }
  }, [rebookData]);

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">No service selected.</p>
          <button
            onClick={() => onNavigate('services')}
            className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Browse Services
          </button>
        </div>
      </div>
    );
  }

  // Smart Sort — quote modal (rendered as overlay, no other page content needed)
  if (service.slug === 'waste-management' && mode === 'quote') {
    return (
      <SmartSortQuoteForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
      />
    );
  }

  // Smart Sort — subscribe / pickup
  if (service.slug === 'waste-management') {
    if (mode === 'subscribe') {
      return (
        <SmartSortSubscribeForm
          service={service}
          onCancel={() => onNavigate('services')}
          onSuccess={() => onNavigate('smart-sort-subs')}
        />
      );
    }
    return (
      <SmartSortPickupForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
        rebookData={rebookData}
      />
    );
  }

  // Cleaning & Janitorial
  if (service.slug === 'cleaning-janitorial') {
    if (mode === 'quote') {
      return (
        <CleaningQuoteForm
          service={service}
          onCancel={() => onNavigate('services')}
          onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
        />
      );
    }
    return (
      <CleaningHireForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
      />
    );
  }

  // Clearing & Forwarding
  if (service.slug === 'clearing-forwarding') {
    if (mode === 'quote') {
      return (
        <ClearingForwardingQuoteForm
          service={service}
          onCancel={() => onNavigate('services')}
          onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
        />
      );
    }
    return (
      <ClearingForwardingForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
      />
    );
  }

  // Private Security
  if (service.slug === 'private-security') {
    if (mode === 'quote') {
      return (
        <PrivateSecurityQuoteForm
          service={service}
          onCancel={() => onNavigate('services')}
          onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
        />
      );
    }
    return (
      <PrivateSecurityHireForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
      />
    );
  }

  // Procurement
  if (service.slug === 'procurement') {
    if (mode === 'quote') {
      return (
        <ProcurementQuoteForm
          service={service}
          onCancel={() => onNavigate('services')}
          onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
        />
      );
    }
    return (
      <ProcurementHireForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => { toast.success('Request submitted'); onNavigate('bookings'); }}
      />
    );
  }

  const handlePay = async (methodId: string) => {
    setLoading(true);
    setError('');
    setPaymentError('');

    try {
      // Validate required fields before insert
      if (!formData.scheduled_date) {
        setError('Please select a date before proceeding.');
        setStep('form');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be signed in to book a service.');
        return;
      }

      const isCash = methodId === 'cash';
      const isWallet = methodId === 'wallet';

      const { data: bookingData, error: insertError } = await supabase.from('bookings').insert({
        service_id: service.id,
        user_id: user.id,
        contact_name: formData.contact_name,
        contact_phone: formData.contact_phone,
        contact_email: formData.contact_email || null,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time || null,
        location: formData.location || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        notes: formData.notes || null,
        details: { total_sle: SERVICE_FEE },
        status: 'pending_review',
        payment_method: isCash ? 'cash' : isWallet ? 'wallet' : 'monime',
        payment_status: isCash ? 'pending_cash' : 'pending',
      }).select('id').single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      // Send booking confirmation email (fire-and-forget)
      supabase.functions.invoke('send-booking-email', {
        body: {
          eventType: 'booking_confirmation',
          bookingId: bookingData.id,
          userId: user.id,
          serviceName: service.name,
          scheduledDate: formData.scheduled_date,
          scheduledTime: formData.scheduled_time || null,
          location: formData.location || null,
        },
      }).catch(() => {});

      // Cash on Delivery: create a pending cash payment record, skip online checkout
      if (isCash) {
        const { error: payErr } = await supabase.from('payments').insert({
          user_id: user.id,
          payable_type: 'booking',
          payable_id: bookingData.id,
          amount_sle: SERVICE_FEE,
          method: 'cash',
          status: 'pending',
        });
        if (payErr) {
          setPaymentError('Your booking was created but we could not record the cash payment request. Please contact support.');
          setStep('payment_failed');
          return;
        }
        setPayReference('');
        setStep('success');
        return;
      }

      if (isWallet) {
        const { data: walletResult, error: walletErr } = await supabase.rpc('pay_booking_from_wallet', {
          p_booking_id: bookingData.id,
          p_amount: SERVICE_FEE,
        });
        if (walletErr || !walletResult?.success) {
          setPaymentError(
            walletResult?.error === 'Insufficient wallet balance.'
              ? `Insufficient wallet balance. You have SLE ${Number(walletResult?.balance ?? 0).toLocaleString()} but need SLE ${SERVICE_FEE.toLocaleString()}.`
              : walletResult?.error || walletErr?.message || 'Wallet payment could not be completed.',
          );
          setStep('payment_failed');
          return;
        }
        setPayReference(bookingData.id.slice(0, 8));
        setStep('success');
        return;
      }

      const result = await startMonimePayment(
        SERVICE_FEE,
        'booking',
        bookingData.id,
        `BK-${bookingData.id.slice(0, 8)}`,
        { nextPage: 'bookings' },
      );
      setPayReference(result.reference);
      if (result.redirected) return;
      const pollResult = await pollPaymentStatus(result.reference);
      if (pollResult.status !== 'completed') {
        setPaymentError(
          pollResult.status === 'failed' ? 'Payment was declined or failed.' :
          pollResult.status === 'cancelled' ? 'Payment was cancelled.' :
          'Payment could not be confirmed in time. You can retry from your bookings page.'
        );
        setStep('payment_failed');
        return;
      }
      setStep('success');
    } catch (err: any) {
      setPaymentError(err.message || 'Payment failed. Your booking was created — you can retry from your bookings page.');
      setStep('payment_failed');
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (step === 'success') {
    return (
      <>
      <div className="min-h-screen flex items-center justify-center pt-4 px-4 safe-area-pt">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
          <p className="mt-3 text-gray-600">
            Your booking for <span className="font-semibold">{service.name}</span> has been submitted successfully. Our team will reach out to confirm the details.
          </p>
          {!payReference && (
            <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 leading-relaxed text-left">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <Banknote className="w-4 h-4" /> Cash on Delivery
              </div>
              Please have <span className="font-semibold">SLE {SERVICE_FEE.toFixed(2)}</span> ready when our team arrives to deliver the service. A numbered receipt will be issued on collection.
            </div>
          )}
          {payReference && (
            <button
              onClick={() => setShowReceipt(true)}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors"
            >
              <ReceiptIcon className="w-4 h-4" /> View Payment Receipt
            </button>
          )}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => onNavigate('bookings')}
              className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
            >
              View My Bookings
            </button>
            <button
              onClick={() => onNavigate('services')}
              className="px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              Book Another Service
            </button>
          </div>
        </div>
      </div>
      {showReceipt && payReference && (
        <ReceiptModal
          paymentReference={payReference}
          onClose={() => setShowReceipt(false)}
          onViewBookings={() => onNavigate('bookings')}
        />
      )}
      </>
    );
  }

  // Payment failed screen
  if (step === 'payment_failed') {
    return (
      <div className="min-h-screen flex items-center justify-center pt-4 px-4 safe-area-pt">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Incomplete</h2>
          <p className="mt-3 text-gray-600">
            {paymentError || 'Payment could not be completed. Your booking was created — you can retry payment from your bookings page.'}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setStep('payment')}
              className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Retry Payment
            </button>
            <button
              onClick={() => onNavigate('bookings')}
              className="px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              View My Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Summary step
  if (step === 'summary') {
    return (
      <div className="relative h-screen flex flex-col bg-slate-50">
        {/* Mobile header (hidden on desktop) */}
        <div className="md:hidden">
          <MobileHeader title="Summary" onBack={() => setStep('form')} />
        </div>
        {/* Desktop header (hidden on mobile) */}
        <div className="hidden md:block flex-shrink-0 bg-white border-b border-slate-100">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setStep('form')}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Form
            </button>
            <h1 className="text-lg font-bold text-slate-900">Booking Summary</h1>
            <div className="w-28" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden relative max-w-3xl mx-auto w-full">
          <SummaryStep
            service={service}
            formData={formData}
            onBack={() => setStep('form')}
            onProceed={() => setStep('payment')}
          />
        </div>
      </div>
    );
  }

  // Payment method step
  if (step === 'payment') {
    return (
      <div className="relative h-screen flex flex-col bg-slate-50">
        {/* Mobile header */}
        <div className="md:hidden">
          <MobileHeader title="Payment" onBack={() => setStep('summary')} />
        </div>
        {/* Desktop header */}
        <div className="hidden md:block flex-shrink-0 bg-white border-b border-slate-100">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setStep('summary')}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Summary
            </button>
            <h1 className="text-lg font-bold text-slate-900">Payment Method</h1>
            <div className="w-28" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden relative max-w-3xl mx-auto w-full">
          <PaymentStep
            service={service}
            formData={formData}
            total={SERVICE_FEE}
            onBack={() => setStep('summary')}
            onPay={handlePay}
            paying={loading}
          />
        </div>
      </div>
    );
  }

  // Default: form step (works on both mobile + desktop)
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => onNavigate('services')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-8 mt-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </button>

        {rebookData && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Rebooking — your previous details have been pre-filled. Just pick a new date and time.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 lg:p-8">
            <h1 className="text-xl lg:text-2xl font-bold text-white">
              {rebookData ? 'Rebook' : 'Book'}: {service.name}
            </h1>
            <p className="mt-2 text-emerald-100 text-sm">{service.description}</p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            const next = collectErrors({
              contact_name: validateName(formData.contact_name),
              contact_phone: validatePhone(formData.contact_phone),
              contact_email: validateEmail(formData.contact_email),
              scheduled_date: formData.scheduled_date
                ? validateDate(formData.scheduled_date, 'Date')
                : 'Please select a date and time before proceeding.',
              location: validateAddress(formData.location),
            });
            setFieldErrors(next);
            if (!applyFieldErrors(next)) {
              setError('Please fix the highlighted fields before continuing.');
              return;
            }
            setError('');
            setStep('summary');
          }} className="p-6 lg:p-8 space-y-6">
            {error && <ErrorBanner message={error} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field name="contact_name" label="Contact Name" required error={fieldErrors.contact_name}>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => { setFormData({ ...formData, contact_name: e.target.value }); setFieldErrors(p => ({ ...p, contact_name: '' })); }}
                  className={inputClass(!!fieldErrors.contact_name)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </Field>
              <Field name="contact_phone" label="Phone Number" required error={fieldErrors.contact_phone}>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => { setFormData({ ...formData, contact_phone: e.target.value }); setFieldErrors(p => ({ ...p, contact_phone: '' })); }}
                  className={inputClass(!!fieldErrors.contact_phone)}
                  placeholder="+232 76 000 000"
                  autoComplete="tel"
                />
              </Field>
            </div>

            <Field name="contact_email" label="Email (Optional)" error={fieldErrors.contact_email}>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => { setFormData({ ...formData, contact_email: e.target.value }); setFieldErrors(p => ({ ...p, contact_email: '' })); }}
                className={inputClass(!!fieldErrors.contact_email)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>

            <div data-field="scheduled_date">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Select Date &amp; Time *
                </label>
                <SchedulingCalendar
                  mode="pick"
                  serviceId={service?.id}
                  onSelectSlot={(date, time) => {
                    setFormData({ ...formData, scheduled_date: date, scheduled_time: time });
                    setFieldErrors(p => ({ ...p, scheduled_date: '' }));
                  }}
                />
                {formData.scheduled_date && (
                  <p className="mt-3 text-sm text-emerald-600 font-medium">
                    Selected: {new Date(formData.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {formData.scheduled_time ? ` at ${formData.scheduled_time}` : ''}
                  </p>
                )}
                {fieldErrors.scheduled_date && <p className="mt-2 text-xs text-red-600">{fieldErrors.scheduled_date}</p>}
            </div>

            <Field name="location" label={<span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Location / Address</span>} required error={fieldErrors.location}>
              <LocationAutocomplete
                value={formData.location}
                onChange={(v) => { setFormData({ ...formData, location: v }); setFieldErrors(p => ({ ...p, location: '' })); }}
                onSelect={(s) => {
                  setFormData({
                    ...formData,
                    location: s.display_name,
                    latitude: s.latitude,
                    longitude: s.longitude,
                  });
                  setFieldErrors(p => ({ ...p, location: '' }));
                }}
                showLocate
                invalid={!!fieldErrors.location}
                placeholder="Service location or address"
                inputClassName={`${inputClass(!!fieldErrors.location)} pl-9`}
              />
              <div className="mt-3">
                <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />}>
                  <AddressPickerMap
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    onChange={(lat, lng, suggestion) => setFormData({
                      ...formData,
                      latitude: lat,
                      longitude: lng,
                      location: suggestion?.display_name || formData.location,
                    })}
                  />
                </Suspense>
              </div>
            </Field>

            <Field label="Additional Notes">
              <textarea
                rows={4}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className={`${inputClass()} resize-none`}
                placeholder="Any specific requirements or details..."
              />
            </Field>

            <button
              type="button"
              onClick={() => {
                const next = collectErrors({
                  contact_name: validateName(formData.contact_name),
                  contact_phone: validatePhone(formData.contact_phone),
                  contact_email: validateEmail(formData.contact_email),
                  scheduled_date: formData.scheduled_date
                    ? validateDate(formData.scheduled_date, 'Date')
                    : 'Please select a date and time before proceeding.',
                  location: validateAddress(formData.location),
                });
                setFieldErrors(next);
                if (!applyFieldErrors(next)) {
                  setError('Please fix the highlighted fields before continuing.');
                  return;
                }
                setError('');
                setStep('summary');
              }}
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Review Summary
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
