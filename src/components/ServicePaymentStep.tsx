import { useState, useRef } from 'react';
import {
  Smartphone, CreditCard, Wallet, Banknote, Lock,
  CheckCircle2, Loader2, ShieldCheck, ArrowLeft,
  XCircle, Building2, Upload, FileText, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createMonimeCheckout, pollPaymentStatus } from '../lib/monime';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

export const PAYMENT_METHODS = [
  { id: 'orange-money', label: 'Orange Money', category: 'mobile', color: 'bg-orange-500', initials: 'OM' },
  { id: 'afrimoney', label: 'Afrimoney', category: 'mobile', color: 'bg-blue-600', initials: 'AF' },
  { id: 'qmoney', label: 'QMoney', category: 'mobile', color: 'bg-emerald-600', initials: 'QM' },
  { id: 'visa', label: 'Visa Card', category: 'card', color: 'bg-slate-800', initials: 'V' },
  { id: 'mastercard', label: 'Mastercard', category: 'card', color: 'bg-red-600', initials: 'MC' },
  { id: 'wallet', label: 'Wallet Balance', category: 'wallet', color: 'bg-slate-700', initials: 'W' },
  { id: 'bank', label: 'Bank Transfer', category: 'bank', color: 'bg-indigo-600', initials: 'B' },
  { id: 'cash', label: 'Cash on Delivery', category: 'cash', color: 'bg-amber-600', initials: 'C' },
];

const BANK_DOC_TYPES = [
  { id: 'payslip', label: 'Payslip' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'deposit_slip', label: 'Deposit Bank Slip' },
];

const ALLOWED_BANK_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg']);
const MAX_BANK_FILE_SIZE = 10 * 1024 * 1024;

interface ServicePaymentStepProps {
  amount: number;
  bookingId: string;
  serviceName: string;
  serviceSlug?: string;
  onBack: () => void;
  onSuccess: (method: string, reference?: string) => void;
  onFail: (message: string) => void;
}

