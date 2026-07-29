import { useState } from 'react';
import { Recycle, CalendarDays, Repeat, Tag, Truck, Receipt, FileText, Shield } from 'lucide-react';
import { DivisionPage } from './DivisionPage';
import { SmartSortSubscriptionsTab } from './SmartSortSubscriptionsTab';
import { SmartSortPlansTab } from './SmartSortPlansTab';
import { SmartSortPickupsTab } from './SmartSortPickupsTab';
import { SmartSortBillingTab } from './SmartSortBillingTab';
import { SmartSortQuotesTab } from './SmartSortQuotesTab';
import { DivisionPermissionsTab } from './DivisionPermissionsTab';

const config = {
  name: 'Smart Sort / Recycling',
  slug: 'waste-management',
  icon: Recycle,
  accentColor: 'bg-emerald-600',
  accentLight: 'bg-emerald-50',
  accentText: 'text-emerald-600',
  accentBorder: 'border-emerald-400',
  accentRing: 'ring-emerald-500',
  description: 'Waste management, smart sorting solutions, and eco-friendly recycling programs.',
  staff: 32,
};

const TABS = [
  { id: 'schedule', label: 'Schedule', icon: Truck },
  { id: 'pickups', label: 'One-Off Pickups', icon: CalendarDays },
  { id: 'quotes', label: 'Quote Requests', icon: FileText },
  { id: 'subscriptions', label: 'Subscriptions', icon: Repeat },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'plans', label: 'Pricing Plans', icon: Tag },
  { id: 'permissions', label: 'Permissions', icon: Shield },
] as const;

type Tab = typeof TABS[number]['id'];

export function SmartSortPage() {
  const [tab, setTab] = useState<Tab>('schedule');

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Recycle className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Smart Sort / Recycling</h1>
          <p className="mt-0.5 text-slate-400 text-sm">{config.description}</p>
        </div>
      </div>

      {/* Tabs - scrollable on mobile */}
      <div className="mb-5 -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="inline-flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm min-w-max">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                tab === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="animate-[fadeInUp_0.25s_ease]">
        {tab === 'schedule' ? (
          <SmartSortPickupsTab />
        ) : tab === 'pickups' ? (
          <DivisionPage config={config} />
        ) : tab === 'quotes' ? (
          <SmartSortQuotesTab />
        ) : tab === 'subscriptions' ? (
          <SmartSortSubscriptionsTab />
        ) : tab === 'billing' ? (
          <SmartSortBillingTab />
        ) : tab === 'plans' ? (
          <SmartSortPlansTab />
        ) : (
          <DivisionPermissionsTab config={config} />
        )}
      </div>
    </div>
  );
}
