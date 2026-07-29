import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Loader2 } from 'lucide-react';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TwoFactorPage } from './pages/TwoFactorPage';
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


function PortalContent() {
  const { user, loading, needs2FA, pending2FAEmail, pending2FAPassword, clear2FA } = useAuth();
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
    // 2FA verification page
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

    // Password reset page (after clicking reset link in email)
    if (authView === 'reset') {
      return <ResetPasswordPage onBack={() => setAuthView('login')} />;
    }

    // Forgot password page
    if (authView === 'forgot') {
      return <ForgotPasswordPage onBack={() => setAuthView('login')} />;
    }

    return authView === 'login' ? (
      <LoginPage onSwitch={() => setAuthView('register')} onForgot={() => setAuthView('forgot')} />
    ) : (
      <RegisterPage onNavigate={() => setAuthView('login')} />
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
    setRebookData({ serviceId, preset });
    setPage('booking');
  };

  const handleRebook = (booking: any) => {
    setRebookData(booking);
    setPage('booking');
  };

  // Booking page is shown fullscreen on both mobile and desktop when triggered
  if (page === 'booking') {
    return (
      <>
        {/* Mobile booking - fullscreen with safe areas */}
        <div className="block md:hidden min-h-screen bg-slate-50 safe-area-pt">
          <BookingPage service={bookingService} onNavigate={handleNavigate} rebookData={rebookData} mode={bookingMode} />
        </div>
        {/* Desktop booking */}
        <div className="hidden md:block min-h-screen bg-slate-50">
          <TopNav currentPage={page} onNavigate={handleNavigate} devAdmin={devAdmin} onToggleDevAdmin={() => {}} />
          <main className="pt-16 min-h-screen">
            <BookingPage service={bookingService} onNavigate={handleNavigate} rebookData={rebookData} mode={bookingMode} />
          </main>
        </div>
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
      </>
    );
  }

  return (
    <>
      {/* ── Mobile layout (< md) ── */}
      <div className="block md:hidden h-screen overflow-hidden">
        <MobileShell
          onNavigate={handleNavigate}
          onSelectService={handleSelectService}
          onRebook={handleRebook}
          onQuickBook={handleQuickBook}
        />
      </div>

      {/* ── Desktop layout (≥ md) ── */}
      <div className="hidden md:block min-h-screen bg-slate-50">
        <TopNav
          currentPage={page}
          onNavigate={handleNavigate}
          devAdmin={devAdmin}
          onToggleDevAdmin={() => {}}
        />
        <main className="pt-16 min-h-screen">
          {page === 'home'     && <DashboardPage onNavigate={handleNavigate} onSelectService={handleSelectService} />}
          {page === 'services' && <ServicesPage onNavigate={handleNavigate} onSelectService={handleSelectService} />}
          {page === 'bookings' && <BookingsPage onNavigate={handleNavigate} onRebook={handleRebook} />}
          {page === 'account'  && <AccountPage onNavigate={handleNavigate} onQuickBook={handleQuickBook} />}
          {page === 'calendar' && <CalendarPage onNavigate={handleNavigate} />}
        </main>
      </div>
      <FinanceToastContainer />
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
