import { useEffect, useRef, useState } from 'react';
import {
  Mail, Phone, MapPin, Calendar, AlertTriangle, User, Briefcase,
  Building2, BadgeCheck, CreditCard, LogOut, Loader2, Clock, Bell,
  ChevronRight, Menu, X, KeyRound, Banknote, ClipboardList,
  GitBranch, Shield, Inbox, CalendarDays, FolderOpen, Sun,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';
import { type Employee, type IdCard, STATUS_META, fmtDate } from '../types';
import { CashCollectionsPage } from './CashCollectionsPage';
import { ActivitiesPage } from './ActivitiesPage';
import {
  DocumentsPage,
  ReportPage,
  PerformancePage,
} from './ActivityPages';
import { DelegatedTasksPage } from './DelegatedTasksPage';
import { DivisionWorkspacePage } from './DivisionWorkspacePage';
import { EmployeeNotificationsBell } from '../components/EmployeeNotificationsBell';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAppLogo } from '../../lib/media';
import { EmployeeNotificationsPage } from './EmployeeNotificationsPage';
import { WorkInboxPage } from './WorkQueuePage';
import { LeaveAttendancePage } from './LeaveAttendancePage';
import { HrFilesPage } from './HrFilesPage';
import { MyDayPage } from './MyDayPage';
import { EmployeeScorecard } from '../components/EmployeeScorecard';
import { isInternalDepartmentSlug } from '../../lib/capabilities';
import {
  destinationForActivityKey,
  destinationForNotification,
  PAGE_LABELS,
  type EmployeePage,
  type NavTarget,
  type WorkInboxTab,
} from '../lib/workNav';
import { registerToastNotificationOpener } from '../../components/toast/toast';

type NavItem = { key: EmployeePage; label: string; icon: typeof Sun };

