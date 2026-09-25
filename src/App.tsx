import { useState, useEffect, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Loader2, AlertTriangle, X, CheckCircle2, XCircle } from 'lucide-react';
import { StatusOrb } from './components/checkout/CheckoutUi';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TwoFactorPage } from './pages/TwoFactorPage';
import { EmailVerificationPage } from './pages/EmailVerificationPage';
import { PhoneVerificationPage } from './pages/PhoneVerificationPage';
import { ServicesPage } from './pages/ServicesPage';
import { DashboardPage } from './pages/DashboardPage';
import { BookingsPage } from './pages/BookingsPage';
import { AccountPage } from './pages/AccountPage';
import { CalendarPage } from './pages/CalendarPage';
import { BookingPage } from './pages/BookingPage';
import { SmartSortSubscriptionsPage } from './pages/SmartSortSubscriptionsPage';
import { BillingPage } from './pages/BillingPage';
import { QuotesPage } from './pages/QuotesPage';
import { SupportPage } from './pages/SupportPage';
import { PaymentReturnPage } from './pages/PaymentReturnPage';
import { TopNav } from './components/TopNav';
import { MobileShell } from './components/mobile/MobileShell';
import { SplashScreen } from './components/mobile/SplashScreen';
import { ToastContainer } from './components/toast/ToastContainer';
import { registerToastNotificationOpener } from './components/toast/toast';
import { destinationForClientNotification } from './lib/notificationDestinations';
import { IdleWarningModal } from './components/IdleWarningModal';
import { PwaProvider } from './components/pwa/PwaProvider';
import { PortalMaintenanceScreen } from './components/PortalMaintenanceScreen';
import { PortalCautionStack } from './components/CautionBanner';
import { usePortalSettings } from './hooks/usePortalSettings';


