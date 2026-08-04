import { AuthProvider, useAuth } from './contexts/EmployeeAuthContext';
import { EmployeeNotificationsProvider } from './contexts/EmployeeNotificationsContext';
import { LoginPage } from './pages/LoginPage';
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CashCollectionsPage } from './pages/CashCollectionsPage';
import { FieldStaffApp } from './field/FieldStaffApp';
import { Loader2, ShieldAlert } from 'lucide-react';

function EmployeeContent() {
  const { user, employee, appAccess, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (employee?.must_change_password) return <ChangePasswordPage />;

  // Use structured app_access to determine which app to show.
  // Falls back to role-name heuristic for backwards compatibility.
  const isFieldStaff = appAccess?.app_type === 'field' && appAccess.is_active ||
    employee?.hr_roles?.name?.toLowerCase().includes('field') ||
    employee?.position?.toLowerCase().includes('field') ||
    employee?.hr_roles?.name?.toLowerCase().includes('staff') ||
    false;

  if (isFieldStaff) return <FieldStaffApp />;

  // If access is explicitly inactive, show access denied
  if (appAccess && !appAccess.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Disabled</h1>
          <p className="text-sm text-slate-500">Your access to the employee portal has been disabled. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <EmployeeNotificationsProvider>
      <EmployeeDashboardPage />
    </EmployeeNotificationsProvider>
  );
}

export function EmployeeApp() {
  return (
    <AuthProvider>
      <EmployeeContent />
    </AuthProvider>
  );
}
