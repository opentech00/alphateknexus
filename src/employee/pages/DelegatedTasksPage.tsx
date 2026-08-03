import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, GitBranch, AlertCircle, CheckCircle2, Clock, XCircle,
  ArrowRight, Send, Calendar, Flag, Inbox, Play, CheckSquare,
  History, ChevronDown, ChevronRight, User,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';
import { fmtDate } from '../types';

interface DelegatedTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  created_at: string;
  assigned_by_employee: { full_name: string; employee_number: string } | null;
  services: { name: string } | null;
}

interface ProgressUpdate {
  id: string;
  status_from: string;
  status_to: string;
  message: string | null;
  created_at: string;
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function DelegatedTasksPage({ onBack }: { onBack: () => void }) {
  const { employee, user } = useAuth();
  const [tasks, setTasks] = useState<DelegatedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDecline, setShowDecline] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showComplete, setShowComplete] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  const fetchTasks = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('task_delegations')
      .select(`
        id, title, description, status, priority, due_date,
        accepted_at, declined_at, decline_reason, completed_at, completion_notes,
        created_at,
        assigned_by_employee:employees!assigned_by_employee_id(full_name, employee_number),
        services(name)
      `)
      .eq('assigned_to', user.id)
      .order('created_at', { ascending: false });
    setTasks((data as unknown as DelegatedTask[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const fetchProgress = async (taskId: string) => {
    setProgressLoading(true);
    const { data } = await supabase
      .from('task_progress_updates')
      .select('id, status_from, status_to, message, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    setProgress((data as ProgressUpdate[]) || []);
    setProgressLoading(false);
  };

  const handleExpand = (taskId: string) => {
    if (expandedId === taskId) setExpandedId(null);
    else { setExpandedId(taskId); fetchProgress(taskId); }
  };

  const updateTask = async (taskId: string, updates: Record<string, unknown>) => {
    setActionLoading(taskId);
    await supabase.from('task_delegations').update(updates).eq('id', taskId);
    setActionLoading(null);
    fetchTasks();
    if (expandedId === taskId) fetchProgress(taskId);
  };

  const handleAccept = (taskId: string) => updateTask(taskId, { status: 'accepted', accepted_at: new Date().toISOString() });
  const handleStart = (taskId: string) => updateTask(taskId, { status: 'in_progress' });
  const handleDecline = async (taskId: string) => {
    await updateTask(taskId, { status: 'declined', declined_at: new Date().toISOString(), decline_reason: declineReason.trim() || null });
    setShowDecline(null);
    setDeclineReason('');
  };
  const handleComplete = async (taskId: string) => {
    await updateTask(taskId, { status: 'completed', completed_at: new Date().toISOString(), completion_notes: completionNotes.trim() || null });
    setShowComplete(null);
    setCompletionNotes('');
  };

  const filteredTasks = filter === 'active'
    ? tasks.filter(t => ['pending', 'accepted', 'in_progress'].includes(t.status))
    : filter === 'completed'
    ? tasks.filter(t => ['completed', 'declined', 'cancelled'].includes(t.status))
    : tasks;

  const activeCount = tasks.filter(t => ['pending', 'accepted', 'in_progress'].includes(t.status)).length;
  const completedCount = tasks.filter(t => ['completed', 'declined', 'cancelled'].includes(t.status)).length;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowRight className="w-4 h-4 rotate-180" /> Back to activities
      </button>

      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <GitBranch className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Delegated Tasks</h1>
          <p className="text-sm text-slate-400">Tasks assigned to you by your manager or supervisor</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'active', label: 'Active', count: activeCount },
          { key: 'completed', label: 'Completed', count: completedCount },
          { key: 'all', label: 'All', count: tasks.length },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === t.key ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {t.label} <span className={`text-xs ${filter === t.key ? 'text-emerald-100' : 'text-slate-400'}`}>({t.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">No tasks here</h3>
          <p className="text-sm text-slate-500">You have no {filter === 'active' ? 'active' : filter === 'completed' ? 'completed' : ''} delegated tasks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map(task => {
            const meta = STATUS_META[task.status] || STATUS_META.pending;
            const pri = PRIORITY_META[task.priority] || PRIORITY_META.medium;
            const expanded = expandedId === task.id;
            const overdue = task.due_date && ['pending', 'accepted', 'in_progress'].includes(task.status) && new Date(task.due_date) < new Date();
            const isActionLoading = actionLoading === task.id;
            return (
              <div key={task.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div onClick={() => handleExpand(task.id)} className="p-4 cursor-pointer hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <p className="font-semibold text-slate-900 text-sm">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${pri.cls}`}>{pri.label}</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.cls}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot} mr-1.5`} />{meta.label}
                      </span>
                    </div>
                  </div>
                  {task.description && <p className="text-xs text-slate-500 ml-6 mb-2 line-clamp-2">{task.description}</p>}
                  <div className="flex items-center gap-3 ml-6 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {task.assigned_by_employee?.full_name || 'Manager'}</span>
                    {task.services && <span>{task.services.name}</span>}
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
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-emerald-700 mb-1">Completion Notes</p>
                        <p className="text-sm text-emerald-600">{task.completion_notes}</p>
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
                      <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Progress</p>
                      {progressLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                      ) : progress.length === 0 ? (
                        <p className="text-xs text-slate-400">No updates yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {progress.map(pu => (
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

                    {/* Action buttons */}
                    {isActionLoading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Updating…</div>}

                    {/* Pending actions */}
                    {task.status === 'pending' && !isActionLoading && (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleAccept(task.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button onClick={() => handleStart(task.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                          <Play className="w-3.5 h-3.5" /> Start
                        </button>
                        <button onClick={() => setShowDecline(task.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                          <XCircle className="w-3.5 h-3.5" /> Decline
                        </button>
                      </div>
                    )}

                    {/* Accepted actions */}
                    {task.status === 'accepted' && !isActionLoading && (
                      <div className="flex gap-2">
                        <button onClick={() => handleStart(task.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                          <Play className="w-3.5 h-3.5" /> Start Work
                        </button>
                        <button onClick={() => setShowComplete(task.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                          <CheckSquare className="w-3.5 h-3.5" /> Complete
                        </button>
                      </div>
                    )}

                    {/* In Progress actions */}
                    {task.status === 'in_progress' && !isActionLoading && (
                      <button onClick={() => setShowComplete(task.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                        <CheckSquare className="w-3.5 h-3.5" /> Mark as Completed
                      </button>
                    )}

                    {/* Decline modal inline */}
                    {showDecline === task.id && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-red-700">Reason for declining:</p>
                        <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={2}
                          placeholder="Explain why you cannot accept this task…"
                          className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/20 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => { setShowDecline(null); setDeclineReason(''); }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white">Cancel</button>
                          <button onClick={() => handleDecline(task.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg">Confirm Decline</button>
                        </div>
                      </div>
                    )}

                    {/* Complete modal inline */}
                    {showComplete === task.id && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-emerald-700">Completion notes (optional):</p>
                        <textarea value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} rows={2}
                          placeholder="Summarize what was done…"
                          className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => { setShowComplete(null); setCompletionNotes(''); }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white">Cancel</button>
                          <button onClick={() => handleComplete(task.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Confirm Complete</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
