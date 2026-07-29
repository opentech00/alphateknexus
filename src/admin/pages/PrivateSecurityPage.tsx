import { ShieldCheck } from 'lucide-react';
import { DivisionPage } from './DivisionPage';

export function PrivateSecurityPage() {
  return (
    <DivisionPage
      config={{
        name: 'Private Security',
        slug: 'private-security',
        icon: ShieldCheck,
        accentColor: 'bg-amber-600',
        accentLight: 'bg-amber-50',
        accentText: 'text-amber-600',
        accentBorder: 'border-amber-400',
        accentRing: 'ring-amber-500',
        description: 'Armed and unarmed security guards, event security, CCTV surveillance and escorts.',
        staff: 120,
      }}
    />
  );
}