export function EmployeeDashboardPage() {
  const { employee, signOut, hasCapability, isDivisionHead } = useAuth();
  const { url: logoUrl } = useAppLogo();
  const [idCard, setIdCard] = useState<IdCard | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [page, setPage] = useState<EmployeePage>('my-day');
  const [inboxTab, setInboxTab] = useState<WorkInboxTab>('mine');
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const skipFirstFocus = useRef(true);

  useEffect(() => {
    if (!employee) return;
    (async () => {
      setCardLoading(true);
      const { data } = await supabase
        .from('id_cards')
        .select('id, card_number, qr_payload, issue_date, expiry_date, status')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setIdCard(data as IdCard | null);
      setCardLoading(false);
    })();
  }, [employee]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const handleNavigate = (target: NavTarget | EmployeePage) => {
    const dest: NavTarget = typeof target === 'string' ? { page: target } : target;
    setPage(dest.page);
    setInboxTab(dest.inboxTab ?? (dest.page === 'work-inbox' ? 'mine' : inboxTab));
    setFocusBookingId(dest.bookingId ?? null);
    setSidebarOpen(false);
    skipFirstFocus.current = false;
  };
  const navRef = useRef(handleNavigate);
  navRef.current = handleNavigate;

  useEffect(() => {
    return registerToastNotificationOpener((n) => {
      navRef.current(destinationForNotification(n));
    });
  }, []);

  useEffect(() => {
    if (skipFirstFocus.current) return;
    mainRef.current?.focus();
  }, [page]);

  if (!employee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-600" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">No Employee Record Found</h2>
          <p className="text-sm text-slate-500 mb-5">
            Your account is not linked to an employee record. Please contact your administrator.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  const sm = STATUS_META[employee.status] ?? STATUS_META.active;
  const cardStatus = idCard ? STATUS_META[idCard.status] ?? STATUS_META.active : null;
  const isInternalDept = isInternalDepartmentSlug(employee.services?.slug);

  const workItems: NavItem[] = [
    { key: 'my-day', label: 'My Day', icon: Sun },
    { key: 'work-inbox', label: isInternalDept ? 'Department inbox' : 'Work inbox', icon: Inbox },
    ...(isDivisionHead || hasCapability('div.manage_staff_access')
      ? [{ key: 'division-workspace' as EmployeePage, label: 'Division workspace', icon: Shield }]
      : []),
    { key: 'activities', label: 'More work', icon: ClipboardList },
    { key: 'delegated-tasks', label: 'Delegated tasks', icon: GitBranch },
    ...(hasCapability('div.cash_collections')
      ? [{ key: 'cash-collections' as EmployeePage, label: 'Cash collections', icon: Banknote }]
      : []),
  ];

  const meItems: NavItem[] = [
    { key: 'leave', label: 'Leave & attendance', icon: CalendarDays },
    { key: 'hr-files', label: 'Payslips & HR', icon: FolderOpen },
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const wideMain = page === 'division-workspace';

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#employee-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[80] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-emerald-600 focus:text-white focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {PAGE_LABELS[page]}
      </div>

      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center px-3 gap-1">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-expanded={sidebarOpen}
          aria-controls="employee-sidebar"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {sidebarOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logoUrl} alt="Alphatek Nexus" className="w-8 h-8 rounded-lg object-contain p-0.5 flex-shrink-0" />
          <span className="font-bold text-slate-900 text-sm truncate">Employee Portal</span>
        </div>
        <div className="flex items-center gap-0.5 ml-auto">
          <ThemeToggle />
          <EmployeeNotificationsBell onNavigate={handleNavigate} />
        </div>
      </header>

      {sidebarOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        id="employee-sidebar"
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-slate-900 flex flex-col transition-transform duration-300 motion-reduce:transition-none lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Employee portal"
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 flex-shrink-0">
          <img src={logoUrl} alt="Alphatek Nexus" className="w-9 h-9 rounded-lg object-contain p-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm leading-tight">Alphatek Nexus</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Employee Portal</p>
          </div>
        </div>

        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {employee.photo_url ? (
              <img src={employee.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <span className="text-sm font-semibold text-white">{employee.full_name[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{employee.full_name}</p>
              <p className="text-xs text-slate-400 truncate">{employee.employee_number}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${sm.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} aria-hidden="true" />
              {sm.label}
            </span>
            {employee.services && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Building2 className="w-3 h-3" aria-hidden="true" /> {employee.services.name}
              </p>
            )}
            {employee.hr_roles && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Briefcase className="w-3 h-3" aria-hidden="true" /> {employee.hr_roles.name}
              </p>
            )}
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          <NavGroup title="Work" items={workItems} page={page} onNavigate={handleNavigate} />
          <NavGroup title="Me" items={meItems} page={page} onNavigate={handleNavigate} />
        </nav>

        <div className="p-3 border-t border-slate-800 flex-shrink-0">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="lg:ml-64 pt-14 lg:pt-0">
        <div className="hidden lg:flex sticky top-0 z-20 h-14 items-center justify-end gap-1 px-4 sm:px-6 bg-white border-b border-slate-200">
          <ThemeToggle />
          <EmployeeNotificationsBell onNavigate={handleNavigate} />
        </div>
        <main
          id="employee-main"
          ref={mainRef}
          tabIndex={-1}
          className={`${wideMain ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-4 sm:px-6 py-6 space-y-6 outline-none`}
        >
          {page === 'my-day' && <MyDayPage onNavigate={handleNavigate} />}
          {page === 'work-inbox' && (
            <WorkInboxPage
              initialTab={inboxTab}
              focusBookingId={focusBookingId}
              onOpenCash={() => handleNavigate('cash-collections')}
              onOpenTasks={() => handleNavigate('delegated-tasks')}
            />
          )}
          {page === 'leave' && <LeaveAttendancePage />}
          {page === 'hr-files' && <HrFilesPage />}
          {page === 'division-workspace' && <DivisionWorkspacePage />}
          {page === 'activities' && (
            <ActivitiesPage onNavigate={(k) => handleNavigate(destinationForActivityKey(k))} />
          )}
          {page === 'cash-collections' && hasCapability('div.cash_collections') && (
            <CashCollectionsPage onBack={() => handleNavigate('work-inbox')} />
          )}
          {page === 'profile' && (
            <ProfilePage
              employee={employee}
              idCard={idCard}
              cardLoading={cardLoading}
              cardStatus={cardStatus}
            />
          )}
          {page === 'documents' && (isInternalDept || hasCapability('div.manage_documents')) && (
            <DocumentsPage employee={employee} />
          )}
          {page === 'report' && (isInternalDept || hasCapability('div.reports')) && (
            <ReportPage employee={employee} onBack={() => handleNavigate('activities')} />
          )}
          {page === 'performance' && (isInternalDept || hasCapability('div.reports')) && (
            <PerformancePage employee={employee} />
          )}
          {page === 'delegated-tasks' && <DelegatedTasksPage onBack={() => handleNavigate('my-day')} />}
          {page === 'notifications' && <EmployeeNotificationsPage onNavigate={handleNavigate} />}
        </main>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  page,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  page: EmployeePage;
  onNavigate: (target: NavTarget) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">{title}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = page === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate({ page: item.key })}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} aria-hidden="true" />
              {item.label}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-emerald-400/60" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfilePage({
  employee, idCard, cardLoading, cardStatus,
}: {
  employee: Employee;
  idCard: IdCard | null;
  cardLoading: boolean;
  cardStatus: { label: string; cls: string; dot: string } | null;
}) {
  const fields = [
    { icon: User, label: 'Full Name', value: employee.full_name },
    { icon: Mail, label: 'Email', value: employee.email },
    { icon: Phone, label: 'Phone', value: employee.phone || '—' },
    { icon: Calendar, label: 'Date of Birth', value: fmtDate(employee.date_of_birth) },
    { icon: MapPin, label: 'Address', value: employee.address || '—' },
    { icon: AlertTriangle, label: 'Emergency Contact', value: employee.emergency_contact || '—' },
    { icon: Clock, label: 'Hire Date', value: fmtDate(employee.hire_date) },
    { icon: Briefcase, label: 'Position', value: employee.position || '—' },
  ];

  return (
    <div className="space-y-5 emp-fade-in">
      <PageTitle icon={User} title="Profile" subtitle="Your work, role, and personal details" />
      <EmployeeScorecard />

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm" aria-labelledby="profile-details-heading">
        <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
          {employee.photo_url ? (
            <img src={employee.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover" />
          ) : (
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center" aria-hidden="true">
              <span className="text-2xl font-bold text-emerald-700">{employee.full_name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div>
            <h2 id="profile-details-heading" className="font-bold text-slate-900">{employee.full_name}</h2>
            <p className="text-sm text-slate-400">{employee.employee_number}</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-slate-400">{f.label}</dt>
                  <dd className="text-sm text-slate-700 break-words">{f.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" aria-labelledby="profile-division-heading">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
            <Building2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          </div>
          <h2 id="profile-division-heading" className="text-xs text-slate-400 mb-1">Division</h2>
          {employee.services ? (
            <>
              <p className="font-semibold text-slate-900">{employee.services.name}</p>
              {employee.services.description && <p className="text-xs text-slate-500 mt-1.5">{employee.services.description}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">No division assigned yet.</p>
          )}
        </section>
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" aria-labelledby="profile-role-heading">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <Briefcase className="w-5 h-5 text-blue-600" aria-hidden="true" />
          </div>
          <h2 id="profile-role-heading" className="text-xs text-slate-400 mb-1">Role</h2>
          {employee.hr_roles ? (
            <>
              <p className="font-semibold text-slate-900">{employee.hr_roles.name}</p>
              {employee.hr_roles.description && <p className="text-xs text-slate-500 mt-1.5">{employee.hr_roles.description}</p>}
              {employee.position && (
                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" aria-hidden="true" /> {employee.position}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">No role assigned yet.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="profile-id-heading">
        <h2 id="profile-id-heading" className="sr-only">ID card</h2>
        {cardLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-400" role="status">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading ID card</span>
          </div>
        ) : idCard ? (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white relative overflow-hidden shadow-lg">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />
            <div className="relative flex items-start justify-between mb-5">
              <div>
                <p className="text-xs text-slate-400">Alphatek Nexus</p>
                <p className="text-sm font-semibold">Employee ID</p>
              </div>
              <BadgeCheck className="w-7 h-7 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="relative flex items-center gap-4">
              {employee.photo_url ? (
                <img src={employee.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border border-white/20" />
              ) : (
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20" aria-hidden="true">
                  <span className="text-2xl font-bold">{employee.full_name[0]?.toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-lg truncate">{employee.full_name}</p>
                <p className="text-sm text-slate-400">{employee.position || employee.hr_roles?.name || 'Staff'}</p>
                <p className="text-xs font-mono text-emerald-400 mt-1.5">{idCard.card_number}</p>
              </div>
            </div>
            <div className="relative flex items-center justify-between mt-5 pt-4 border-t border-white/10 text-xs text-slate-400">
              <span>Issued: {fmtDate(idCard.issue_date)}</span>
              <span>Expires: {fmtDate(idCard.expiry_date)}</span>
            </div>
            {cardStatus && (
              <p className="relative mt-3 text-xs">
                Status: {cardStatus.label}
              </p>
            )}
          </div>
        ) : (
          <EmptyState icon={CreditCard} title="No ID card issued" description="Your ID card has not been issued yet. Please contact your administrator." />
        )}
      </section>
    </div>
  );
}

function PageTitle({ icon: Icon, title, subtitle }: { icon: typeof User; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-slate-600" aria-hidden="true" />
      </div>
      <div>
        <h1 id="employee-page-title" tabIndex={-1} className="text-lg font-bold text-slate-900 outline-none">{title}</h1>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof User; title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <Icon className="w-7 h-7 text-slate-400" aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
