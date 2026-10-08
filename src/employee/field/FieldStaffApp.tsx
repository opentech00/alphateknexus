import { useState, useEffect, type ReactNode } from 'react';
import { Home, ClipboardList, Clock, Bell, BarChart3, WifiOff, RefreshCw, Zap, ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { LoginPage } from '../pages/LoginPage';
import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { IdleWarningModal } from '../../components/IdleWarningModal';
import { FieldStaffProvider, useFieldStaff } from './FieldStaffContext';
import { ToastContainer } from '../../components/toast/ToastContainer';
import { registerToastNotificationOpener } from '../../components/toast/toast';
import { FieldClockInPrompt } from '../components/FieldClockInPrompt';
import { initPushNotifications } from '../../lib/pushNotifications';
import { useAppLogo } from '../../lib/media';
import { BrandLogo } from '../../components/BrandLogo';
import { FIELD_OPS_CHANNEL, usePresence } from '../../lib/presence';
import { transformedMediaUrl } from '../../lib/storageUrls';
import { DashboardScreen } from './screens/DashboardScreen';
import { JobsScreen } from './screens/JobsScreen';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { InboxScreen } from './screens/InboxScreen';
import { PerformanceScreen } from './screens/PerformanceScreen';
import { IncidentReportScreen } from './screens/IncidentReportScreen';
import { DispatchOffersScreen } from './screens/DispatchOffersScreen';

type Tab = 'dashboard' | 'offers' | 'jobs' | 'attendance' | 'inbox' | 'performance';

function FieldStaffContent() {
  const { employee, signOut, hasCapability } = useAuth();
  const { url: logoUrl } = useAppLogo();
  const { loading, error, online, pendingSync, refresh, assignments } = useFieldStaff();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const activeJob = assignments.find((a) => ['accepted', 'in_progress', 'paused'].includes(a.status));
  const livePeers = usePresence({
    channel: FIELD_OPS_CHANNEL,
    key: employee ? `field:${employee.id}` : null,
    meta: employee ? {
      employeeId: employee.id,
      name: employee.full_name,
      role: 'field',
      photoUrl: employee.photo_url,
      jobId: activeJob?.id || null,
      onlineAt: new Date().toISOString(),
    } : null,
    track: online,
  });
  const liveCount = livePeers.filter((p) => p.role === 'field').length;

  useEffect(() => {
    return registerToastNotificationOpener(() => setTab('inbox'));
  }, []);

  useEffect(() => {
    if (employee) {
      initPushNotifications('field').catch(() => {});
    }
  }, [employee]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo src={logoUrl} alt="Alphatek Nexus" className="w-12 h-12" />
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  let body: ReactNode;
  if (selectedJobId) {
    body = (
      <JobDetailScreen
        assignmentId={selectedJobId}
        onBack={() => setSelectedJobId(null)}
      />
    );
  } else if (showIncident) {
    body = <IncidentReportScreen onBack={() => setShowIncident(false)} />;
  } else {
    const navItems: { key: Tab; label: string; icon: typeof Home }[] = [
      { key: 'dashboard',   label: 'Home',       icon: Home },
      ...(hasCapability('field.jobs') ? [
        { key: 'offers' as Tab, label: 'Offers', icon: Zap },
        { key: 'jobs' as Tab, label: 'Jobs', icon: ClipboardList },
      ] : []),
      ...(hasCapability('field.attendance') ? [{ key: 'attendance' as Tab, label: 'Attendance', icon: Clock }] : []),
      { key: 'inbox',       label: 'Inbox',       icon: Bell },
      { key: 'performance', label: 'Performance', icon: BarChart3 },
    ];

    body = (
    <div className="app-viewport bg-slate-50 overflow-hidden">

      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandLogo src={logoUrl} alt="Alphatek Nexus" className="w-9 h-9 rounded-xl p-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-tight truncate">Field Staff</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest inline-flex items-center gap-1.5">
              Alphatek Nexus
              {online && (
                <span className="inline-flex items-center gap-1 normal-case tracking-normal text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live{liveCount > 1 ? ` · ${liveCount}` : ''}
                </span>
              )}
            </p>
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
            <img src={transformedMediaUrl(employee.photo_url, 64)} alt="" className="w-8 h-8 rounded-full object-cover" />
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
      <main className="flex-1 overflow-y-auto min-h-0">
        {tab === 'dashboard'   && <DashboardScreen onOpenJob={(id) => setSelectedJobId(id)} onReportIncident={hasCapability('field.incidents') ? () => setShowIncident(true) : undefined} onViewStats={() => setTab('performance')} />}
        {tab === 'offers'      && <DispatchOffersScreen />}
        {tab === 'jobs'        && <JobsScreen onOpenJob={(id) => setSelectedJobId(id)} />}
        {tab === 'attendance'  && <AttendanceScreen />}
        {tab === 'inbox'       && <InboxScreen />}
        {tab === 'performance' && <PerformanceScreen />}
      </main>

      {/* Bottom nav — full width, safe-area padded, not clipped by 100vh */}
      <nav className="flex-shrink-0 w-full bg-white border-t border-slate-200 z-20 mobile-nav-pb">
        <div className="flex items-stretch justify-around h-14 px-1 w-full">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 px-0.5 rounded-lg transition-colors ${
                  active ? 'text-emerald-600' : 'text-slate-600'
                }`}
              >
                <Icon className="w-6 h-6 shrink-0 overflow-visible" strokeWidth={active ? 2.5 : 2} />
                <span className={`text-[10px] leading-none truncate w-full text-center ${active ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
    );
  }

  return (
    <>
      {body}
      <ToastContainer position="top-center" />
      <FieldClockInPrompt />
    </>
  );
}

function FieldIdleWarning() {
  const { idleWarningVisible, idleWarningSecondsLeft, dismissIdleWarning, signOut } = useAuth();
  return (
    <IdleWarningModal
      visible={idleWarningVisible}
      secondsLeft={idleWarningSecondsLeft}
      onStaySignedIn={dismissIdleWarning}
      onSignOut={signOut}
    />
  );
}

function FieldAccessDenied({ message }: { message: string }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <button
          onClick={() => { void signOut(); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function FieldStaffAuthGate({ children }: { children: ReactNode }) {
  const { user, employee, appAccess, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) return <LoginPage portal="field" />;

  if (employee?.must_change_password) return <ChangePasswordPage />;

  if (!employee) {
    return <FieldAccessDenied message="This account is not registered as staff. Sign out and use a field staff Employee ID." />;
  }

  if (appAccess?.app_type !== 'field' || !appAccess.is_active) {
    return <FieldAccessDenied message="Your account does not have access to the field staff app." />;
  }

  return (
    <>
      {children}
      <FieldIdleWarning />
    </>
  );
}

export function FieldStaffApp() {
  return (
    <FieldStaffAuthGate>
      <FieldStaffProvider>
        <FieldStaffContent />
      </FieldStaffProvider>
    </FieldStaffAuthGate>
  );
}
