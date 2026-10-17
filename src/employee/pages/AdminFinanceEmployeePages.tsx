import { ArrowLeft } from 'lucide-react';
import { AdminFinanceWorkspacePage } from '../../admin/pages/AdminFinanceWorkspacePage';
import { FinancePage } from '../../admin/pages/FinancePage';
import { ServiceFinancePage } from '../../admin/pages/ServiceFinancePage';
import { WalletManagementPage } from '../../admin/pages/WalletManagementPage';
import { ReceiptsManagementPage } from '../../admin/pages/ReceiptsManagementPage';
import { slugForFinancePage } from '../../lib/financeServices';
import { PAGE_LABELS, isEmployeePage } from '../lib/workNav';

export function AdminFinanceEmployeePages({
  page,
  onNavigate,
}: {
  page: string;
  onNavigate: (page: string) => void;
}) {
  const showBack = page !== 'admin-finance';
  const title = isEmployeePage(page) ? PAGE_LABELS[page] : 'Admin & Finance';

  let body = <AdminFinanceWorkspacePage onNavigate={onNavigate} showCompanyTools={false} />;
  if (page === 'finance') body = <FinancePage onNavigate={onNavigate} />;
  else if (page === 'wallet') body = <WalletManagementPage />;
  else if (page === 'receipts') body = <ReceiptsManagementPage />;
  else if (page === 'finance-services') body = <ServiceFinancePage onNavigate={onNavigate} />;
  else {
    const ledgerSlug = slugForFinancePage(page);
    if (ledgerSlug) body = <ServiceFinancePage initialSlug={ledgerSlug} onNavigate={onNavigate} />;
  }

  return (
    <div className="space-y-4">
      {showBack && (
        <button
          type="button"
          onClick={() => onNavigate('admin-finance')}
          className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Admin & Finance
          <span className="sr-only"> from {title}</span>
        </button>
      )}
      {body}
    </div>
  );
}
