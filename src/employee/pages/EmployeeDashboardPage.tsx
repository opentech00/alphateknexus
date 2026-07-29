import { useEffect, useState } from 'react';
import {
  Mail, Phone, MapPin, Calendar, AlertTriangle, User, Briefcase,
  Building2, BadgeCheck, CreditCard, LogOut, Loader2, Clock,
  LayoutDashboard, ChevronRight, Menu, X, KeyRound, Banknote, ClipboardList,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';
import { type IdCard, STATUS_META, fmtDate } from '../types';
import { CashCollectionsPage } from './CashCollectionsPage';
import { ActivitiesPage } from './ActivitiesPage';

type Page = 'overview' | 'division' | 'role' | 'id-card' | 'profile' | 'cash-collections' | 'activities';

export function EmployeeDashboardPage() {
  const { employee, user, signOut } = useAuth();
  const [idCard, setIdCard] = useState<IdCard | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [page, setPage] = useState<Page>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  if (!employee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">No Employee Record Found</h2>
          <p className="text-sm text-slate-500 mb-5">
            Your account is not linked to an employee record. Please contact your administrator.
          </p>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  const sm = STATUS_META[employee.status] ?? STATUS_META.active;
  const cardStatus = idCard ? STATUS_META[idCard.status] ?? STATUS_META.active : null;

  const navItems: { key: Page; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'activities', label: 'My Activities', icon: ClipboardList },
    { key: 'division', label: 'My Division', icon: Building2 },
    { key: 'role', label: 'My Role', icon: Briefcase },
    { key: 'id-card', label: 'ID Card', icon: CreditCard },
    { key: 'cash-collections', label: 'Cash Collections', icon: Banknote },
    { key: 'profile', label: 'Profile', icon: User },
  ];

  const handleNav = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-slate-900 text-sm">Employee Portal</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 z-40 h-full w-64 bg-slate-900 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 flex-shrink-0">
          <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Alphatek Nexus</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Employee Portal</p>
          </div>
        </div>

        {/* Employee info */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {employee.photo_url ? (
              <img src={employee.photo_url} alt={employee.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-white">{employee.full_name[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{employee.full_name}</p>
              <p className="text-xs text-slate-400 truncate">{employee.employee_number}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium ${sm.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                {sm.label}
              </span>
            </div>
            {employee.services && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Building2 className="w-3 h-3" /> {employee.services.name}
              </p>
            )}
            {employee.hr_roles && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Briefcase className="w-3 h-3" /> {employee.hr_roles.name}
              </p>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                {item.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-emerald-400/60" />}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 flex-shrink-0">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64 pt-14 lg:pt-0">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {page === 'overview' && <OverviewPage employee={employee} idCard={idCard} cardLoading={cardLoading} cardStatus={cardStatus} sm={sm} onNavigate={handleNav} />}
          {page === 'activities' && <ActivitiesPage onNavigate={(k) => handleNav(k as Page)} />}
          {page === 'division' && <DivisionPage employee={employee} />}
          {page === 'role' && <RolePage employee={employee} />}
          {page === 'id-card' && <IdCardPage employee={employee} idCard={idCard} loading={cardLoading} cardStatus={cardStatus} />}
          {page === 'cash-collections' && <CashCollectionsPage onBack={() => setPage('overview')} />}
          {page === 'profile' && <ProfilePage employee={employee} />}
        </main>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────

function OverviewPage({ employee, idCard, cardLoading, cardStatus, sm, onNavigate }: {
  employee: any;
  idCard: IdCard | null;
  cardLoading: boolean;
  cardStatus: any;
  sm: any;
  onNavigate: (p: Page) => void;
}) {
  const tiles = [
    { page: 'division' as Page, label: 'My Division', value: employee.services?.name || 'Unassigned', icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { page: 'role' as Page, label: 'My Role', value: employee.hr_roles?.name || 'Unassigned', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50' },
    { page: 'activities' as Page, label: 'My Activities', value: 'View tasks', icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50' },
    { page: 'id-card' as Page, label: 'ID Card', value: idCard?.card_number || 'Not issued', icon: CreditCard, color: 'text-amber-600', bg: 'bg-amber-50' },
    { page: 'profile' as Page, label: 'Profile', value: 'View details', icon: User, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 sm:p-7 text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          {employee.photo_url ? (
            <img src={employee.photo_url} alt={employee.full_name} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20" />
          ) : (
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border-2 border-white/20">
              <span className="text-2xl font-bold text-white">{employee.full_name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div>
            <p className="text-sm text-slate-400">Welcome back,</p>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{employee.full_name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded-md">{employee.employee_number}</span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${sm.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                {sm.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.label}
              onClick={() => onNavigate(tile.page)}
              className="group bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all text-left"
            >
              <div className={`w-10 h-10 ${tile.bg} rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                <Icon className={`w-5 h-5 ${tile.color}`} />
              </div>
              <p className="text-xs text-slate-400 mb-0.5">{tile.label}</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{tile.value}</p>
            </button>
          );
        })}
      </div>

      {/* Mini ID card preview */}
      {!cardLoading && idCard && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-900">Your ID Card</h2>
          </div>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl" />
            <div className="relative flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-slate-400">Alphatek Nexus</p>
                <p className="text-sm font-semibold">Employee ID</p>
              </div>
              <BadgeCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="relative flex items-center gap-4">
              {employee.photo_url ? (
                <img src={employee.photo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/20" />
              ) : (
                <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                  <span className="text-xl font-bold">{employee.full_name[0]?.toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{employee.full_name}</p>
                <p className="text-xs text-slate-400">{employee.position || employee.hr_roles?.name || 'Staff'}</p>
                <p className="text-xs font-mono text-emerald-400 mt-1">{idCard.card_number}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Division ─────────────────────────────────────────────────────────────

function DivisionPage({ employee }: { employee: any }) {
  return (
    <div className="space-y-5">
      <PageTitle icon={Building2} title="My Division" subtitle="Your designated division within Alphatek Nexus" />
      {employee.services ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{employee.services.name}</h3>
              {employee.services.description && (
                <p className="text-sm text-slate-500 mt-1">{employee.services.description}</p>
              )}
              <span className="inline-block mt-2 text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                {employee.services.slug}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState icon={Building2} title="No division assigned" description="Please contact your administrator to be assigned to a division." />
      )}
    </div>
  );
}

// ── Role ─────────────────────────────────────────────────────────────────

function RolePage({ employee }: { employee: any }) {
  const role = employee.hr_roles;
  const division = employee.services;
  const hasRole = !!role;
  const hasDivision = !!division;

  return (
    <div className="space-y-5">
      <PageTitle icon={Briefcase} title="My Role" subtitle="Your role and position within the company" />

      {/* Division context banner */}
      {hasDivision ? (
        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 rounded-2xl border border-emerald-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <Building2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Division</p>
            <p className="font-bold text-slate-900">{division.name}</p>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700">No division assigned. Contact your administrator.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Role card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <Briefcase className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-xs text-slate-400 mb-1">Role</p>
          {hasRole ? (
            <>
              <p className="font-semibold text-slate-900">{role.name}</p>
              {role.description && <p className="text-xs text-slate-500 mt-1.5">{role.description}</p>}
              {role.is_default && (
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Default role for {division?.name || 'division'}
                </span>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-400">Unassigned</p>
              <p className="text-xs text-slate-400 mt-1.5">No role assigned yet.</p>
            </>
          )}
        </div>

        {/* Position card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-3">
            <KeyRound className="w-5 h-5 text-slate-600" />
          </div>
          <p className="text-xs text-slate-400 mb-1">Position</p>
          <p className="font-semibold text-slate-900">{employee.position || '—'}</p>
          {hasRole && role.display_order != null && (
            <p className="text-xs text-slate-400 mt-1.5">Level #{role.display_order} in {division?.name || 'division'}</p>
          )}
        </div>
      </div>

      {/* Unassigned state */}
      {!hasRole && hasDivision && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <Briefcase className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-700">Your administrator will assign you a role within the {division.name} division.</p>
        </div>
      )}
    </div>
  );
}

// ── ID Card ──────────────────────────────────────────────────────────────

function IdCardPage({ employee, idCard, loading, cardStatus }: {
  employee: any;
  idCard: IdCard | null;
  loading: boolean;
  cardStatus: any;
}) {
  return (
    <div className="space-y-5">
      <PageTitle icon={CreditCard} title="ID Card" subtitle="Your digital employee identification card" />
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : idCard ? (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white relative overflow-hidden shadow-lg">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl" />
            <div className="relative flex items-start justify-between mb-5">
              <div>
                <p className="text-xs text-slate-400">Alphatek Nexus</p>
                <p className="text-sm font-semibold">Employee ID</p>
              </div>
              <BadgeCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div className="relative flex items-center gap-4">
              {employee.photo_url ? (
                <img src={employee.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border border-white/20" />
              ) : (
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
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
          </div>
          {cardStatus && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-4">
              <span className="text-sm text-slate-500">Card Status</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cardStatus.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cardStatus.dot}`} />
                {cardStatus.label}
              </span>
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={CreditCard} title="No ID card issued" description="Your ID card has not been issued yet. Please contact your administrator." />
      )}
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────

function ProfilePage({ employee }: { employee: any }) {
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
    <div className="space-y-5">
      <PageTitle icon={User} title="Profile" subtitle="Your personal and employment information" />
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
          {employee.photo_url ? (
            <img src={employee.photo_url} alt={employee.full_name} className="w-16 h-16 rounded-2xl object-cover" />
          ) : (
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-bold text-emerald-700">{employee.full_name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div>
            <h3 className="font-bold text-slate-900">{employee.full_name}</h3>
            <p className="text-sm text-slate-400">{employee.employee_number}</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-xs text-slate-400">{f.label}</dt>
                  <dd className="text-sm text-slate-700 break-words">{f.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────

function PageTitle({ icon: Icon, title, subtitle }: { icon: typeof User; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof User; title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
