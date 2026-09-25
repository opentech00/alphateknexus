import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Smartphone, Wallet, Banknote,
  CheckCircle2, Loader2, ShieldCheck, ArrowLeft,
  XCircle, Building2, Upload, FileText, X,
  AlertTriangle, Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { startMonimePayment, pollPaymentStatus } from '../lib/monime';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { AmountFigure, ChannelPills, le, PayOption, SecureNote, StatusOrb } from './checkout/CheckoutUi';

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
  depositAmount?: number | null;
  nextPage?: string;
}

export function ServicePaymentStep({
  amount, bookingId, serviceName, serviceSlug, onBack, onSuccess, onFail, depositAmount, nextPage = 'bookings',
}: ServicePaymentStepProps) {
  const [selected, setSelected] = useState('monime');
  const canPayDeposit = !!depositAmount && depositAmount > 0 && depositAmount < amount;
  const [payMode, setPayMode] = useState<'full' | 'deposit'>(canPayDeposit ? 'deposit' : 'full');
  const monimeAmount = selected === 'monime' && canPayDeposit && payMode === 'deposit' ? depositAmount! : amount;
  const { wallet_enabled } = useFeatureFlags();
  const [paying, setPaying] = useState(false);
  const [bankDocType, setBankDocType] = useState('payslip');
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [bankFileError, setBankFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const loadWalletBalance = useCallback(async () => {
    setWalletLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setWalletLoading(false); return; }
    const { data } = await supabase
      .from('wallet_transactions')
      .select('amount_sle')
      .eq('user_id', user.id)
      .eq('status', 'completed');
    const bal = (data || []).reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
    setWalletBalance(bal);
    setWalletLoading(false);
  }, []);

  useEffect(() => { if (wallet_enabled) loadWalletBalance(); }, [wallet_enabled, loadWalletBalance]);

  const insufficientWallet = walletBalance !== null && walletBalance < amount;
  const walletDifference = insufficientWallet ? amount - walletBalance : 0;

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
        setPaying(false);
        return;
      }
      const ext = bankFile.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_BANK_EXTS.has(ext)) {
        onFail('Only PDF, PNG, and JPG files are accepted for bank payment proofs.');
        setPaying(false);
        return;
      }
      if (bankFile.size > MAX_BANK_FILE_SIZE) {
        onFail('File exceeds 10MB limit.');
        setPaying(false);
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
      const result = await startMonimePayment(
        monimeAmount,
        'booking',
        bookingId,
        `BK-${bookingId.slice(0, 8)}`,
        { nextPage, mode: canPayDeposit ? payMode : 'full' },
      );
      if (result.redirected) return;

      const pollResult = await pollPaymentStatus(result.reference);
      if (pollResult.status !== 'completed') {
        onFail(
          pollResult.status === 'failed' ? 'Payment was declined or failed.' :
          pollResult.status === 'cancelled' ? 'Payment was cancelled.' :
          'Payment could not be confirmed in time.',
        );
        setPaying(false);
        return;
      }

      setPaying(false);
      onSuccess('monime', result.reference);
    } catch (err: any) {
      onFail(err.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  const payLabel = paying
    ? 'Opening secure checkout…'
    : selected === 'bank'
      ? 'Submit for verification'
      : selected === 'monime'
        ? (monimeAmount < amount ? 'Pay deposit with Monime' : 'Pay with Monime')
        : `Pay ${le(amount)}`;

  const summary = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <AmountFigure amount={selected === 'wallet' || selected === 'cash' || selected === 'bank' ? amount : monimeAmount} caption="Due now" />
      <div className="text-sm text-slate-500 space-y-1">
        <div className="flex justify-between"><span>Service</span><span className="font-medium text-slate-800 text-right">{serviceName}</span></div>
        {monimeAmount < amount && selected === 'monime' && (
          <div className="flex justify-between"><span>Balance later</span><span className="font-medium text-slate-800">{le(amount - monimeAmount)}</span></div>
        )}
      </div>
      <SecureNote />
      <button
        onClick={handlePay}
        disabled={paying || (selected === 'bank' && !bankFile) || (selected === 'wallet' && insufficientWallet)}
        className="hidden lg:flex w-full min-h-[48px] py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {payLabel}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-28 lg:pb-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8">
        <button onClick={onBack} className="inline-flex items-center gap-2 min-h-[44px] text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="mb-5 animate-fadeIn">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">How would you like to pay?</h1>
          <p className="text-sm text-slate-500 mt-1">{serviceName}</p>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
          <div role="radiogroup" aria-label="Payment method" className="space-y-2.5">
              <PayOption
                selected={selected === 'monime'}
                onSelect={() => setSelected('monime')}
                title="Pay with Monime"
                hint="Mobile money, card, or bank"
                icon={<span className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white"><Smartphone className="w-5 h-5" /></span>}
              />
              {selected === 'monime' && (
                <div className="px-1 animate-slideUp">
                  <ChannelPills />
                  {canPayDeposit && (
                    <>
                    <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How much to pay now">
                      {([
                        { id: 'deposit' as const, label: 'Deposit now', value: depositAmount! },
                        { id: 'full' as const, label: 'Pay in full', value: amount },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={payMode === opt.id}
                          onClick={() => setPayMode(opt.id)}
                          className={`min-h-[64px] p-3 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] ${
                            payMode === opt.id ? 'border-emerald-600 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{opt.label}</span>
                          <span className="block text-base font-bold text-slate-900 tabular-nums">{le(opt.value)}</span>
                        </button>
                      ))}
                    </div>
                    {payMode === 'deposit' && (
                      <p className="mt-2 text-xs text-slate-500">
                        Balance of {le(amount - depositAmount!)} is due before the job is completed.
                      </p>
                    )}
                    </>
                  )}
                </div>
              )}

            {wallet_enabled && (
              <PayOption
                selected={selected === 'wallet'}
                onSelect={() => setSelected('wallet')}
                title="Wallet balance"
                hint={walletBalance === null ? 'Store credit' : `${le(walletBalance)} available`}
                icon={<span className="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center text-white"><Wallet className="w-5 h-5" /></span>}
              />
            )}
              {selected === 'wallet' && wallet_enabled && walletBalance !== null && (
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed animate-slideUp ${
                  insufficientWallet
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">Wallet Balance</span>
                    <span className="font-bold text-sm">
                      {walletLoading ? '...' : `SLE ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                  {insufficientWallet ? (
                    <div className="mt-2">
                      <div className="flex items-center gap-1.5 text-red-700 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>You need SLE {walletDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })} more</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('open-wallet-topup', { detail: { amount: Math.ceil(walletDifference) } }));
                        }}
                        className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 active:scale-[0.98] transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Top Up SLE {Math.ceil(walletDifference).toLocaleString()}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Sufficient balance. Remaining after payment: SLE {(walletBalance - amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}

              <PayOption
                selected={selected === 'bank'}
                onSelect={() => setSelected('bank')}
                title="Bank transfer"
                hint="Upload a slip for finance to confirm"
                icon={<span className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white"><Building2 className="w-5 h-5" /></span>}
              />
              {selected === 'bank' && (
                <div className="space-y-3 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl animate-slideUp">
                  <p className="text-xs text-indigo-800 leading-relaxed">
                    Transfer to our bank account, then upload proof of payment for verification by the divisional manager.
                    Your booking will be confirmed once the document is verified.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Document Type</label>
                    <div className="flex flex-wrap gap-2">
                      {BANK_DOC_TYPES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setBankDocType(t.id)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
                          type="button"
                          onClick={() => { setBankFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="p-1 rounded text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full min-h-[48px] flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-300 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
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

              <PayOption
                selected={selected === 'cash'}
                onSelect={() => setSelected('cash')}
                title="Cash on delivery"
                hint="Pay the crew when they arrive"
                icon={<span className="w-11 h-11 rounded-xl bg-amber-600 flex items-center justify-center text-white"><Banknote className="w-5 h-5" /></span>}
              />
              {selected === 'cash' && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 leading-relaxed animate-slideUp">
                  Have {le(amount)} ready. A numbered receipt is issued when it is collected.
                </div>
              )}
          </div>
          <div className="hidden lg:block lg:sticky lg:top-6 mt-5 lg:mt-0">{summary}</div>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <AmountFigure compact amount={selected === 'monime' ? monimeAmount : amount} />
          <button
            onClick={handlePay}
            disabled={paying || (selected === 'bank' && !bankFile) || (selected === 'wallet' && insufficientWallet)}
            className="flex-1 min-h-[48px] px-4 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span className="truncate">{payLabel}</span>
          </button>
        </div>
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="text-center max-w-md w-full animate-slideUp">
        <StatusOrb tone="emerald"><CheckCircle2 className="w-9 h-9" /></StatusOrb>
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
          <button onClick={onViewBookings} className="min-h-[48px] px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all">
            View My Bookings
          </button>
          <button onClick={onDone} className="min-h-[48px] px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all">
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="text-center max-w-md w-full animate-slideUp">
        <StatusOrb tone="red"><XCircle className="w-9 h-9" /></StatusOrb>
        <h2 className="text-2xl font-bold text-slate-900">Payment Incomplete</h2>
        <p className="mt-3 text-slate-500">{message}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={onRetry} className="min-h-[48px] px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all">
            Retry Payment
          </button>
          <button onClick={onViewBookings} className="min-h-[48px] px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all">
            View My Bookings
          </button>
        </div>
      </div>
    </div>
  );
}
