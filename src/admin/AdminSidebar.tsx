import { useEffect, useState } from 'react';
import {
  LayoutDashboard, CalendarDays, Users, Building2, Settings,
  LogOut, Menu, X, ChevronRight, ChevronDown,
  BarChart3, Truck, Brush, ShieldCheck, Package, ArrowLeft, Recycle, FolderOpen,
  Briefcase, CreditCard, UserCog, History, Contact, Database, Banknote,
  FileSpreadsheet, Receipt as ReceiptIcon, Star, Gift, Landmark, Wallet,
  Navigation, ClipboardCheck, MessageSquare,
  AlertTriangle, CheckSquare, Bell, GitBranch, Image as ImageIcon, Megaphone,
  Mail, Copy, Check, LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAdminNotifications } from './contexts/AdminNotificationsContext';
import { useAdminOperations } from './contexts/AdminOperationsContext';
import { AdminNotificationsBell } from '../components/AdminNotificationsBell';
import { ThemeToggle } from '../components/ThemeToggle';
import { toast } from '../components/toast/toast';
import { useAppLogo } from '../lib/media';

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
      { label: 'Support', page: 'support', icon: LifeBuoy },
      { label: 'Documents', page: 'documents', icon: FolderOpen },
      { label: 'Clients', page: 'clients', icon: Users },
      { label: 'User Management', page: 'users', icon: UserCog },
      { label: 'Reviews', page: 'reviews', icon: Star },
      { label: 'Bundles', page: 'bundles', icon: Package },
      { label: 'Campaigns', page: 'campaigns', icon: Megaphone },
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
    title: 'ADMIN & FINANCE',
    items: [
      { label: 'Department Workspace', page: 'admin-finance', icon: Landmark },
      { label: 'Finance Module', page: 'finance', icon: Landmark },
      { label: 'Wallet & Payments', page: 'wallet', icon: Wallet },
      { label: 'Receipts', page: 'receipts', icon: ReceiptIcon },
      { label: 'All Service Ledgers', page: 'finance-services', icon: Banknote },
    ],
    subcategories: [
      {
        label: 'Service ledgers',
        items: [
          { label: 'Clearing & Forwarding', page: 'finance-cf', icon: Truck },
          { label: 'Smart Sort / Recycling', page: 'finance-smart-sort', icon: Recycle },
          { label: 'Cleaning Services', page: 'finance-cleaning', icon: Brush },
          { label: 'Private Security', page: 'finance-security', icon: ShieldCheck },
          { label: 'Procurement', page: 'finance-procurement', icon: Package },
        ],
      },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Task Delegation', page: 'task-delegation', icon: GitBranch },
      { label: 'Media Library', page: 'media-library', icon: ImageIcon },
      { label: 'Data Backup', page: 'backup', icon: Database },
      { label: 'Admin Sessions', page: 'admin-sessions', icon: ShieldCheck },
      { label: 'Settings', page: 'settings', icon: Settings },
      { label: 'Notification Log', page: 'notification-log', icon: Bell },
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
          { label: 'Payslips', page: 'hr-payslips', icon: FileSpreadsheet },
          { label: 'Documents', page: 'hr-documents', icon: FolderOpen },
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
  const { profile, signOut, hasAdminPermission, isSuperAdmin } = useAuth();
  const { unreadByType, unreadCount, unreadBySlug, markReadBySlug } = useAdminNotifications();
  const { newJobCount, jobReviewCount, newTaskCount } = useAdminOperations();
  const { url: logoUrl } = useAppLogo();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hrExpanded, setHrExpanded] = useState(true);

  const canSee = (page: string) => isSuperAdmin || hasAdminPermission(page);

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
    support: unreadByType['support'] || 0,
    documents: 0,
    clients: 0,
    finance: 0,
    wallet: 0,
    receipts: 0,
    'admin-finance': 0,
    'finance-services': 0,
    'finance-cf': 0,
    'finance-smart-sort': 0,
    'finance-cleaning': 0,
    'finance-security': 0,
    'finance-procurement': 0,
    reviews: 0,
    'field-dispatch': newJobCount,
    'field-job-review': jobReviewCount,
    'field-incidents': 0,
    bundles: 0,
    campaigns: 0,
    referrals: 0,
    settings: 0,
    'notification-log': 0,
    'task-delegation': newTaskCount,
    'media-library': 0,
    backup: 0,
    'hr-dashboard': 0,
    'hr-employees': 0,
    'hr-roles': 0,
    'hr-id-cards': 0,
    'hr-activity': 0,
    'hr-permissions': 0,
    'hr-documents': 0,
    'hr-payslips': 0,
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
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 h-16 flex items-center px-2 gap-1">
        <div className="flex items-center gap-2.5 min-w-0 pl-2">
          <img src={logoUrl} alt="Alphatek Nexus" className="w-8 h-8 rounded-lg object-contain p-0.5" />
          <span className="font-bold text-white text-sm truncate">Admin Panel</span>
        </div>
        <div className="flex items-center gap-0.5 ml-auto">
          <ThemeToggle tone="dark" menuId="admin-theme-menu-mobile" />
          <AdminNotificationsBell tone="dark" onNavigate={handleNav} />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Desktop Top Bar */}
      <header className="hidden lg:flex fixed top-0 right-0 left-72 z-30 h-16 bg-white dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 items-center justify-between px-8">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400">Admin</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="font-semibold text-slate-800 truncate">{findPageLabel(currentPage)}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ThemeToggle menuId="admin-theme-menu" />
          <AdminNotificationsBell tone="light" onNavigate={handleNav} />
          <div className="h-8 w-px bg-slate-200 mx-1" />
          <AdminProfileChip
            name={profile?.full_name || 'Admin'}
            email={profile?.email || ''}
            roleLabel={isSuperAdmin ? 'Super admin' : 'Admin'}
            avatarUrl={profile?.avatar_url || null}
          />
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
            <img src={logoUrl} alt="Alphatek Nexus" className="w-9 h-9 rounded-lg object-contain p-0.5" />
            <div>
              <p className="font-bold text-white text-sm leading-tight">Alphatek Nexus</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav Sections */}
        <nav className="flex-1 py-5 px-4 space-y-6 overflow-y-auto">
          {navSections.map((section) => {
            // Filter items by permission
            const filteredItems = section.items.filter((item) => canSee(item.page));
            const filteredSubs = section.subcategories?.map((sub) => ({
              ...sub,
              items: sub.items.filter((item) => canSee(item.page)),
            })).filter((sub) => sub.items.length > 0);
            const hasContent = filteredItems.length > 0 || (filteredSubs && filteredSubs.length > 0);
            if (!hasContent) return null;

            // HR section with collapsible sub-categories
            if (section.title === 'HUMAN RESOURCES' && section.subcategories) {
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
                      {filteredItems.map((item) => renderItem(item, section.title))}

                      {/* Sub-categories */}
                      {filteredSubs?.map((sub) => (
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

            // Standard section (optionally with grouped sub-items)
            return (
              <div key={section.title}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {filteredItems.map((item) => renderItem(item, section.title))}
                </div>
                {filteredSubs?.map((sub) => (
                  <div key={sub.label} className="mt-3 ml-1 pl-3 border-l border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 mb-1.5">
                      {sub.label}
                    </p>
                    <div className="space-y-0.5">
                      {sub.items.map((item) => renderItem(item, `${section.title}-${sub.label}`))}
                    </div>
                  </div>
                ))}
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

function AdminProfileChip({
  name,
  email,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  email: string;
  roleLabel: string;
  avatarUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const initial = name[0]?.toUpperCase() || 'A';

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success('Email copied');
    } catch {
      toast.error('Could not copy email');
    }
  };

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-100 flex-shrink-0"
        />
      ) : (
        <div
          className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-sm font-bold ring-2 ring-emerald-100 shadow-sm flex-shrink-0"
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[10rem]">{name}</p>
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-100">
            {roleLabel}
          </span>
        </div>
        {email ? (
          <button
            type="button"
            onClick={copyEmail}
            title={`${email} — click to copy`}
            aria-label={`Copy email ${email}`}
            className="mt-0.5 group flex items-center gap-1 max-w-[15rem] rounded-full bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 px-2 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <Mail className="w-3 h-3 text-slate-400 group-hover:text-emerald-600 flex-shrink-0" aria-hidden="true" />
            <span className="text-[11px] text-slate-600 group-hover:text-emerald-700 truncate font-medium">
              {email}
            </span>
            {copied ? (
              <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" aria-hidden="true" />
            ) : (
              <Copy className="w-3 h-3 text-slate-300 group-hover:text-emerald-500 flex-shrink-0" aria-hidden="true" />
            )}
          </button>
        ) : (
          <p className="text-[11px] text-slate-400">No email on file</p>
        )}
      </div>
    </div>
  );
}
