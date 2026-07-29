import { Truck } from 'lucide-react';
import { DivisionPage } from './DivisionPage';

export function ClearingForwardingPage() {
  return (
    <DivisionPage
      config={{
        name: 'Clearing & Forwarding',
        slug: 'clearing-forwarding',
        icon: Truck,
        accentColor: 'bg-blue-600',
        accentLight: 'bg-blue-50',
        accentText: 'text-blue-600',
        accentBorder: 'border-blue-400',
        accentRing: 'ring-blue-500',
        description: 'Import/export logistics, customs clearance, cargo forwarding and subscription services.',
        staff: 18,
      }}
    />
  );
}
