import { Package } from 'lucide-react';
import { DivisionPage } from './DivisionPage';

export function ProcurementPage() {
  return (
    <DivisionPage
      config={{
        name: 'Procurement',
        slug: 'procurement',
        icon: Package,
        accentColor: 'bg-rose-600',
        accentLight: 'bg-rose-50',
        accentText: 'text-rose-600',
        accentBorder: 'border-rose-400',
        accentRing: 'ring-rose-500',
        description: 'Supply chain sourcing, vendor management, bulk purchasing and procurement logistics.',
        staff: 8,
      }}
    />
  );
}