export function ServicePaymentStep({
  amount, bookingId, serviceName, serviceSlug, onBack, onSuccess, onFail,
}: ServicePaymentStepProps) {
  const [selected, setSelected] = useState('orange-money');
  const { wallet_enabled } = useFeatureFlags();
  const [paying, setPaying] = useState(false);
  const [bankDocType, setBankDocType] = useState('payslip');
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [bankFileError, setBankFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mobileMethods = PAYMENT_METHODS.filter(m => m.category === 'mobile');
  const cardMethods = PAYMENT_METHODS.filter(m => m.category === 'card');
  const walletMethods = wallet_enabled ? PAYMENT_METHODS.filter(m => m.category === 'wallet') : [];
  const bankMethods = PAYMENT_METHODS.filter(m => m.category === 'bank');
  const cashMethods = PAYMENT_METHODS.filter(m => m.category === 'cash');

  const handlePay = async () => {
    setPaying(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      onFail('You must be signed in to pay for a booking.');
      setPaying(false);
      return;
    }

    const isCash = selected === 'cash';
    const isWallet = selected === 'wallet';
    const isBank = selected === 'bank';

    if (isBank) {
      if (!bankFile) {
        onFail('Please upload your bank payment slip, cheque, or deposit slip.');
        return;
      }
      const ext = bankFile.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_BANK_EXTS.has(ext)) {
        onFail('Only PDF, PNG, and JPG files are accepted for bank payment proofs.');
        return;
      }
      if (bankFile.size > MAX_BANK_FILE_SIZE) {
        onFail('File exceeds 10MB limit.');
        return;
      }

      try {
        const filePath = `${user.id}/${bookingId}/bank-${Date.now()}-${bankFile.name}`;
        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(filePath, bankFile, { cacheControl: '3600', upsert: false });
        if (upErr) { onFail(`Upload failed: ${upErr.message}`); setPaying(false); return; }
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);

        await supabase.from('bookings').update({
          payment_method: 'bank',
          payment_status: 'pending_verification',
        }).eq('id', bookingId);

        await supabase.from('payment_verifications').insert({
          booking_id: bookingId,
          user_id: user.id,
          payment_method: 'bank',
          document_type: bankDocType,
          document_url: urlData.publicUrl,
          document_name: bankFile.name,
          document_size: bankFile.size,
          amount_sle: amount,
          service_slug: serviceSlug || null,
          status: 'pending',
        });

        await supabase.from('payments').insert({
          user_id: user.id,
          payable_type: 'booking',
          payable_id: bookingId,
          amount_sle: amount,
          method: 'bank',
          status: 'pending',
        });

        setPaying(false);
        onSuccess('bank');
        return;
      } catch (err: any) {
        onFail(err.message || 'Bank payment upload failed.');
        setPaying(false);
        return;
      }
    }

    if (isCash) {
      await supabase.from('bookings').update({
        payment_method: 'cash',
        payment_status: 'pending_cash',
      }).eq('id', bookingId);

      await supabase.from('payments').insert({
        user_id: user.id,
        payable_type: 'booking',
        payable_id: bookingId,
        amount_sle: amount,
        method: 'cash',
        status: 'pending',
      });

      setPaying(false);
      onSuccess('cash');
      return;
    }

    if (isWallet) {
      const { data: result, error: walletErr } = await supabase.rpc('pay_booking_from_wallet', {
        p_booking_id: bookingId,
        p_amount: amount,
      });

      if (walletErr) {
        onFail('We could not complete the wallet payment. Please try again.');
        setPaying(false);
        return;
      }

      if (!result?.success) {
        const balance = Number(result?.balance ?? 0);
        onFail(
          result?.error === 'Insufficient wallet balance.'
            ? `Insufficient wallet balance. You have Le ${balance.toLocaleString()} but need Le ${amount.toLocaleString()}.`
            : result?.error || 'Wallet payment could not be completed.',
        );
        setPaying(false);
        return;
      }

      setPaying(false);
      onSuccess('wallet');
      return;
    }

    try {
      await supabase.from('bookings').update({
        payment_method: 'monime',
        payment_status: 'pending',
      }).eq('id', bookingId);

      const result = await createMonimeCheckout(amount, 'booking', bookingId, `BK-${bookingId.slice(0, 8)}`);
      const popup = window.open(result.checkoutUrl, '_blank', 'width=500,height=700,scrollbars=yes');
      if (!popup) {
        onFail('Popup was blocked. Please allow popups and try again.');
        setPaying(false);
        return;
      }

      const pollResult = await pollPaymentStatus(result.reference);
      if (!popup.closed) popup.close();

      if (pollResult.status !== 'completed') {
        onFail(
          pollResult.status === 'failed' ? 'Payment was declined or failed.' :
          pollResult.status === 'cancelled' ? 'Payment was cancelled.' :
          'Payment could not be confirmed in time.',
        );
        setPaying(false);
        return;
      }

      await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId);
      setPaying(false);
      onSuccess('monime', result.reference);
    } catch (err: any) {
      onFail(err.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  const renderMethod = (m: typeof PAYMENT_METHODS[0]) => (
    <button
      key={m.id}
      onClick={() => setSelected(m.id)}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98] no-select ${
        selected === m.id
          ? 'border-emerald-600 bg-emerald-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg ${m.color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
        {m.initials}
      </div>
      <span className="flex-1 text-left text-sm font-medium text-slate-800">{m.label}</span>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
        selected === m.id ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
      }`}>
        {selected === m.id && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to review
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-white" />
            <div>
              <h1 className="text-lg font-bold text-white">Payment Method</h1>
              <p className="text-emerald-100 text-sm">{serviceName}</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Mobile Money */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Mobile Money
              </p>
              <div className="space-y-2.5">{mobileMethods.map(renderMethod)}</div>
            </div>

            {/* Cards */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Cards
              </p>
              <div className="space-y-2.5">{cardMethods.map(renderMethod)}</div>
            </div>

            {/* Wallet */}
            {walletMethods.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Wallet
              </p>
              <div className="space-y-2.5">{walletMethods.map(renderMethod)}</div>
            </div>
            )}

            {/* Bank Transfer */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Bank Transfer
              </p>
              <div className="space-y-2.5">{bankMethods.map(renderMethod)}</div>
              {selected === 'bank' && (
                <div className="mt-3 space-y-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <p className="text-xs text-indigo-800 leading-relaxed">
                    Transfer to our bank account, then upload proof of payment for verification by the divisional manager.
                    Your booking will be confirmed once the document is verified.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Document Type</label>
                    <div className="flex gap-2">
                      {BANK_DOC_TYPES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setBankDocType(t.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            bankDocType === t.id
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Upload Proof</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const ext = f.name.split('.').pop()?.toLowerCase() || '';
                        if (!ALLOWED_BANK_EXTS.has(ext)) {
                          setBankFileError('Only PDF, PNG, and JPG files are accepted.');
                          return;
                        }
                        if (f.size > MAX_BANK_FILE_SIZE) {
                          setBankFileError('File exceeds 10MB limit.');
                          return;
                        }
                        setBankFileError('');
                        setBankFile(f);
                      }}
                      className="hidden"
                    />
                    {bankFile ? (
                      <div className="flex items-center gap-2 p-3 bg-white border border-indigo-200 rounded-lg">
                        <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="text-xs text-slate-700 font-medium flex-1 truncate">{bankFile.name}</span>
                        <button
                          onClick={() => { setBankFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="p-1 rounded text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-300 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                      >
                        <Upload className="w-4 h-4" />
                        Choose file (PDF, PNG, JPG)
                      </button>
                    )}
                    {bankFileError && (
                      <p className="mt-1.5 text-xs text-red-600">{bankFileError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cash */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" /> Cash
              </p>
              <div className="space-y-2.5">{cashMethods.map(renderMethod)}</div>
              {selected === 'cash' && (
                <div className="mt-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
                  Pay in cash when our team arrives to deliver the service. A numbered receipt will be issued on collection.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 rounded-xl text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 flex-shrink-0" />
              Your payment is secured with 256-bit SSL encryption.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-lg font-bold text-slate-900">Le {amount.toLocaleString()}</span>
        </div>

        <button
          onClick={handlePay}
          disabled={paying || (selected === 'bank' && !bankFile)}
          className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {paying ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
          ) : (
            <><ShieldCheck className="w-4 h-4" /> {selected === 'bank' ? 'Submit for Verification' : `Pay Le ${amount.toLocaleString()}`}</>
          )}
        </button>
      </div>
    </div>
  );
}

interface PaymentSuccessProps {
  serviceName: string;
  amount: number;
  method: string;
  contactName: string;
  contactPhone: string;
  reference?: string;
  onDone: () => void;
  onViewBookings: () => void;
}

export function PaymentSuccessScreen({
  serviceName, amount, method, contactName, contactPhone, reference, onDone, onViewBookings,
}: PaymentSuccessProps) {
  const isCash = method === 'cash';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          {isCash ? 'Booking Confirmed!' : 'Payment Successful!'}
        </h2>
        <p className="mt-3 text-slate-500 leading-relaxed">
          Your <span className="font-semibold text-slate-700">{serviceName}</span> booking has been submitted
          {isCash ? '. Our team will contact ' : ' and payment of '}
          {!isCash && <span className="font-semibold text-slate-700">Le {amount.toLocaleString()}</span>}
          {!isCash ? ' has been received. Our team will contact ' : ''}
          <span className="font-medium text-slate-700">{contactName}</span> at{' '}
          <span className="font-medium text-slate-700">{contactPhone}</span> to confirm.
        </p>
        {isCash && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 leading-relaxed text-left">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <Banknote className="w-4 h-4" /> Cash on Delivery
            </div>
            Please have <span className="font-semibold">Le {amount.toLocaleString()}</span> ready when our team arrives.
          </div>
        )}
        {reference && (
          <p className="mt-3 text-xs text-slate-400">Reference: {reference}</p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={onViewBookings} className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors">
            View My Bookings
          </button>
          <button onClick={onDone} className="px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors">
            Back to Services
          </button>
        </div>
      </div>
    </div>
  );
}

interface PaymentFailedScreenProps {
  message: string;
  onRetry: () => void;
  onViewBookings: () => void;
}

export function PaymentFailedScreen({ message, onRetry, onViewBookings }: PaymentFailedScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Payment Incomplete</h2>
        <p className="mt-3 text-slate-500">{message}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={onRetry} className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors">
            Retry Payment
          </button>
          <button onClick={onViewBookings} className="px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors">
            View My Bookings
          </button>
        </div>
      </div>
    </div>
  );
}
