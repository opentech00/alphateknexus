import { useEffect, useMemo, useState } from 'react';
import {
  Landmark, Users, Briefcase, ArrowRight, Wallet, Receipt, BarChart3, Banknote,
  ShieldCheck, Loader2, Inbox,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card } from '../components/ui';
import { STATUS_META } from '../hr/types';
import { INTERNAL_DEPARTMENT_SLUG } from '../../lib/capabilities';

interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  status: keyof typeof STATUS_META;
  photo_url: string | null;
  hr_roles?: { name: string } | null;
}

interface Props {
  onNavigate: (page: string) => void;
}

export function AdminFinanceWorkspacePage({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      const { data: service } = await supabase
        .from('services')
        .select('id')
        .eq('slug', INTERNAL_DEPARTMENT_SLUG)
        .maybeSingle();
      if (!service?.id) {
        setError('Admin & Finance department is not set up yet.');
        setStaff([]);
        setLoading(false);
        return;
      }
      const [{ data: empData, error: empErr }, { count }] = await Promise.all([
        supabase
          .from('employees')
          .select('id, full_name, email, status, photo_url, hr_roles(name)')
          .eq('service_id', service.id)
          .order('full_name'),
        supabase
          .from('finance_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'submitted'),
      ]);
      if (empErr) setError(empErr.message);
      const mapped: StaffRow[] = ((empData || []) as Array<{
        id: string;
        full_name: string;
        email: string;
        status: StaffRow['status'];
        photo_url: string | null;
        hr_roles?: { name: string } | { name: string }[] | null;
      }>).map((e) => ({
        id: e.id,
        full_name: e.full_name,
        email: e.email,
        status: e.status,
        photo_url: e.photo_url,
        hr_roles: Array.isArray(e.hr_roles) ? (e.hr_roles[0] || null) : (e.hr_roles || null),
      }));
      setStaff(mapped);
      setPendingApprovals(count || 0);
      setLoading(false);
    };
    void load();
  }, []);

  const stats = useMemo(() => {
    const mix: Record<string, number> = {};
    staff.forEach((e) => {
      const name = e.hr_roles?.name || 'Unassigned';
      mix[name] = (mix[name] || 0) + 1;
    });
    return {
      total: staff.length,
      active: staff.filter((e) => e.status === 'active').length,
      mix,
    };
  }, [staff]);

  const links = [
    { label: 'Finance module', page: 'finance', icon: Landmark, desc: 'Invoices, payouts, and approvals' },
    { label: 'Service ledgers', page: 'finance-services', icon: Banknote, desc: 'Quote/hire requests and online or offline payments' },
    { label: 'Wallet', page: 'wallet', icon: Wallet, desc: 'Wallet balances and adjustments' },
    { label: 'Receipts', page: 'receipts', icon: Receipt, desc: 'Payment receipts and emails' },
    { label: 'Analytics', page: 'analytics', icon: BarChart3, desc: 'Company-wide reporting' },
    { label: 'Employees', page: 'hr-employees', icon: Users, desc: 'Assign roles and portal access' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin & Finance"
        description="Internal department workspace — staff, roles, and finance operations"
        icon={Landmark}
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Department staff" value={stats.total} icon={Users} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={ShieldCheck} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Roles in mix" value={Object.keys(stats.mix).length} icon={Briefcase} color="text-blue-600" accent="bg-blue-50" />
        <button
          type="button"
          onClick={() => onNavigate('finance')}
          className="text-left"
        >
          <StatCard label="Awaiting approval" value={pendingApprovals} icon={Inbox} color="text-amber-600" accent="bg-amber-50" />
        </button>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Operations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.page}
                type="button"
                onClick={() => onNavigate(link.page)}
                className="group flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-emerald-200 transition-all text-left"
              >
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{link.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{link.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 mt-1" />
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Role mix</h2>
        {Object.keys(stats.mix).length === 0 ? (
          <p className="text-sm text-slate-500">No staff assigned yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.mix).map(([name, count]) => (
              <span key={name} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-sm text-slate-700">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                {name}
                <span className="font-semibold">{count}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Staff roster</h2>
          <button
            type="button"
            onClick={() => onNavigate('hr-employees')}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            Manage employees
          </button>
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-slate-500">Assign staff to Admin & Finance from HR → Employees.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {staff.map((e) => {
              const sm = STATUS_META[e.status] ?? STATUS_META.active;
              return (
                <div key={e.id} className="flex items-center gap-3 py-3">
                  {e.photo_url ? (
                    <img src={e.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-sm font-semibold text-emerald-700">
                      {e.full_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{e.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{e.email}</p>
                  </div>
                  <span className="text-xs text-slate-500 hidden sm:inline">{e.hr_roles?.name || 'No role'}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
