import { useState } from 'react';
import {
  LayoutDashboard, CalendarDays, Users, Building2, Settings,
  LogOut, Menu, X, ChevronRight, ChevronDown,
  BarChart3, Truck, Brush, ShieldCheck, Package, ArrowLeft, Recycle, FolderOpen,
  Briefcase, CreditCard, UserCog, History, Contact, Database,
  Receipt as ReceiptIcon, Star, Gift, Landmark,
  Navigation, ClipboardCheck, MessageSquare,
  AlertTriangle, CheckSquare,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAdminNotifications } from './contexts/AdminNotificationsContext';
import { AdminNotificationsBell } from '../components/AdminNotificationsBell';

interface AdminSidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface NavItem {
  label: string;
  page: string;
  icon: typeof Users;
}

interface NavSection {
  title: string;
  items: NavItem[];
  subcategories?: { label: string; items: NavItem[] }[];
}

const navSections: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Dashboard', page: 'overview', icon: LayoutDashboard },
      { label: 'Analytics', page: 'analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'DIVISIONS',
    items: [
      { label: 'All Divisions', page: 'divisions', icon: Building2 },
      { label: 'Clearing & Forwarding', page: 'division-cf', icon: Truck },
      { label: 'Smart Sort / Recycling', page: 'division-smart-sort', icon: Recycle },
      { label: 'Cleaning Services', page: 'division-cleaning', icon: Brush },
      { label: 'Private Security', page: 'division-security', icon: ShieldCheck },
      { label: 'Procurement', page: 'division-procurement', icon: Package },
    ],
  },
  {
    title: 'CLIENT PORTAL',
    items: [
      { label: 'Booking Review', page: 'booking-review', icon: ClipboardCheck },
      { label: 'All Bookings', page: 'bookings', icon: CalendarDays },
      { label: 'Messages', page: 'messages', icon: MessageSquare },
      { label: 'Documents', page: 'documents', icon: FolderOpen },
      { label: 'Clients', page: 'clients', icon: Users },
      { label: 'User Management', page: 'users', icon: UserCog },
      { label: 'Reviews', page: 'reviews', icon: Star },
      { label: 'Bundles', page: 'bundles', icon: Package },
      { label: 'Referrals', page: 'referrals', icon: Gift },
    ],
  },
  {
    title: 'FIELD OPERATIONS',
    items: [
      { label: 'Field Dispatch', page: 'field-dispatch', icon: Navigation },
      { label: 'Job Review', page: 'field-job-review', icon: CheckSquare },
      { label: 'Incidents', page: 'field-incidents', icon: AlertTriangle },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Finance Module', page: 'finance', icon: Landmark },
      { label: 'Data Backup', page: 'backup', icon: Database },
      { label: 'Settings', page: 'settings', icon: Settings },
    ],
  },
  {
    title: 'HUMAN RESOURCES',
    items: [
      { label: 'HR Dashboard', page: 'hr-dashboard', icon: UserCog },
    ],
    subcategories: [
      {
        label: 'Employee Management',
        items: [
          { label: 'Employees', page: 'hr-employees', icon: Users },
          { label: 'Roles', page: 'hr-roles', icon: Briefcase },
        ],
      },
      {
        label: 'Identity & Access',
        items: [
          { label: 'ID Cards', page: 'hr-id-cards', icon: CreditCard },
          { label: 'Activity Logs', page: 'hr-activity', icon: History },
          { label: 'Permissions', page: 'hr-permissions', icon: ShieldCheck },
        ],
      },
      {
        label: 'Directory',
        items: [
          { label: 'Staff Directory', page: 'hr-directory', icon: Contact },
        ],
      },
    ],
  },
];

function findPageLabel(page: string): string {
  for (const section of navSections) {
    const item = section.items.find((i) => i.page === page);
    if (item) return item.label;
    if (section.subcategories) {
      for (const sub of section.subcategories) {
        const subItem = sub.items.find((i) => i.page === page);
        if (subItem) return subItem.label;
      }
    }
  }
  return 'Dashboard';
}

function isHrPage(page: string): boolean {
  return page.startsWith('hr-');
}