function FailedLoginBanner() {
  const { failedLoginAlert, dismissFailedLoginAlert } = useAuth();
  if (!failedLoginAlert) return null;

  const dateStr = new Date(failedLoginAlert.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fixed top-0 left-0 right-0 z-[9990] bg-amber-50 dark:bg-amber-950/80 border-b border-amber-200 px-4 py-3 shadow-sm">
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

function ClientShell({
  page,
  onNavigate,
  mobileOverflow = 'auto',
  mobile,
  desktop,
}: {
  page: string;
  onNavigate: (p: string) => void;
  mobileOverflow?: 'auto' | 'hidden';
  mobile: ReactNode;
  desktop: ReactNode;
}) {
  const portal = usePortalSettings();
  const { isAdmin } = useAuth();
  const cautionProps = {
    announcementEnabled: portal.portal_announcement_enabled,
    announcement: portal.portal_announcement,
    portalClosed: !portal.portal_enabled && isAdmin,
  };
  return (
    <>
      <div
        className={`block md:hidden fixed inset-0 h-[100dvh] w-full flex flex-col bg-slate-50 ${
          mobileOverflow === 'hidden' ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <div className="flex-shrink-0 safe-area-pt">
          <PortalCautionStack {...cautionProps} />
        </div>
        <div className="flex-1 min-h-0 relative">{mobile}</div>
      </div>
      <div className="hidden md:block min-h-screen bg-slate-50">
        <TopNav currentPage={page} onNavigate={onNavigate} devAdmin={false} onToggleDevAdmin={() => {}} />
        <main className="pt-16 min-h-screen">
          <PortalCautionStack {...cautionProps} />
          {desktop}
        </main>
      </div>
      <IdleWarningWrapper />
      <FailedLoginBanner />
    </>
  );
}

function FieldPaidScreen({ cancelled }: { cancelled: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm animate-slideUp">
        <StatusOrb tone={cancelled ? 'amber' : 'emerald'}>
          {cancelled ? <XCircle className="w-9 h-9" /> : <CheckCircle2 className="w-9 h-9" />}
        </StatusOrb>
        <h1 className="text-xl font-bold text-slate-900">{cancelled ? 'Payment cancelled' : 'Payment sent'}</h1>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          {cancelled
            ? 'No money was taken. Let the Alphatek crew know and they can show you a new code.'
            : 'Thank you. The Alphatek crew will see the confirmation on their device. You can close this page.'}
        </p>
      </div>
    </div>
  );
}

function PortalContent() {
  const { user, isAdmin, loading, needs2FA, needsEmailVerification, needsPhoneVerification, pending2FAEmail, pending2FAPassword, clear2FA, refreshVerification, signOut, profile } = useAuth();
  const portal = usePortalSettings();
  const [page, setPage] = useState('home');
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [bookingService, setBookingService] = useState<any>(null);
  const [bookingMode, setBookingMode] = useState<'hire' | 'quote' | 'pickup' | 'subscribe'>('hire');
  const [rebookData, setRebookData] = useState<any>(null);

  useEffect(() => {
    return registerToastNotificationOpener((n) => {
      setPage(destinationForClientNotification(n));
    });
  }, []);

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
    if (params.get('page') === 'payment-return') {
      setPage('payment-return');
    }
  }, []);

  const [fieldPaidStatus] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('page') === 'field-paid' ? (params.get('status') || 'success') : null;
  });

  const [showSplash, setShowSplash] = useState(() => {
    try {
      return isMobile && localStorage.getItem('atn-onboarded') !== '1';
    } catch { return false; }
  });
  const dismissSplash = () => {
    setShowSplash(false);
    try { localStorage.setItem('atn-onboarded', '1'); } catch {}
  };

  if (fieldPaidStatus) {
    return <FieldPaidScreen cancelled={fieldPaidStatus === 'cancel'} />;
  }

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

  if (portal.loaded && !portal.portal_enabled && !isAdmin) {
    return (
      <PortalMaintenanceScreen
        companyName={portal.portal_company_name}
        supportEmail={portal.portal_support_email || undefined}
        onSignOut={user ? () => { void signOut(); } : undefined}
      />
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

    return authView === 'login' || !portal.registration_enabled ? (
      <LoginPage
        onSwitch={() => setAuthView('register')}
        onForgot={() => setAuthView('forgot')}
        allowRegister={portal.registration_enabled}
        companyName={portal.portal_company_name}
        tagline={portal.portal_tagline}
      />
    ) : (
      <RegisterPage onNavigate={() => setAuthView('login')} companyName={portal.portal_company_name} />
    );
  }

  if (needsPhoneVerification && user && portal.require_phone_verification) {
    return (
      <PhoneVerificationPage
        phone={profile?.phone_e164 || profile?.phone || (typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '')}
        onBack={() => { signOut(); setAuthView('login'); }}
        onVerified={() => { refreshVerification(); }}
      />
    );
  }

  if (needsEmailVerification && user && portal.require_email_verification) {
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
      <ClientShell
        page={page}
        onNavigate={handleNavigate}
        mobile={<BookingPage service={bookingService} onNavigate={handleNavigate} rebookData={rebookData} mode={bookingMode} />}
        desktop={<BookingPage service={bookingService} onNavigate={handleNavigate} rebookData={rebookData} mode={bookingMode} />}
      />
    );
  }

  if (page === 'payment-return') {
    return (
      <ClientShell
        page={page}
        onNavigate={handleNavigate}
        mobile={<PaymentReturnPage onNavigate={handleNavigate} />}
        desktop={<PaymentReturnPage onNavigate={handleNavigate} />}
      />
    );
  }

  if (page === 'billing' || page === 'quotes' || page === 'support') {
    const body = page === 'billing'
      ? <BillingPage onBack={() => setPage('home')} />
      : page === 'quotes'
        ? <QuotesPage onBack={() => setPage('home')} />
        : <SupportPage onBack={() => setPage('home')} />;
    return (
      <ClientShell
        page={page}
        onNavigate={handleNavigate}
        mobile={body}
        desktop={page === 'billing'
          ? <BillingPage onBack={() => setPage('home')} />
          : page === 'quotes'
            ? <QuotesPage onBack={() => setPage('home')} />
            : <SupportPage onBack={() => setPage('home')} />}
      />
    );
  }

  if (page === 'smart-sort-subs') {
    return (
      <ClientShell
        page={page}
        onNavigate={handleNavigate}
        mobile={<SmartSortSubscriptionsPage onNavigate={handleNavigate} />}
        desktop={<SmartSortSubscriptionsPage onNavigate={handleNavigate} />}
      />
    );
  }

  return (
    <ClientShell
      page={page}
      onNavigate={handleNavigate}
      mobileOverflow="hidden"
      mobile={
        <MobileShell
          onNavigate={handleNavigate}
          onSelectService={handleSelectService}
          onRebook={handleRebook}
          onQuickBook={handleQuickBook}
        />
      }
      desktop={
        <>
          {page === 'home'     && <DashboardPage onNavigate={handleNavigate} onSelectService={handleSelectService} onQuickBook={handleQuickBook} />}
          {page === 'services' && <ServicesPage onNavigate={handleNavigate} onSelectService={handleSelectService} />}
          {page === 'bookings' && <BookingsPage onNavigate={handleNavigate} onRebook={handleRebook} />}
          {page === 'account'  && <AccountPage onNavigate={handleNavigate} onQuickBook={handleQuickBook} />}
          {page === 'calendar' && <CalendarPage onNavigate={handleNavigate} />}
        </>
      }
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PortalContent />
        <ToastContainer />
        <PwaProvider />
      </ThemeProvider>
    </AuthProvider>
  );
}
