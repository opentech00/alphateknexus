import { useMemo } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Briefcase, Clock, ChevronRight } from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';
import { STATUS_META } from '../types';

interface InboxItem {
  id: string;
  type: 'job' | 'incident' | 'system';
  title: string;
  body: string;
  time: string;
  icon: typeof Bell;
  color: string;
  bg: string;
}

export function InboxScreen() {
  const { assignments, incidents } = useFieldStaff();

  const items = useMemo((): InboxItem[] => {
    const jobItems: InboxItem[] = assignments
      .filter(a => a.status === 'assigned' || a.status === 'pending_review' || a.status === 'approved' || a.status === 'rejected')
      .map(a => {
        const sm = STATUS_META[a.status];
        let title = '';
        let body = '';
        if (a.status === 'assigned') { title = 'New Job Assigned'; body = `${a.service_name} for ${a.customer_name || a.address}`; }
        else if (a.status === 'pending_review') { title = 'Job Submitted for Review'; body = `${a.service_name} — awaiting admin approval`; }
        else if (a.status === 'approved') { title = 'Job Approved'; body = `${a.service_name} has been approved`; }
        else if (a.status === 'rejected') { title = 'Job Rejected'; body = `${a.service_name} needs attention`; }
        return {
          id: `job-${a.id}`,
          type: 'job' as const,
          title, body,
          time: a.updated_at || a.created_at,
          icon: Briefcase,
          color: sm.color,
          bg: sm.bg,
        };
      });

    const incidentItems: InboxItem[] = incidents.map(inc => ({
      id: `inc-${inc.id}`,
      type: 'incident' as const,
      title: `Incident: ${inc.incident_type}`,
      body: inc.description,
      time: inc.created_at,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    }));

    return [...jobItems, ...incidentItems].sort((a, b) => b.time.localeCompare(a.time));
  }, [assignments, incidents]);

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Inbox</h1>
        <p className="text-sm text-slate-400">Job updates and notifications</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm">
                <div className={`w-9 h-9 ${item.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4.5 h-4.5 ${item.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(item.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
