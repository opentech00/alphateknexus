import { useState } from 'react';
import { FileText, Receipt, Smartphone, Wallet } from 'lucide-react';
import { WalletPanel } from '../WalletPanel';
import { ReceiptsPanel } from '../ReceiptsPanel';
import { BillingPage } from '../../pages/BillingPage';
import { QuotesPage } from '../../pages/QuotesPage';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

export type PayTab = 'wallet' | 'bills' | 'receipts' | 'quotes';

export function PaymentsHub({
  onNavigate,
  onChooseService,
  initialTab = 'wallet',
  showTitle = false,
}: {
  onNavigate: (page: string) => void;
  onChooseService?: () => void;
  initialTab?: PayTab;
  showTitle?: boolean;
}) {
  const { wallet_enabled } = useFeatureFlags();
  const [tab, setTab] = useState<PayTab>(!wallet_enabled && initialTab === 'wallet' ? 'bills' : initialTab);

  const tabs: { id: PayTab; label: string; icon: typeof Wallet }[] = [
    ...(wallet_enabled ? [{ id: 'wallet' as const, label: 'Wallet', icon: Wallet }] : []),
    { id: 'bills', label: 'Bills', icon: Smartphone },
    { id: 'receipts', label: 'Receipts', icon: Receipt },
    { id: 'quotes', label: 'Quotes', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {showTitle && (
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Payments</h1>
          <p className="mt-1 text-sm text-slate-500">Wallet, invoices, receipts, and quotes in one place.</p>
        </header>
      )}
      <div className="flex gap-1 overflow-x-auto bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[4.5rem] min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'wallet' && wallet_enabled && (
        <WalletPanel onChooseService={onChooseService || (() => onNavigate('services'))} />
      )}
      {tab === 'bills' && <BillingPage bare onBack={() => onNavigate('home')} />}
      {tab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <ReceiptsPanel />
        </div>
      )}
      {tab === 'quotes' && <QuotesPage bare onBack={() => onNavigate('home')} />}
    </div>
  );
}
