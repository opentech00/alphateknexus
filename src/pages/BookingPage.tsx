import { useState, useEffect } from 'react';
import {
  ArrowLeft, Calendar, MapPin, Clock, CheckCircle2,
  ChevronRight, CreditCard, Wallet, Smartphone, ShieldCheck,
  Loader2, Lock, Receipt as ReceiptIcon, XCircle, Banknote,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createMonimeCheckout, pollPaymentStatus } from '../lib/monime';

const SERVICE_FEE = 25;
import { SchedulingCalendar } from '../components/SchedulingCalendar';
import { ReceiptModal } from '../components/ReceiptModal';
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
}

interface BookingPageProps {
  service: Service | null;
  onNavigate: (page: string) => void;
  rebookData?: RebookData | null;
  mode?: 'hire' | 'quote' | 'pickup' | 'subscribe';
}

type Step = 'form' | 'summary' | 'payment' | 'success' | 'payment_failed';

const PAYMENT_METHODS = [
  { id: 'orange-money',  label: 'Orange Money',  category: 'mobile',   color: 'bg-orange-500',  initials: 'OM' },
  { id: 'afrimoney',     label: 'Afrimoney',     category: 'mobile',   color: 'bg-blue-600',     initials: 'AF' },
  { id: 'qmoney',        label: 'QMoney',        category: 'mobile',   color: 'bg-emerald-600',  initials: 'QM' },
  { id: 'visa',          label: 'Visa Card',     category: 'card',     color: 'bg-slate-800',    initials: 'V'  },
  { id: 'mastercard',    label: 'Mastercard',    category: 'card',     color: 'bg-red-600',      initials: 'MC' },
  { id: 'wallet',        label: 'Wallet Balance',category: 'wallet',   color: 'bg-slate-700',    initials: 'W'  },
  { id: 'cash',          label: 'Cash on Delivery', category: 'cash', color: 'bg-amber-600',   initials: 'C'  },
];

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
  const [selected, setSelected] = useState<string>('orange-money');
  const { wallet_enabled } = useFeatureFlags();

  const mobileMethods = PAYMENT_METHODS.filter(m => m.category === 'mobile');
  const cardMethods = PAYMENT_METHODS.filter(m => m.category === 'card');
  const walletMethods = wallet_enabled ? PAYMENT_METHODS.filter(m => m.category === 'wallet') : [];
  const cashMethods = PAYMENT_METHODS.filter(m => m.category === 'cash');

  const renderMethod = (m: typeof PAYMENT_METHODS[0]) => (
    <button
      key={m.id}
      onClick={() => setSelected(m.id)}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98] no-select ${
        selected === m.id
          ? 'border-blue-600 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg ${m.color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
        {m.initials}
      </div>
      <span className="flex-1 text-left text-sm font-medium text-slate-800">{m.label}</span>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
        selected === m.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
      }`}>
        {selected === m.id && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto mobile-scroll p-4 md:p-6 pb-28">
        <h2 className="text-lg font-bold text-slate-900 mb-1 md:hidden">Payment Method</h2>
        <p className="text-sm text-slate-500 mb-5 md:hidden">Choose how you want to pay for your booking.</p>

        {/* Mobile Money */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            Mobile Money
          </p>
          <div className="space-y-2.5">
            {mobileMethods.map(renderMethod)}
          </div>
        </div>

        {/* Cards */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            Cards
          </p>
          <div className="space-y-2.5">
            {cardMethods.map(renderMethod)}
          </div>
        </div>

        {/* Wallet */}
        {walletMethods.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            Wallet
          </p>
          <div className="space-y-2.5">
            {walletMethods.map(renderMethod)}
          </div>
        </div>
        )}

        {/* Cash */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5" />
            Cash
          </p>
          <div className="space-y-2.5">
            {cashMethods.map(renderMethod)}
          </div>
          {selected === 'cash' && (
            <div className="mt-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
              Pay in cash when our team arrives to deliver the service. A numbered receipt will be issued on collection. Your booking is confirmed immediately.
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 rounded-xl text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          Your payment is secured with 256-bit SSL encryption.
        </div>
      </div>

      {/* Sticky pay button */}
      <div className="flex-shrink-0 bg-white border-t border-slate-100 px-4 md:px-6 py-3 safe-area-pb">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-lg font-bold text-slate-900">Le {total.toLocaleString()}</span>
        </div>
        <button
          onClick={() => onPay(selected)}
          disabled={paying}
          className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm no-select flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {paying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Pay Le {total.toLocaleString()}
            </>
          )}
        </button>
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
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState('');
  const [payReference, setPayReference] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [paymentError, setPaymentError] = useState('');

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
        onSuccess={() => onNavigate('bookings')}
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
        />
      );
    }
    return (
      <SmartSortPickupForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => onNavigate('bookings')}
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
          onSuccess={() => onNavigate('bookings')}
        />
      );
    }
    return (
      <CleaningHireForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => onNavigate('bookings')}
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
          onSuccess={() => onNavigate('bookings')}
        />
      );
    }
    return (
      <ClearingForwardingForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => onNavigate('bookings')}
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
          onSuccess={() => onNavigate('bookings')}
        />
      );
    }
    return (
      <PrivateSecurityHireForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => onNavigate('bookings')}
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
          onSuccess={() => onNavigate('bookings')}
        />
      );
    }
    return (
      <ProcurementHireForm
        service={service}
        onCancel={() => onNavigate('services')}
        onSuccess={() => onNavigate('bookings')}
      />
    );
  }

  const handlePay = async (methodId: string) => {
    setLoading(true);
    setError('');
    setPaymentError('');

    // Validate required fields before insert
    if (!formData.scheduled_date) {
      setError('Please select a date before proceeding.');
      setStep('form');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be signed in to book a service.');
      setLoading(false);
      return;
    }

    const isCash = methodId === 'cash';

    const { data: bookingData, error: insertError } = await supabase.from('bookings').insert({
      service_id: service.id,
      user_id: user.id,
      contact_name: formData.contact_name,
      contact_phone: formData.contact_phone,
      contact_email: formData.contact_email || null,
      scheduled_date: formData.scheduled_date,
      scheduled_time: formData.scheduled_time || null,
      location: formData.location || null,
      notes: formData.notes || null,
      payment_method: isCash ? 'cash' : 'monime',
      payment_status: isCash ? 'pending_cash' : 'pending',
    }).select('id').single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
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
        setLoading(false);
        return;
      }
      setPayReference('');
      setStep('success');
      setLoading(false);
      return;
    }

    // Online payment methods route through Monime checkout
    try {
      const result = await createMonimeCheckout(SERVICE_FEE, 'booking', bookingData.id, `BK-${bookingData.id.slice(0, 8)}`);
      setPayReference(result.reference);
      const popup = window.open(result.checkoutUrl, '_blank', 'width=500,height=700,scrollbars=yes');
      if (!popup) {
        setPaymentError('Popup was blocked. Please allow popups and try again. Your booking was created — you can complete payment from your bookings page.');
        setStep('payment_failed');
        setLoading(false);
        return;
      }
      const pollResult = await pollPaymentStatus(result.reference);
      if (!popup.closed) popup.close();
      if (pollResult.status !== 'completed') {
        setPaymentError(
          pollResult.status === 'failed' ? 'Payment was declined or failed.' :
          pollResult.status === 'cancelled' ? 'Payment was cancelled.' :
          'Payment could not be confirmed in time. You can retry from your bookings page.'
        );
        setStep('payment_failed');
        setLoading(false);
        return;
      }
      await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingData.id);
    } catch (err: any) {
      setPaymentError(err.message || 'Payment failed. Your booking was created — you can retry from your bookings page.');
      setStep('payment_failed');
      setLoading(false);
      return;
    }

    setStep('success');
    setLoading(false);
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
            if (!formData.scheduled_date) {
              setError('Please select a date and time before proceeding.');
              return;
            }
            setError('');
            setStep('summary');
          }} className="p-6 lg:p-8 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Name *</label>
                <input
                  type="text"
                  required
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                  placeholder="+232 76 000 000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email (Optional)</label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Select Date &amp; Time *
                </label>
                <SchedulingCalendar
                  mode="pick"
                  serviceId={service?.id}
                  onSelectSlot={(date, time) => {
                    setFormData({ ...formData, scheduled_date: date, scheduled_time: time });
                  }}
                />
                {formData.scheduled_date && (
                  <p className="mt-3 text-sm text-emerald-600 font-medium">
                    Selected: {new Date(formData.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {formData.scheduled_time ? ` at ${formData.scheduled_time}` : ''}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                Location / Address
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                placeholder="Service location or address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Notes</label>
              <textarea
                rows={4}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm resize-none"
                placeholder="Any specific requirements or details..."
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!formData.scheduled_date) {
                  setError('Please select a date and time before proceeding.');
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
