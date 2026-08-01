import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, Search, Filter,
  Calendar, MapPin, User, Image as ImageIcon, ArrowLeft, Loader2,
  Zap, AlertCircle, Wrench, ShieldAlert, FileWarning, Briefcase,
} from 'lucide-react';

interface Incident {
  id: string;
  assignment_id: string | null;
  employee_id: string;
  incident_type: string;
  description: string;
  photo_url: string | null;
  status: string;
  priority: string;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  employees: { full_name: string; email: string } | null;
  field_assignments: { service_name: string; customer_name: string; address: string } | null;
}

const INCIDENT_TYPES: Record<string, { icon: typeof Zap; color: string; label: string }> = {
  'Equipment Issue': { icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Equipment Issue' },
  'Safety Hazard': { icon: ShieldAlert, color: 'text-orange-600 bg-orange-50 border-orange-200', label: 'Safety Hazard' },
  'Customer Complaint': { icon: AlertCircle, color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Customer Complaint' },
  'Property Damage': { icon: FileWarning, color: 'text-red-600 bg-red-50 border-red-200', label: 'Property Damage' },
  'Other': { icon: AlertTriangle, color: 'text-slate-600 bg-slate-50 border-slate-200', label: 'Other' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-slate-500 bg-slate-100' },
  normal: { label: 'Normal', color: 'text-blue-500 bg-blue-100' },
  high: { label: 'High', color: 'text-orange-500 bg-orange-100' },
  critical: { label: 'Critical', color: 'text-red-500 bg-red-100' },
};

export function FieldIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [newPriority, setNewPriority] = useState('normal');

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('field_incidents')
        .select(`
          id, assignment_id, employee_id, incident_type, description, photo_url,
          status, priority, resolution_note, resolved_by, resolved_at, created_at,
          employees(full_name, email),
          field_assignments(service_name, customer_name, address)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (err) throw err;
      setIncidents((data || []) as unknown as Incident[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  useEffect(() => {
    const channel = supabase
      .channel('admin_field_incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_incidents' }, () => loadIncidents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadIncidents]);

  const handleUpdateStatus = async (incidentId: string, status: 'reviewed' | 'closed') => {
    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === 'closed') {
        updates.resolved_by = user?.id || null;
        updates.resolved_at = new Date().toISOString();
        updates.resolution_note = resolutionNote || null;
      }

      const { error: err } = await supabase
        .from('field_incidents')
        .update(updates)
        .eq('id', incidentId);
      if (err) throw err;

      setResolutionNote('');
      setSelectedId(null);
      loadIncidents();
    } catch (err: any) {
      setError(err.message || 'Failed to update incident');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePriority = async (incidentId: string, priority: string) => {
    try {
      const { error: err } = await supabase
        .from('field_incidents')
        .update({ priority })
        .eq('id', incidentId);
      if (err) throw err;
      loadIncidents();
    } catch (err: any) {
      setError(err.message || 'Failed to update priority');
    }
  };

  const filtered = incidents.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    if (filterType !== 'all' && i.incident_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        i.description?.toLowerCase().includes(q) ||
        i.incident_type?.toLowerCase().includes(q) ||
        i.employees?.full_name?.toLowerCase().includes(q) ||
        i.field_assignments?.customer_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCount = incidents.filter(i => i.status === 'open').length;
  const reviewedCount = incidents.filter(i => i.status === 'reviewed').length;
  const closedCount = incidents.filter(i => i.status === 'closed').length;
  const criticalCount = incidents.filter(i => i.priority === 'critical' && i.status !== 'closed').length;

  const selected = incidents.find(i => i.id === selectedId);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  // ─── Detail View ──────────────────────────────────────────────────────────────
  if (selected) {
    const typeConfig = INCIDENT_TYPES[selected.incident_type] || INCIDENT_TYPES['Other'];
    const TypeIcon = typeConfig.icon;
    const prioConfig = PRIORITY_CONFIG[selected.priority] || PRIORITY_CONFIG['normal'];

    return (
      <div>
        <button
          onClick={() => { setSelectedId(null); setResolutionNote(''); }}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to incidents
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Incident details */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${typeConfig.color.split(' ').slice(1).join(' ')}`}>
                  <TypeIcon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-bold text-slate-900">{selected.incident_type}</h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBadge(selected.status)}`}>
                      {statusLabel(selected.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Reported by {selected.employees?.full_name || 'Unknown'} · {new Date(selected.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${prioConfig.color}`}>
                  {prioConfig.label} Priority
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs font-semibold text-slate-500 mb-1">Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.description}</p>
              </div>

              {selected.field_assignments && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />Customer</p>
                    <p className="font-medium text-slate-700">{selected.field_assignments.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Briefcase className="w-3 h-3" />Service</p>
                    <p className="font-medium text-slate-700">{selected.field_assignments.service_name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />Location</p>
                    <p className="font-medium text-slate-700">{selected.field_assignments.address}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Photo evidence */}
            {selected.photo_url && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-400" /> Incident Photo
                </h3>
                <a href={selected.photo_url} target="_blank" rel="noopener noreferrer">
                  <img src={selected.photo_url} alt="Incident" className="max-w-full rounded-lg border border-slate-200 max-h-80 object-contain" />
                </a>
              </Card>
            )}

            {/* Resolution */}
            {selected.status === 'closed' && selected.resolution_note && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Resolution
                </h3>
                <p className="text-sm text-slate-700">{selected.resolution_note}</p>
                {selected.resolved_at && (
                  <p className="text-xs text-slate-400 mt-1.5">Resolved: {new Date(selected.resolved_at).toLocaleString()}</p>
                )}
              </Card>
            )}
          </div>

          {/* Right: Actions */}
          <div className="space-y-4">
            <Card className="p-4 sticky top-20">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Incident Actions</h3>

              {selected.status !== 'closed' ? (
                <>
                  {/* Priority selector */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Priority Level</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => { setNewPriority(key); handleUpdatePriority(selected.id, key); }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            selected.priority === key
                              ? `${cfg.color} border-current`
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                    placeholder="Add resolution notes (required to close)..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none mb-3"
                  />

                  <div className="flex flex-col gap-2">
                    {selected.status === 'open' && (
                      <button
                        onClick={() => handleUpdateStatus(selected.id, 'reviewed')}
                        disabled={actionLoading}
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        <Clock className="w-4 h-4" /> Mark as Reviewed
                      </button>
                    )}
                    <button
                      onClick={() => handleUpdateStatus(selected.id, 'closed')}
                      disabled={actionLoading || !resolutionNote.trim()}
                      className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Close Incident
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Incident Closed
                  </p>
                  {selected.resolved_at && (
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(selected.resolved_at).toLocaleString()}</p>
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
        title="Field Incidents"
        description="Triage and resolve incident reports filed by field staff"
        icon={AlertTriangle}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Open" value={openCount} icon={AlertCircle} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Reviewed" value={reviewedCount} icon={Clock} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Closed" value={closedCount} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Critical" value={criticalCount} icon={Zap} color="text-red-600" accent="bg-red-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[
            { key: 'open', label: 'Open' },
            { key: 'reviewed', label: 'Reviewed' },
            { key: 'closed', label: 'Closed' },
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
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Types</option>
          {Object.entries(INCIDENT_TYPES).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by worker, description, or customer..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents" description="Incident reports from field staff will appear here for triage" />
      ) : (
        <div className="space-y-2">
          {filtered.map(incident => {
            const typeConfig = INCIDENT_TYPES[incident.incident_type] || INCIDENT_TYPES['Other'];
            const TypeIcon = typeConfig.icon;
            const prioConfig = PRIORITY_CONFIG[incident.priority] || PRIORITY_CONFIG['normal'];

            return (
              <button
                key={incident.id}
                onClick={() => setSelectedId(incident.id)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${typeConfig.color.split(' ').slice(1).join(' ')}`}>
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-900">{incident.incident_type}</p>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(incident.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {incident.employees?.full_name || 'Unknown worker'}
                      {incident.field_assignments && ` · ${incident.field_assignments.customer_name}`}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-1">{incident.description}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${statusBadge(incident.status)}`}>
                        {statusLabel(incident.status)}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${prioConfig.color}`}>
                        {prioConfig.label}
                      </span>
                      {incident.photo_url && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-500">
                          <ImageIcon className="w-2.5 h-2.5" /> Photo
                        </span>
                      )}
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

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    open: 'bg-amber-50 text-amber-700 border-amber-200',
    reviewed: 'bg-blue-50 text-blue-700 border-blue-200',
    closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return map[status] || 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    open: 'Open',
    reviewed: 'Reviewed',
    closed: 'Closed',
  };
  return map[status] || status;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
