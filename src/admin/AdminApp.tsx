import { useState, useEffect } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AdminNotificationsProvider } from './contexts/AdminNotificationsContext';
import { initPushNotifications } from '../lib/pushNotifications';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { TwoFactorPage } from '../pages/TwoFactorPage';
import { AdminSidebar } from './AdminSidebar';
import { OverviewPage } from './pages/OverviewPage';
import { BookingsManagementPage } from './pages/BookingsManagementPage';
import { ClientsPage } from './pages/ClientsPage';
import { DivisionsPage } from './pages/DivisionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationLogPage } from './pages/NotificationLogPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ClearingForwardingPage } from './pages/ClearingForwardingPage';
import { SmartSortPage } from './pages/SmartSortPage';
import { CleaningServicesPage } from './pages/CleaningServicesPage';
import { PrivateSecurityPage } from './pages/PrivateSecurityPage';
import { ProcurementPage } from './pages/ProcurementPage';
import { DocumentsManagementPage } from './pages/DocumentsManagementPage';
import { WalletManagementPage } from './pages/WalletManagementPage';
import { ReceiptsManagementPage } from './pages/ReceiptsManagementPage';
import { FinancePage } from './pages/FinancePage';
import { ReviewsManagementPage } from './pages/ReviewsManagementPage';
import { ReferralsManagementPage } from './pages/ReferralsManagementPage';
import { HrDashboardPage } from './pages/HrDashboardPage';
import { HrEmployeesPage } from './pages/HrEmployeesPage';
import { HrRolesPage } from './pages/HrRolesPage';
import { HrIdCardsPage } from './pages/HrIdCardsPage';
import { HrActivityPage } from './pages/HrActivityPage';
import { HrDirectoryPage } from './pages/HrDirectoryPage';
import { HrPermissionsPage } from './pages/HrPermissionsPage';
import { HrDocumentsPage } from './pages/HrDocumentsPage';
import { BackupPage } from './pages/BackupPage';
import { UsersManagementPage } from './pages/UsersManagementPage';
import { BundlesManagementPage } from './pages/BundlesManagementPage';
import { FieldDispatchPage } from './pages/FieldDispatchPage';
import { BookingReviewPage } from './pages/BookingReviewPage';
import { MessagesPage } from './pages/MessagesPage';
import { FieldJobReviewPage } from './pages/FieldJobReviewPage';
import { FieldIncidentsPage } from './pages/FieldIncidentsPage';
import { AdminSessionsPage } from './pages/AdminSessionsPage';
import { TaskDelegationPage } from './pages/TaskDelegationPage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';

function AdminContent() {
  const [currentPage, setCurrentPage] = useState('overview');
  const { user, isAdmin, loading, needs2FA, pending2FAEmail, pending2FAPassword, clear2FA, signOut, hasAdminPermission, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (user && isAdmin) {
      initPushNotifications('admin').catch(() => {});
    }
  }, [user, isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (needs2FA) {
    return (
      <TwoFactorPage
        email={pending2FAEmail}
        password={pending2FAPassword}
        onBack={() => clear2FA()}
        onSuccess={() => clear2FA()}
      />
    );
  }

  if (!user) {
    return <AdminLoginPage />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mb-4">
            <ShieldCheck className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 mb-6">Your account does not have admin privileges.</p>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const canSee = (page: string) => isSuperAdmin || hasAdminPermission(page);

  const renderPage = () => {
    if (!canSee(currentPage)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-50 rounded-full mb-4">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">No Access to This Page</h2>
          <p className="text-slate-500 max-w-sm">Your current role does not include permission for this page. Contact an administrator to request access.</p>
        </div>
      );
    }
    switch (currentPage) {
      case 'overview':
        return <OverviewPage />;
      case 'booking-review':
        return <BookingReviewPage />;
      case 'bookings':
        return <BookingsManagementPage />;
      case 'messages':
        return <MessagesPage />;
      case 'clients':
        return <ClientsPage />;
      case 'divisions':
        return <DivisionsPage onNavigate={setCurrentPage} />;
      case 'division-cf':
        return <ClearingForwardingPage />;
      case 'division-smart-sort':
        return <SmartSortPage />;
      case 'division-cleaning':
        return <CleaningServicesPage />;
      case 'division-security':
        return <PrivateSecurityPage />;
      case 'division-procurement':
        return <ProcurementPage />;
      case 'field-dispatch':
        return <FieldDispatchPage />;
      case 'field-job-review':
        return <FieldJobReviewPage />;
      case 'field-incidents':
        return <FieldIncidentsPage />;
      case 'documents':
        return <DocumentsManagementPage />;
      case 'finance':
        return <FinancePage />;
      case 'wallet':
        return <WalletManagementPage />;
      case 'receipts':
        return <ReceiptsManagementPage />;
      case 'reviews':
        return <ReviewsManagementPage />;
      case 'referrals':
        return <ReferralsManagementPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'hr-dashboard':
        return <HrDashboardPage onNavigate={setCurrentPage} />;
      case 'hr-employees':
        return <HrEmployeesPage />;
      case 'hr-roles':
        return <HrRolesPage />;
      case 'hr-id-cards':
        return <HrIdCardsPage />;
      case 'hr-activity':
        return <HrActivityPage />;
      case 'hr-directory':
        return <HrDirectoryPage />;
      case 'hr-permissions':
        return <HrPermissionsPage />;
      case 'hr-documents':
        return <HrDocumentsPage />;
      case 'backup':
        return <BackupPage />;
      case 'users':
        return <UsersManagementPage />;
      case 'bundles':
        return <BundlesManagementPage />;
      case 'admin-sessions':
        return <AdminSessionsPage />;
      case 'task-delegation':
        return <TaskDelegationPage />;
      case 'media-library':
        return <MediaLibraryPage />;
      case 'settings':
        return <SettingsPage />;
      case 'notification-log':
        return <NotificationLogPage />;
      default:
        return <OverviewPage />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="lg:ml-72 pt-16 lg:pt-16 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" key={currentPage}>
          <div className="animate-[fadeInUp_0.3s_ease]">
            {renderPage()}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AdminApp() {
  return (
    <AdminNotificationsProvider>
      <AdminContent />
    </AdminNotificationsProvider>
  );
}
