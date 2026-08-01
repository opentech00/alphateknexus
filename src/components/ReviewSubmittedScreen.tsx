import { CheckCircle2, Clock, MessageSquare } from 'lucide-react';

interface Props {
  serviceName: string;
  contactName?: string;
  contactPhone?: string;
  onDone: () => void;
  onViewBookings: () => void;
}

export function ReviewSubmittedScreen({ serviceName, contactName, contactPhone, onDone, onViewBookings }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-slate-50">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Job Submitted for Review</h2>
        <p className="mt-3 text-slate-500 leading-relaxed">
          Your <span className="font-medium text-slate-700">{serviceName}</span> request has been submitted
          and is now <span className="font-semibold text-amber-600">awaiting admin approval</span>.
          Our team will review your request shortly.
        </p>
        {contactName && contactPhone && (
          <p className="mt-2 text-sm text-slate-400">
            We'll contact {contactName} at {contactPhone} once your request is approved.
          </p>
        )}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          <span>You'll be notified when your booking is approved — then you can proceed to payment.</span>
        </div>
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