export function AdminSidebar({ currentPage, onNavigate }: AdminSidebarProps) {
  const { profile, signOut } = useAuth();
  const { unreadByType, unreadCount, unreadBySlug, markReadBySlug } = useAdminNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hrExpanded, setHrExpanded] = useState(true);

  const handleNav = (page: string) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const slugByPage: Record<string, string> = {
    'division-cf': 'clearing-forwarding',
    'division-smart-sort': 'waste-management',
    'division-cleaning': 'cleaning-janitorial',
    'division-security': 'private-security',
    'division-procurement': 'procurement',
  };

  const pageBadge: Record<string, number> = {
    overview: unreadCount,
    analytics: 0,
    divisions: 0,
    'division-cf': unreadBySlug['clearing-forwarding'] || 0,
    'division-smart-sort': unreadBySlug['waste-management'] || 0,
    'division-cleaning': unreadBySlug['cleaning-janitorial'] || 0,
    'division-security': unreadBySlug['private-security'] || 0,
    'division-procurement': unreadBySlug['procurement'] || 0,
    'booking-review': 0,
    bookings: (unreadByType['booking_update'] || 0) + (unreadByType['message'] || 0),
    messages: unreadByType['message'] || 0,
    documents: 0,
    clients: 0,
    finance: 0,
    reviews: 0,
    'field-dispatch': 0,
    'field-job-review': 0,
    'field-incidents': 0,
    bundles: 0,
    referrals: 0,
    settings: 0,
    backup: 0,
    'hr-dashboard': 0,
    'hr-employees': 0,
    'hr-roles': 0,
    'hr-id-cards': 0,
    'hr-activity': 0,
    'hr-permissions': 0,
    'hr-directory': 0,
  };

  const renderItem = (item: NavItem, sectionTitle: string) => {
    const Icon = item.icon;
    const active = currentPage === item.page;
    const badge = pageBadge[item.page] || 0;
    return (
      <button
        key={`${sectionTitle}-${item.label}`}
        onClick={() => {
          const slug = slugByPage[item.page];
          if (slug && badge > 0) markReadBySlug(slug);
          handleNav(item.page);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
          active
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`}
      >
        <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
        {item.label}
        {badge > 0 && (
          <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/30">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {active && badge === 0 && <ChevronRight className="w-3.5 h-3.5 ml-auto text-emerald-400/60" />}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <img src="/alphateknexus_logo_transparent.webp" alt="Alphatek Nexus" className="w-8 h-8 rounded-lg object-contain p-0.5" />
          <span className="font-bold text-white text-sm">Admin Panel</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Desktop Top Bar */}
      <header className="hidden lg:flex fixed top-0 right-0 left-72 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 items-center justify-between px-8">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Admin</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="font-semibold text-slate-800">{findPageLabel(currentPage)}</span>
        </div>
        <div className="flex items-center gap-3">
          <AdminNotificationsBell onNavigate={handleNav} />
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-700 font-semibold text-xs">
                {profile?.full_name?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <div className="text-sm leading-tight">
              <p className="font-medium text-slate-800">{profile?.full_name || 'Admin'}</p>
              <p className="text-xs text-slate-400">{profile?.email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-slate-900 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo Area */}
        <div className="h-16 lg:h-16 flex items-center justify-between px-6 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src="/alphateknexus_logo_transparent.webp" alt="Alphatek Nexus" className="w-9 h-9 rounded-lg object-contain p-0.5" />
            <div>
              <p className="font-bold text-white text-sm leading-tight">Alphatek Nexus</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav Sections */}
        <nav className="flex-1 py-5 px-4 space-y-6 overflow-y-auto">
          {navSections.map((section) => {
            // HR section with collapsible sub-categories
            if (section.subcategories) {
              const isAnyHrActive = isHrPage(currentPage);
              return (
                <div key={section.title}>
                  <button
                    onClick={() => setHrExpanded((v) => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                      isAnyHrActive
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <UserCog className={`w-4.5 h-4.5 flex-shrink-0 ${isAnyHrActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="flex-1 text-left">{section.title}</span>
                    {hrExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                  </button>

                  {hrExpanded && (
                    <div className="mt-1 space-y-3">
                      {/* Top-level items (HR Dashboard) */}
                      {section.items.map((item) => renderItem(item, section.title))}

                      {/* Sub-categories */}
                      {section.subcategories.map((sub) => (
                        <div key={sub.label} className="ml-3 pl-3 border-l border-slate-800">
                          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 mb-1.5">
                            {sub.label}
                          </p>
                          <div className="space-y-0.5">
                            {sub.items.map((item) => renderItem(item, `${section.title}-${sub.label}`))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Standard section
            return (
              <div key={section.title}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => renderItem(item, section.title))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex-shrink-0 space-y-2">
          <a
            href="/"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Portal
          </a>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
