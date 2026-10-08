import { Receipt as ReceiptIcon } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { ReceiptsTab } from './finance/ReceiptsTab';

export function ReceiptsManagementPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Payment Receipts"
        description="Official Alphatek receipts for every payment method — view, share, download, print, or email."
        icon={ReceiptIcon}
      />
      <ReceiptsTab />
    </div>
  );
}
