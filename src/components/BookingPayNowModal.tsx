import { ServicePaymentStep, PaymentSuccessScreen, PaymentFailedScreen } from './ServicePaymentStep';
import { useState } from 'react';

interface Props {
  bookingId: string;
  amount: number;
  serviceName: string;
  serviceSlug?: string;
  onClose: () => void;
  onPaid: () => void;
}

export function BookingPayNowModal({
  bookingId, amount, serviceName, serviceSlug, onClose, onPaid,
}: Props) {
  const [step, setStep] = useState<'pay' | 'success' | 'failed'>('pay');
  const [method, setMethod] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');

  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-[180] bg-white overflow-y-auto">
        <PaymentSuccessScreen
          serviceName={serviceName}
          amount={amount}
          method={method}
          contactName=""
          contactPhone=""
          reference={ref}
          onDone={onPaid}
          onViewBookings={onPaid}
        />
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <div className="fixed inset-0 z-[180] bg-white overflow-y-auto">
        <PaymentFailedScreen
          message={error}
          onRetry={() => setStep('pay')}
          onViewBookings={onClose}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[180] bg-slate-50 overflow-y-auto">
      <ServicePaymentStep
        amount={amount}
        bookingId={bookingId}
        serviceName={serviceName}
        serviceSlug={serviceSlug}
        onBack={onClose}
        onSuccess={(paidMethod, paidRef) => {
          setMethod(paidMethod);
          setRef(paidRef || '');
          setStep('success');
        }}
        onFail={(msg) => { setError(msg); setStep('failed'); }}
      />
    </div>
  );
}
