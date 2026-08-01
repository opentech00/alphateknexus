import { useState, useEffect } from 'react';
import { Home, ClipboardList, Clock, Bell, BarChart3, MapPin, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { FieldStaffProvider, useFieldStaff } from './FieldStaffContext';
import { ToastContainer } from './components/Toast';
import { initPushNotifications } from '../../lib/pushNotifications';
import { DashboardScreen } from './screens/DashboardScreen';
import { JobsScreen } from './screens/JobsScreen';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { InboxScreen } from './screens/InboxScreen';
import { PerformanceScreen } from './screens/PerformanceScreen';
import { IncidentReportScreen } from './screens/IncidentReportScreen';

type Tab = 'dashboard' | 'jobs' | 'attendance' | 'inbox' | 'performance';

function FieldStaffContent() {
  const { employee, signOut } = useAuth();
  const { loading, error, online, pendingSync, refresh } = useFieldStaff();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showIncident, setShowIncident] = useState(false);

  useEffect(() => {
    if (employee) {
      initPushNotifications('field').catch(() => {});
    }
  }, [employee]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (selectedJobId) {
    return (
      <JobDetailScreen
        assignmentId={selectedJobId}
        onBack={() => setSelectedJobId(null)}
      />
    );
  }

  if (showIncident) {
    return <IncidentReportScreen onBack={() => setShowIncident(false)} />;
  }

  const navItems: { key: Tab; label: string; icon: typeof Home }[] = [
    { key: 'dashboard',   label: 'Home',       icon: Home },
    { key: 'jobs',        label: 'Jobs',        icon: ClipboardList },
    { key: 'attendance',  label: 'Attendance', icon: Clock },
    { key: 'inbox',       label: 'Inbox',       icon: Bell },
    { key: 'performance', label: 'Performance', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ToastContainer />

      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">Field Staff</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Alphatek Nexus</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Offline / sync indicator */}
          {!online ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </span>
          ) : pendingSync > 0 ? (
            <button
              onClick={() => refresh()}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {pendingSync} syncing
            </button>
          ) : null}
          {employee?.photo_url ? (
            <img src={employee.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-slate-600">{employee?.full_name?.[0]?.toUpperCase()}</span>
            </div>
          )}
          <button onClick={signOut} className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2">
            Exit
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-600 text-center">
          {error}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'dashboard'   && <DashboardScreen onOpenJob={(id) => setSelectedJobId(id)} onReportIncident={() => setShowIncident(true)} onViewStats={() => setTab('performance')} />}
        {tab === 'jobs'        && <JobsScreen onOpenJob={(id) => setSelectedJobId(id)} />}
        {tab === 'attendance'  && <AttendanceScreen />}
        {tab === 'inbox'       && <InboxScreen />}
        {tab === 'performance' && <PerformanceScreen />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around px-2 py-1.5 z-20 max-w-md mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                active ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
              <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function FieldStaffApp() {
  return (
    <FieldStaffProvider>
      <FieldStaffContent />
    </FieldStaffProvider>
  );
}
