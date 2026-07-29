import { useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

const PAYMENT_METHODS = [
  {
    id: 'orange-money',
    label: 'Orange Money',
    category: 'mobile' as const,
    icon: (
      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-orange-500">
        <svg viewBox="0 0 40 40" className="w-10 h-10">
          <rect width="40" height="40" fill="#FF6600" rx="8" />
          <polygon points="10,30 20,10 30,30" fill="white" opacity="0.9" />
          <rect x="8" y="27" width="24" height="4" rx="2" fill="white" opacity="0.7" />
        </svg>
      </div>
    ),
  },
  {
    id: 'afrimoney',
    label: 'Afrimoney',
    category: 'mobile' as const,
    icon: (
      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-green-600">
        <svg viewBox="0 0 40 40" className="w-10 h-10">
          <rect width="40" height="40" fill="#16A34A" rx="8" />
          <rect x="8" y="8" width="10" height="10" rx="2" fill="white" opacity="0.9" />
          <rect x="22" y="8" width="10" height="10" rx="2" fill="white" opacity="0.9" />
          <rect x="8" y="22" width="10" height="10" rx="2" fill="white" opacity="0.9" />
          <rect x="22" y="22" width="10" height="10" rx="2" fill="white" opacity="0.9" />
        </svg>
      </div>
    ),
  },
  {
    id: 'qmoney',
    label: 'QMoney',
    category: 'mobile' as const,
    icon: (
      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-blue-600 border-2 border-blue-200">
        <span className="text-white font-black text-lg leading-none">Q</span>
      </div>
    ),
  },
  {
    id: 'visa',
    label: 'Visa',
    category: 'card' as const,
    icon: (
      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-slate-50 border border-slate-200">
        <span className="text-blue-800 font-black text-sm italic tracking-tight">VISA</span>
      </div>
    ),
  },
  {
    id: 'mastercard',
    label: 'Mastercard',
    category: 'card' as const,
    icon: (
      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-slate-50 border border-slate-200">
        <div className="relative w-7 h-5">
          <div className="absolute left-0 top-0 w-5 h-5 bg-red-500 rounded-full opacity-90" />
          <div className="absolute right-0 top-0 w-5 h-5 bg-orange-400 rounded-full opacity-90" />
        </div>
      </div>
    ),
  },
  {
    id: 'cash',
    label: 'Cash on Delivery',
    category: 'cash' as const,
    icon: (
      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-amber-600">
        <svg viewBox="0 0 40 40" className="w-10 h-10">
          <rect width="40" height="40" fill="#D97706" rx="8" />
          <circle cx="20" cy="20" r="8" fill="white" opacity="0.9" />
          <text x="20" y="24" textAnchor="middle" fill="#D97706" fontSize="10" fontWeight="bold">SLE</text>
        </svg>
      </div>
    ),
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  totalAmount?: number;
  onProceed?: (methodId: string) => void;
  mode?: 'manage' | 'pay';
}

export function MobilePaymentMethodModal({ open, onClose, totalAmount, onProceed, mode = 'manage' }: Props) {
  const [selected, setSelected] = useState<string>('orange-money');

  const mobileMethods = PAYMENT_METHODS.filter(m => m.category === 'mobile');
  const cardMethods = PAYMENT_METHODS.filter(m => m.category === 'card');

  const handleProceed = () => {
    if (onProceed) onProceed(selected);
    else onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Select Payment Method" showHandle>
      <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header row */}
        <div className="flex items-center gap-3 px-5 pt-2 pb-4 border-b border-slate-100">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 active:scale-90 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <h2 className="text-base font-bold text-slate-900">Select Payment Method</h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Mobile Money */}
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Mobile Money</p>
            <div className="space-y-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
              {mobileMethods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                >
                  {m.icon}
                  <span className="flex-1 text-sm font-medium text-slate-800">{m.label}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    selected === m.id
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {selected === m.id && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Cards</p>
            <div className="space-y-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
              {cardMethods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                >
                  {m.icon}
                  <span className="flex-1 text-sm font-medium text-slate-800">{m.label}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    selected === m.id
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {selected === m.id && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl text-xs text-slate-500">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            Payments secured with 256-bit SSL encryption.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-6 border-t border-slate-100 bg-white">
          {totalAmount !== undefined && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500 font-medium">Total Amount</span>
              <span className="text-base font-bold text-blue-600">
                Le {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <button
            onClick={handleProceed}
            className="w-full py-4 bg-blue-600 text-white font-bold text-sm rounded-2xl active:scale-[0.98] transition-all shadow-md shadow-blue-600/20"
          >
            {mode === 'pay' ? 'Proceed to Payment' : 'Save Preference'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
