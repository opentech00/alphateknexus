import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AdminNotificationsProvider } from './contexts/AdminNotificationsContext';
import { AdminSidebar } from './AdminSidebar';
import { OverviewPage } from './pages/OverviewPage';
import { BookingsManagementPage } from './pages/BookingsManagementPage';
import { ClientsPage } from './pages/ClientsPage';
import { DivisionsPage } from './pages/DivisionsPage';
import { SettingsPage } from './pages/SettingsPage';
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
import { BackupPage } from './pages/BackupPage';
import { UsersManagementPage } from './pages/UsersManagementPage';
import { BundlesManagementPage } from './pages/BundlesManagementPage';
import { FieldDispatchPage } from './pages/FieldDispatchPage';

function AdminContent() {
  const [currentPage, setCurrentPage] = useState('overview');
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 mb-6">{user ? 'Your account does not have admin privileges.' : 'You must be logged in to access the admin dashboard.'}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-sm"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage />;
      case 'bookings':
        return <BookingsManagementPage />;
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
      case 'backup':
        return <BackupPage />;
      case 'users':
        return <UsersManagementPage />;
      case 'bundles':
        return <BundlesManagementPage />;
      case 'settings':
        return <SettingsPage />;
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
