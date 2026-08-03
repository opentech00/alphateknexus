import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, GitBranch, Plus, X, AlertCircle, CheckCircle2, Clock,
  ArrowRight, Filter, Send, RotateCcw, History, ChevronDown, ChevronRight,
  User, Calendar, Flag, Inbox, CheckSquare, Square, ListChecks,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TaskDelegation {
  id: string;
  title: string;
  description: string | null;
  service_id: string | null;
  assigned_by: string;
  assigned_to: string;
  assigned_by_employee: { full_name: string; employee_number: string } | null;
  assigned_to_employee: { full_name: string; employee_number: string } | null;
  services: { name: string } | null;
  booking_id: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

interface EmployeeOption {
  id: string;
  full_name: string;
  employee_number: string;
  email: string;
  service_id: string | null;
  services: { name: string } | null;
  reports_to: string | null;
  user_id: string | null;
}

interface ProgressUpdate {
  id: string;
  status_from: string;
  status_to: string;
  message: string | null;
  created_at: string;
  update_by: string;
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400' },
  accepted:    { label: 'Accepted',    cls: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  declined:    { label: 'Declined',    cls: 'bg-red-50 text-red-600 border-red-200',        dot: 'bg-red-400' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  completed:   { label: 'Completed',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-600' },
  high:   { label: 'High',   cls: 'bg-amber-50 text-amber-600' },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-600' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TaskDelegationPage() {
  const [tasks, setTasks] = useState<TaskDelegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<TaskDelegation | null>(null);
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('task_delegations')
      .select(`
        id, title, description, service_id, assigned_by, assigned_to,
        assigned_by_employee:employees!assigned_by_employee_id(full_name, employee_number),
        assigned_to_employee:employees!assigned_to_employee_id(full_name, employee_number),
        services(name),
        booking_id, status, priority, due_date,
        accepted_at, declined_at, decline_reason, completed_at, completion_notes,
        parent_task_id, created_at, updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    setTasks((data as unknown as TaskDelegation[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const fetchProgress = async (taskId: string) => {
    setProgressLoading(true);
    const { data } = await supabase
      .from('task_progress_updates')
      .select('id, status_from, status_to, message, created_at, update_by')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    setProgressUpdates((data as ProgressUpdate[]) || []);
    setProgressLoading(false);
  };

  const handleExpand = (taskId: string) => {
    if (expandedId === taskId) {
      setExpandedId(null);
    } else {
      setExpandedId(taskId);
      fetchProgress(taskId);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    await supabase.from('task_delegations').update({ status: 'cancelled' }).eq('id', taskId);
    fetchTasks();
  };

  const filtered = filterStatus === 'all' ? tasks : tasks.filter(t => t.status === filterStatus);

  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    declined: tasks.filter(t => t.status === 'declined').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Task Delegation</h1>
            <p className="text-sm text-slate-500">Delegate tasks from managers to subordinates with full tracking</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" /> Delegate New Task
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { key: 'all', label: 'Total', color: 'text-slate-700', bg: 'bg-slate-50' },
          { key: 'pending', label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50' },
          { key: 'in_progress', label: 'Active', color: 'text-blue-600', bg: 'bg-blue-50' },
          { key: 'completed', label: 'Done', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { key: 'declined', label: 'Declined', color: 'text-red-500', bg: 'bg-red-50' },
        ] as const).map(s => (
          <button key={s.key} onClick={() => setFilterStatus(s.key)}
            className={`p-3 rounded-xl border text-left transition-all ${filterStatus === s.key ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center mb-2`}>
              <ListChecks className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-xl font-bold text-slate-900">{counts[s.key as keyof typeof counts]}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">No delegated tasks</h3>
          <p className="text-sm text-slate-500">Click "Delegate New Task" to assign work to your team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const meta = STATUS_META[task.status] || STATUS_META.pending;
            const pri = PRIORITY_META[task.priority] || PRIORITY_META.medium;
            const expanded = expandedId === task.id;
            const overdue = task.due_date && task.status !== 'completed' && task.status !== 'cancelled' && new Date(task.due_date) < new Date();
            return (
              <div key={task.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div
                  onClick={() => handleExpand(task.id)}
                  className="p-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <p className="font-semibold text-slate-900 text-sm">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${pri.cls}`}>{pri.label}</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.cls}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot} mr-1.5`} />
                        {meta.label}
                      </span>
                    </div>
                  </div>
                  {task.description && <p className="text-xs text-slate-500 ml-6 mb-2 line-clamp-2">{task.description}</p>}
                  <div className="flex items-center gap-4 ml-6 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {task.assigned_to_employee?.full_name || 'Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" />
                      from {task.assigned_by_employee?.full_name || 'Admin'}
                    </span>
                    {task.services && <span className="flex items-center gap-1"><Square className="w-3 h-3" /> {task.services.name}</span>}
                    {task.due_date && (
                      <span className={`flex items-center gap-1 ${overdue ? 'text-red-500 font-semibold' : ''}`}>
                        <Calendar className="w-3.5 h-3.5" /> {fmtDate(task.due_date)}{overdue ? ' (overdue)' : ''}
                      </span>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/30 space-y-4">
                    {task.description && (
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1">Description</p>
                        <p className="text-sm text-slate-600">{task.description}</p>
                      </div>
                    )}
                    {task.completion_notes && (
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1">Completion Notes</p>
                        <p className="text-sm text-slate-600">{task.completion_notes}</p>
                      </div>
                    )}
                    {task.decline_reason && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-700 mb-1">Decline Reason</p>
                        <p className="text-sm text-red-600">{task.decline_reason}</p>
                      </div>
                    )}
                    {/* Progress timeline */}
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Progress Timeline</p>
                      {progressLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                      ) : progressUpdates.length === 0 ? (
                        <p className="text-xs text-slate-400">No progress updates yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {progressUpdates.map(pu => (
                            <div key={pu.id} className="flex items-start gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                              <div>
                                <span className="font-medium text-slate-700">{STATUS_META[pu.status_to]?.label || pu.status_to}</span>
                                <span className="text-slate-400"> · {fmtDateTime(pu.created_at)}</span>
                                {pu.message && <p className="text-slate-500 mt-0.5">{pu.message}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    {(task.status === 'pending' || task.status === 'accepted' || task.status === 'in_progress') && (
                      <button
                        onClick={() => handleCancelTask(task.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel Task
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && <CreateTaskModal onClose={() => { setShowCreate(false); fetchTasks(); }} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Create Task Modal
   ═══════════════════════════════════════════════════════════════ */

function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: empData }, { data: svcData }] = await Promise.all([
        supabase.from('employees')
          .select('id, full_name, employee_number, email, service_id, services(name), reports_to, user_id')
          .eq('status', 'active')
          .order('full_name'),
        supabase.from('services').select('id, name').order('name'),
      ]);
      setEmployees((empData as unknown as EmployeeOption[]) || []);
      setServices((svcData as { id: string; name: string }[]) || []);
      setLoading(false);
    })();
  }, []);

  const filteredEmployees = serviceId
    ? employees.filter(e => e.service_id === serviceId)
    : employees;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !assigneeId) { setError('Title and assignee are required'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); return; }
    setSaving(true);
    setError('');
    try {
      const assignee = employees.find(e => e.id === assigneeId);
      const { error: insErr } = await supabase.from('task_delegations').insert({
        title: title.trim(),
        description: description.trim() || null,
        assigned_by: user.id,
        assigned_to: assignee?.user_id || assigneeId,
        assigned_to_employee_id: assigneeId,
        service_id: serviceId || assignee?.service_id || null,
        priority,
        due_date: dueDate || null,
      });
      if (insErr) throw insErr;
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Delegate New Task</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Task Title *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Inspect site at Freetown warehouse"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Detailed instructions for the task…"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Division</label>
                  <select value={serviceId} onChange={e => { setServiceId(e.target.value); setAssigneeId(''); }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all">
                    <option value="">All divisions</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assign To *</label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all">
                  <option value="">Select an employee…</option>
                  {filteredEmployees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.full_name} ({e.employee_number}){e.services ? ` — ${e.services.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Delegate</>}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
