import { Brush } from 'lucide-react';
import { DivisionPage } from './DivisionPage';

export function CleaningServicesPage() {
  return (
    <DivisionPage
      config={{
        name: 'Cleaning Services',
        slug: 'cleaning-janitorial',
        icon: Brush,
        accentColor: 'bg-cyan-600',
        accentLight: 'bg-cyan-50',
        accentText: 'text-cyan-600',
        accentBorder: 'border-cyan-400',
        accentRing: 'ring-cyan-500',
        description: 'Commercial and residential cleaning, deep cleaning, sanitisation and maintenance.',
        staff: 45,
      }}
    />
  );
}
