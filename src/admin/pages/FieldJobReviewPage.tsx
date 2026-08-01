import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import {
  ClipboardCheck, CheckCircle2, XCircle, Clock, Search, Filter,
  Calendar, MapPin, User, Briefcase, FileText, Image as ImageIcon,
  ListChecks, PenTool, Star, Loader2, ArrowLeft, Clock3,
} from 'lucide-react';

interface Evidence {
  id: string;
  photo_url: string;
  photo_type: string;
  created_at: string;
}

interface Task {
  id: string;
  task_text: string;
  completed: boolean;
}

interface CheckIn {
  id: string;
  checkin_time: string | null;
  checkout_time: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface ReviewAssignment {
  id: string;
  employee_id: string;
  service_name: string;
  customer_name: string;
  address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  amount: number | null;
  instructions: string | null;
  customer_signature: string | null;
  signature_captured_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  employees: { full_name: string; email: string } | null;
  evidence: Evidence[];
  tasks: Task[];
  check_ins: CheckIn[];
}

export function FieldJobReviewPage() {
  const [assignments, setAssignments] = useState<ReviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [scores, setScores] = useState({ punctuality: 3, speed: 3, quality: 3 });

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('field_assignments')
        .select(`
          id, employee_id, service_name, customer_name, address,
          scheduled_date, scheduled_time, status, amount, instructions,
          customer_signature, signature_captured_at,
          reviewed_by, reviewed_at, review_note, rejection_reason,
          created_at, updated_at,
          employees(full_name, email),
          field_evidence(id, photo_url, photo_type, created_at),
          field_assignment_tasks(id, task_text, completed),
          field_check_ins(id, checkin_time, checkout_time, latitude, longitude)
        `)
        .in('status', ['pending_review', 'approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(100);

      if (err) throw err;
      setAssignments((data || []) as unknown as ReviewAssignment[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  useEffect(() => {
    const channel = supabase
      .channel('admin_field_job_review')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_assignments' }, () => loadAssignments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAssignments]);

  const handleApprove = async (assignmentId: string) => {
    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('field_assignments')
        .update({
          status: 'approved',
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote || null,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignmentId);
      if (err) throw err;

      // Insert job score
      const assignment = assignments.find(a => a.id === assignmentId);
      if (assignment) {
        const overall = Math.round((scores.punctuality + scores.speed + scores.quality) / 3);
        await supabase.from('field_job_scores').upsert({
          assignment_id: assignmentId,
          employee_id: assignment.employee_id,
          punctuality_score: scores.punctuality,
          speed_score: scores.speed,
          quality_score: scores.quality,
          overall_score: overall,
          scored_at: new Date().toISOString(),
        }, { onConflict: 'assignment_id' });

        // Update employee performance
        await supabase.rpc('update_employee_performance', { emp_id: assignment.employee_id }).then(() => {});
      }

      setReviewNote('');
      setScores({ punctuality: 3, speed: 3, quality: 3 });
      setSelectedId(null);
      loadAssignments();
    } catch (err: any) {
      setError(err.message || 'Failed to approve job');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (assignmentId: string) => {
    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('field_assignments')
        .update({
          status: 'rejected',
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote || null,
          rejection_reason: reviewNote || 'Work did not meet quality standards',
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignmentId);
      if (err) throw err;

      setReviewNote('');
      setSelectedId(null);
      loadAssignments();
    } catch (err: any) {
      setError(err.message || 'Failed to reject job');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = assignments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.customer_name?.toLowerCase().includes(q) ||
        a.service_name?.toLowerCase().includes(q) ||
        a.address?.toLowerCase().includes(q) ||
        a.employees?.full_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingCount = assignments.filter(a => a.status === 'pending_review').length;
  const approvedCount = assignments.filter(a => a.status === 'approved').length;
  const rejectedCount = assignments.filter(a => a.status === 'rejected').length;

  const selected = assignments.find(a => a.id === selectedId);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  // ─── Detail View ──────────────────────────────────────────────────────────────
  if (selected) {
    const completedTasks = selected.tasks.filter(t => t.completed).length;
    const totalTasks = selected.tasks.length;
    const beforePhotos = selected.evidence.filter(e => e.photo_type === 'before');
    const afterPhotos = selected.evidence.filter(e => e.photo_type === 'after');
    const checkIn = selected.check_ins[0];

    return (
      <div>
        <button
          onClick={() => { setSelectedId(null); setReviewNote(''); }}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to review queue
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Job info + evidence */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selected.service_name}</h2>
                  <p className="text-sm text-slate-400">{selected.customer_name}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusBadge(selected.status)}`}>
                  {statusLabel(selected.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow icon={User} label="Worker" value={selected.employees?.full_name || 'Unknown'} />
                <InfoRow icon={Calendar} label="Scheduled" value={`${selected.scheduled_date || 'N/A'} ${selected.scheduled_time || ''}`} />
                <InfoRow icon={MapPin} label="Location" value={selected.address || 'N/A'} />
                <InfoRow icon={Briefcase} label="Amount" value={selected.amount ? `$${selected.amount}` : 'N/A'} />
              </div>
              {selected.instructions && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Instructions</p>
                  <p className="text-sm text-slate-700">{selected.instructions}</p>
                </div>
              )}
            </Card>

            {/* Check-in / Check-out */}
            {checkIn && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-slate-400" /> Attendance Record
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Check-in</p>
                    <p className="font-medium text-slate-700">{checkIn.checkin_time ? new Date(checkIn.checkin_time).toLocaleString() : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Check-out</p>
                    <p className="font-medium text-slate-700">{checkIn.checkout_time ? new Date(checkIn.checkout_time).toLocaleString() : 'In progress'}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Checklist */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-slate-400" /> Checklist ({completedTasks}/{totalTasks})
              </h3>
              {totalTasks === 0 ? (
                <p className="text-sm text-slate-400">No checklist items</p>
              ) : (
                <div className="space-y-1.5">
                  {selected.tasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 text-sm">
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      )}
                      <span className={task.completed ? 'text-slate-700' : 'text-slate-400 line-through'}>
                        {task.task_text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Evidence Photos */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-400" /> Evidence Photos
              </h3>
              {selected.evidence.length === 0 ? (
                <p className="text-sm text-slate-400">No evidence photos uploaded</p>
              ) : (
                <div className="space-y-4">
                  {beforePhotos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">Before</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {beforePhotos.map(photo => (
                          <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={photo.photo_url} alt="Before" className="w-full h-24 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {afterPhotos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">After</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {afterPhotos.map(photo => (
                          <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={photo.photo_url} alt="After" className="w-full h-24 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Customer Signature */}
            {selected.customer_signature && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-slate-400" /> Customer Signature
                </h3>
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <img src={selected.customer_signature} alt="Customer signature" className="max-h-32 mx-auto" />
                </div>
                {selected.signature_captured_at && (
                  <p className="text-xs text-slate-400 mt-1.5">Captured: {new Date(selected.signature_captured_at).toLocaleString()}</p>
                )}
              </Card>
            )}
          </div>

          {/* Right: Review actions */}
          <div className="space-y-4">
            <Card className="p-4 sticky top-20">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Review Actions</h3>

              {selected.status === 'pending_review' ? (
                <>
                  <textarea
                    value={reviewNote}
                    onChange={e => setReviewNote(e.target.value)}
                    placeholder="Add a review note (optional for approval, required for rejection)..."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none mb-4"
                  />

                  {/* Quality scoring */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5" /> Quality Scores (1-5)
                    </p>
                    <div className="space-y-2.5">
                      <ScoreSlider label="Punctuality" value={scores.punctuality} onChange={v => setScores(s => ({ ...s, punctuality: v }))} />
                      <ScoreSlider label="Speed" value={scores.speed} onChange={v => setScores(s => ({ ...s, speed: v }))} />
                      <ScoreSlider label="Quality" value={scores.quality} onChange={v => setScores(s => ({ ...s, quality: v }))} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleApprove(selected.id)}
                      disabled={actionLoading}
                      className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Approve & Score
                    </button>
                    <button
                      onClick={() => handleReject(selected.id)}
                      disabled={actionLoading}
                      className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <div>
                  <div className={`p-3 rounded-lg mb-3 ${selected.status === 'approved' ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                    <p className={`text-sm font-semibold ${selected.status === 'approved' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {selected.status === 'approved' ? 'Job Approved' : 'Job Rejected'}
                    </p>
                    {selected.reviewed_at && (
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(selected.reviewed_at).toLocaleString()}</p>
                    )}
                  </div>
                  {selected.review_note && (
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs font-semibold text-slate-500 mb-1">Review Note</p>
                      <p className="text-sm text-slate-700">{selected.review_note}</p>
                    </div>
                  )}
                  {selected.rejection_reason && (
                    <div className="p-3 bg-rose-50 rounded-lg mt-2">
                      <p className="text-xs font-semibold text-rose-500 mb-1">Rejection Reason</p>
                      <p className="text-sm text-rose-700">{selected.rejection_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ─── List View ───────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Field Job Review"
        description="Review completed field work — evidence photos, checklists, and signatures before approving"
        icon={ClipboardCheck}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Pending Review" value={pendingCount} icon={Clock} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Approved" value={approvedCount} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Rejected" value={rejectedCount} icon={XCircle} color="text-rose-600" accent="bg-rose-50" />
        <StatCard label="Total" value={assignments.length} icon={Briefcase} color="text-slate-600" accent="bg-slate-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[
            { key: 'pending_review', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'all', label: 'All' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by worker, customer, service, or address..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No jobs to review" description="Completed field jobs awaiting quality review will appear here" />
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const completedTasks = a.tasks.filter(t => t.completed).length;
            const totalTasks = a.tasks.length;
            const afterCount = a.evidence.filter(e => e.photo_type === 'after').length;
            const hasSig = !!a.customer_signature;

            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBadge(a.status)}`}>
                        {statusLabel(a.status)}
                      </span>
                      <span className="text-xs text-slate-400">{new Date(a.updated_at).toLocaleDateString()}</span>
                    </div>
                    <p className="font-semibold text-sm text-slate-900">{a.service_name}</p>
                    <p className="text-xs text-slate-400">{a.customer_name} · {a.employees?.full_name || 'Unknown worker'}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{a.address}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {/* Completion indicators */}
                    <div className="flex items-center gap-1.5">
                      <Badge icon={ListChecks} value={`${completedTasks}/${totalTasks}`} ok={completedTasks === totalTasks} />
                      <Badge icon={ImageIcon} value={`${afterCount}`} ok={afterCount > 0} />
                      <Badge icon={PenTool} value="" ok={hasSig} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 flex items-center gap-1"><Icon className="w-3 h-3" />{label}</p>
      <p className="font-medium text-slate-700 text-sm">{value}</p>
    </div>
  );
}

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-xs font-bold text-slate-800">{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-emerald-600"
      />
    </div>
  );
}

function Badge({ icon: Icon, value, ok }: { icon: typeof User; value: string; ok: boolean }) {
  return (
    <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
      <Icon className="w-2.5 h-2.5" />
      {value}
    </span>
  );
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return map[status] || 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_review: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return map[status] || status;
}
