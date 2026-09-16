import { useState } from 'react';
import { Briefcase, Shield } from 'lucide-react';
import { DivisionBookingsPanel, type DivisionConfig } from '../../components/division/DivisionBookingsPanel';
import { DivisionPermissionsTab } from './DivisionPermissionsTab';

export type { DivisionConfig };

interface Props {
  config: DivisionConfig;
}

export function DivisionPage({ config }: Props) {
  const [topView, setTopView] = useState<'bookings' | 'permissions'>('bookings');

  return (
    <DivisionBookingsPanel
      config={config}
      showAssign
      listVisible={topView === 'bookings'}
      afterStats={(
        <>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setTopView('bookings')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                topView === 'bookings' ? `${config.accentColor} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <Briefcase className="w-4 h-4" /> Bookings
            </button>
            <button
              onClick={() => setTopView('permissions')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                topView === 'permissions' ? `${config.accentColor} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <Shield className="w-4 h-4" /> Permissions
            </button>
          </div>
          {topView === 'permissions' && (
            <div className="space-y-4">
              <DivisionPermissionsTab config={config} />
            </div>
          )}
        </>
      )}
    />
  );
}
