import { useEffect, useState } from 'react';
import {
  Users, Briefcase, CreditCard as IdCardIcon, TrendingUp, Building2, UserCheck,
  UserPlus, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, Spinner } from '../components/ui';
import { DIVISIONS } from '../hr/types';

interface DivisionCount {
  name: string;
  slug: string;
  count: number;
}

interface Props {
  onNavigate: (page: string) => void;
}

export function HrDashboardPage({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalEmployees: 0, active: 0, totalRoles: 0, totalCards: 0 });
  const [divisionCounts, setDivisionCounts] = useState<DivisionCount[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: empData }, { data: roleData }, { data: cardData }] = await Promise.all([
        supabase.from('employees').select('status, services(name,slug)'),
        supabase.from('hr_roles').select('id', { count: 'exact', head: true }),
        supabase.from('id_cards').select('id', { count: 'exact', head: true }),
      ]);
      const employees = empData || [];
      const counts: Record<string, number> = {};
      employees.forEach((e: any) => {
        if (e.services?.slug) counts[e.services.slug] = (counts[e.services.slug] || 0) + 1;
      });
      setDivisionCounts(
        DIVISIONS.map(d => ({ name: d.name, slug: d.slug, count: counts[d.slug] || 0 })),
      );
      setStats({
        totalEmployees: employees.length,
        active: employees.filter((e: any) => e.status === 'active').length,
        totalRoles: roleData?.length || 0,
        totalCards: cardData?.length || 0,
      });
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <Spinner />;

  const maxCount = Math.max(...divisionCounts.map(d => d.count), 1);

  const quickActions = [
    { label: 'Add Employee', icon: UserPlus, color: 'text-emerald-600', bg: 'bg-emerald-50', page: 'hr-employees' },
    { label: 'Create Role', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50', page: 'hr-roles' },
    { label: 'View ID Cards', icon: IdCardIcon, color: 'text-amber-600', bg: 'bg-amber-50', page: 'hr-id-cards' },
    { label: 'Manage Employees', icon: Users, color: 'text-teal-600', bg: 'bg-teal-50', page: 'hr-employees' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Dashboard"
        description="Workforce overview and staff distribution"
        icon={Users}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Employees" value={stats.totalEmployees} icon={Users} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active Staff" value={stats.active} icon={UserCheck} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Roles Defined" value={stats.totalRoles} icon={Briefcase} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="ID Cards Issued" value={stats.totalCards} icon={IdCardIcon} color="text-amber-600" accent="bg-amber-50" />
      </div>

      {/* Quick Actions */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => onNavigate(action.page)}
                className="group flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all text-left"
              >
                <div className={`w-10 h-10 ${action.bg} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <p className="text-sm font-medium text-slate-700 flex-1">{action.label}</p>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">Staff by Division</h2>
        </div>
        <div className="space-y-3">
          {divisionCounts.map(d => (
            <div key={d.slug}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-600">{d.name}</span>
                <span className="text-sm font-semibold text-slate-900">{d.count}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
