import { useEffect, useState } from 'react';
import {
  Truck, Brush, ShieldCheck, Package, Recycle, Users, Briefcase, FileText,
  ArrowRight, TrendingUp, Building2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader } from '../components/ui';

const divisions = [
  {
    name: 'Clearing & Forwarding',
    slug: 'clearing-forwarding',
    page: 'division-cf',
    description: 'Import/export logistics, customs clearance, and cargo forwarding.',
    icon: Truck,
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    staff: 18,
  },
  {
    name: 'Smart Sort / Recycling',
    slug: 'smart-sort',
    page: 'division-smart-sort',
    description: 'Waste management, smart sorting solutions, and eco-friendly recycling.',
    icon: Recycle,
    color: 'bg-emerald-500',
    lightColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    staff: 32,
  },
  {
    name: 'Cleaning Services',
    slug: 'cleaning-services',
    page: 'division-cleaning',
    description: 'Commercial and residential cleaning, deep cleaning, and sanitation.',
    icon: Brush,
    color: 'bg-cyan-500',
    lightColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
    staff: 45,
  },
  {
    name: 'Private Security',
    slug: 'private-security',
    page: 'division-security',
    description: 'Armed and unarmed guards, event security, and surveillance.',
    icon: ShieldCheck,
    color: 'bg-amber-500',
    lightColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    staff: 120,
  },
  {
    name: 'Procurement',
    slug: 'procurement',
    page: 'division-procurement',
    description: 'Supply chain sourcing, vendor management, and bulk purchasing.',
    icon: Package,
    color: 'bg-rose-500',
    lightColor: 'bg-rose-50',
    textColor: 'text-rose-600',
    staff: 8,
  },
];

interface Props {
  onNavigate: (page: string) => void;
}

export function DivisionsPage({ onNavigate }: Props) {
  const [jobCounts, setJobCounts] = useState<Record<string, { jobs: number; quotes: number; pending: number }>>({});

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('status, details, services(slug)')
        .order('created_at', { ascending: false });
      const counts: Record<string, { jobs: number; quotes: number; pending: number }> = {};
      (data || []).forEach((b: any) => {
        const slug = b.services?.slug;
        if (!slug || ['completed', 'cancelled'].includes(b.status)) return;
        if (!counts[slug]) counts[slug] = { jobs: 0, quotes: 0, pending: 0 };
        counts[slug].jobs++;
        if (b.details?.quote_request === true) counts[slug].quotes++;
        if (b.status === 'pending') counts[slug].pending++;
      });
      setJobCounts(counts);
    };
    fetch();
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Divisions"
        description="Overview of all operational divisions — click any division to manage its requests."
        icon={Building2}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {divisions.map((div) => {
          const Icon = div.icon;
          const counts = jobCounts[div.slug] || { jobs: 0, quotes: 0, pending: 0 };
          return (
            <div
              key={div.name}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 hover:shadow-md transition-all duration-300 group cursor-pointer"
              onClick={() => onNavigate(div.page)}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 ${div.lightColor} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-6 h-6 ${div.textColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900">{div.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{div.description}</p>
                </div>
                <ArrowRight className={`w-5 h-5 ${div.textColor} opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0`} />
              </div>
              <div className="grid grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-lg font-bold text-slate-900">{counts.jobs}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">Active Jobs</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-lg font-bold text-slate-900">{counts.quotes}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">Quotes</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-lg font-bold text-slate-900">{counts.pending}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">Pending</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-lg font-bold text-slate-900">{div.staff}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">Staff</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
