import { useEffect, useState } from 'react';
import {
  Loader2, FileText, Calendar, Upload, FileBarChart, User, CreditCard,
  Banknote, ClipboardList, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';

interface RoleActivity {
  id: string;
  activity_key: string;
  activity_label: string;
  activity_description: string | null;
  activity_type: 'page' | 'action' | 'report';
  display_order: number;
}

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  bookings: FileText,
  schedule: Calendar,
  documents: Upload,
  report: ClipboardList,
  performance: FileBarChart,
  profile: User,
  'id-card': CreditCard,
  'cash-collections': Banknote,
};

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  page:   { label: 'Page',   color: 'text-blue-600',   bg: 'bg-blue-50'   },
  action: { label: 'Action', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  report: { label: 'Report', color: 'text-amber-600',  bg: 'bg-amber-50'  },
};

export function ActivitiesPage({ onNavigate }: { onNavigate: (key: string) => void }) {
  const { employee } = useAuth();
  const [activities, setActivities] = useState<RoleActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee) return;
    (async () => {
      const { data } = await supabase
        .from('role_activities')
        .select('id, activity_key, activity_label, activity_description, activity_type, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      setActivities((data as RoleActivity[]) || []);
      setLoading(false);
    })();
  }, [employee]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <ClipboardList className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">No activities assigned</h3>
        <p className="text-sm text-slate-500">Your administrator hasn't assigned any activities to your role yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">My Activities</h1>
          <p className="text-sm text-slate-400">Tasks and pages available for your role{employee?.hr_roles?.name ? `: ${employee.hr_roles.name}` : ''}</p>
        </div>
      </div>

      {employee?.hr_roles && (
        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 rounded-2xl border border-emerald-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <ClipboardList className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Your Role</p>
            <p className="font-bold text-slate-900">{employee.hr_roles.name}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activities.map((activity) => {
          const Icon = ACTIVITY_ICONS[activity.activity_key] || ClipboardList;
          const meta = TYPE_META[activity.activity_type] || TYPE_META.page;
          return (
            <button
              key={activity.id}
              onClick={() => onNavigate(activity.activity_key)}
              className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 ${meta.bg} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 text-sm">{activity.activity_label}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color} ${meta.bg} px-1.5 py-0.5 rounded`}>
                      {meta.label}
                    </span>
                  </div>
                  {activity.activity_description && (
                    <p className="text-xs text-slate-500 mt-1">{activity.activity_description}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
