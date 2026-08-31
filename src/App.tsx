import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TwoFactorPage } from './pages/TwoFactorPage';
import { EmailVerificationPage } from './pages/EmailVerificationPage';
import { ServicesPage } from './pages/ServicesPage';
import { DashboardPage } from './pages/DashboardPage';
import { BookingsPage } from './pages/BookingsPage';
import { AccountPage } from './pages/AccountPage';
import { CalendarPage } from './pages/CalendarPage';
import { BookingPage } from './pages/BookingPage';
import { SmartSortSubscriptionsPage } from './pages/SmartSortSubscriptionsPage';
import { TopNav } from './components/TopNav';
import { MobileShell } from './components/mobile/MobileShell';
import { SplashScreen } from './components/mobile/SplashScreen';
import { FinanceToastContainer } from './components/FinanceToast';
import { IdleWarningModal } from './components/IdleWarningModal';


function FailedLoginBanner() {
  const { failedLoginAlert, dismissFailedLoginAlert } = useAuth();
  if (!failedLoginAlert) return null;

  const dateStr = new Date(failedLoginAlert.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fixed top-0 left-0 right-0 z-[9990] bg-amber-50 border-b border-amber-200 px-4 py-3 shadow-sm">
      <div className="max-w-4xl mx-auto flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Failed sign-in attempt detected</p>
          <p className="text-xs text-amber-700 mt-0.5">
            We blocked a sign-in attempt on {dateStr} from {failedLoginAlert.device}.
            If this was not you, please change your password immediately.
          </p>
        </div>
        <button
          onClick={dismissFailedLoginAlert}
          className="p-1 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function IdleWarningWrapper() {
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

function PortalContent() {
  const { user, loading, needs2FA, needsEmailVerification, pending2FAEmail, pending2FAPassword, clear2FA, refreshVerification, signOut } = useAuth();
  const [page, setPage] = useState('home');
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [devAdmin] = useState(false);
  const [bookingService, setBookingService] = useState<any>(null);
  const [bookingMode, setBookingMode] = useState<'hire' | 'quote' | 'pickup' | 'subscribe'>('hire');
  const [rebookData, setRebookData] = useState<any>(null);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'true') {
      setAuthView('reset');
    }
  }, []);

  const [showSplash, setShowSplash] = useState(() => {
    try {
      return isMobile && localStorage.getItem('atn-onboarded') !== '1';
    } catch { return false; }
  });
  const dismissSplash = () => {
    setShowSplash(false);
    try { localStorage.setItem('atn-onboarded', '1'); } catch {}
  };

  if (showSplash && isMobile) {
    return (
      <SplashScreen
        onGetStarted={dismissSplash}
        onLogin={() => { dismissSplash(); setAuthView('login'); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    if (needs2FA) {
      return (
        <TwoFactorPage
          email={pending2FAEmail}
          password={pending2FAPassword}
          onBack={() => { clear2FA(); setAuthView('login'); }}
          onSuccess={() => { clear2FA(); }}
        />
      );
    }

    if (authView === 'reset') {
      return <ResetPasswordPage onBack={() => setAuthView('login')} />;
    }

    if (authView === 'forgot') {
      return <ForgotPasswordPage onBack={() => setAuthView('login')} />;
    }

    return authView === 'login' ? (
      <LoginPage onSwitch={() => setAuthView('register')} onForgot={() => setAuthView('forgot')} />
    ) : (
      <RegisterPage onNavigate={() => setAuthView('login')} />
    );
  }

  if (needsEmailVerification && user) {
    return (
      <EmailVerificationPage
        email={user.email || ''}
        onBack={() => { signOut(); setAuthView('login'); }}
        onVerified={() => { refreshVerification(); }}
      />
    );
  }

  const handleNavigate = (p: string) => {
    setPage(p);
  };

  const handleSelectService = (svc: any, mode: 'hire' | 'quote' | 'pickup' | 'subscribe' = 'hire') => {
    setBookingService(svc);
    setBookingMode(mode);
    setPage('booking');
  };

  const handleQuickBook = (serviceId: string, preset: any) => {
    setRebookData(preset);
    setPage('booking');
  };

  const handleRebook = (booking: any) => {
    setRebookData(booking);
    setPage('booking');
  };

  if (page === 'booking') {
    return (
      <>
        <div className="block md:hidden min-h-screen bg-slate-50 safe-area-pt">
          <BookingPage service={bookingService} onNavigate={handleNavigate} rebookData={rebookData} mode={bookingMode} />
        </div>
        <div className="hidden md:block min-h-screen bg-slate-50">
          <TopNav currentPage={page} onNavigate={handleNavigate} devAdmin={devAdmin} onToggleDevAdmin={() => {}} />
          <main className="pt-16 min-h-screen">
            <BookingPage service={bookingService} onNavigate={handleNavigate} rebookData={rebookData} mode={bookingMode} />
          </main>
        </div>
        <IdleWarningWrapper />
        <FailedLoginBanner />
      </>
    );
  }

  if (page === 'smart-sort-subs') {
    return (
      <>
        <div className="block md:hidden min-h-screen bg-slate-50 safe-area-pt">
          <SmartSortSubscriptionsPage onNavigate={handleNavigate} />
        </div>
        <div className="hidden md:block min-h-screen bg-slate-50">
          <TopNav currentPage={page} onNavigate={handleNavigate} devAdmin={devAdmin} onToggleDevAdmin={() => {}} />
          <main className="pt-16 min-h-screen">
            <SmartSortSubscriptionsPage onNavigate={handleNavigate} />
          </main>
        </div>
        <IdleWarningWrapper />
        <FailedLoginBanner />
      </>
    );
  }

  return (
    <>
      <div className="block md:hidden h-[100dvh] overflow-hidden bg-slate-50">
        <MobileShell
          onNavigate={handleNavigate}
          onSelectService={handleSelectService}
          onRebook={handleRebook}
          onQuickBook={handleQuickBook}
        />
      </div>

      <div className="hidden md:block min-h-screen bg-slate-50">
        <TopNav
          currentPage={page}
          onNavigate={handleNavigate}
          devAdmin={devAdmin}
          onToggleDevAdmin={() => {}}
        />
        <main className="pt-16 min-h-screen">
          {page === 'home'     && <DashboardPage onNavigate={handleNavigate} onSelectService={handleSelectService} onQuickBook={handleQuickBook} />}
          {page === 'services' && <ServicesPage onNavigate={handleNavigate} onSelectService={handleSelectService} />}
          {page === 'bookings' && <BookingsPage onNavigate={handleNavigate} onRebook={handleRebook} />}
          {page === 'account'  && <AccountPage onNavigate={handleNavigate} onQuickBook={handleQuickBook} />}
          {page === 'calendar' && <CalendarPage onNavigate={handleNavigate} />}
        </main>
      </div>
      <FinanceToastContainer />
      <IdleWarningWrapper />
      <FailedLoginBanner />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PortalContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
