import { useEffect, useRef, useState } from 'react';
import {
  Home, CalendarDays, Wallet, UserCircle, ChevronLeft,
} from 'lucide-react';
import { useAppLogo } from '../../lib/media';
import { BrandLogo } from '../BrandLogo';
import { NotificationsPanel } from '../NotificationsPanel';
import { MobileHome } from './MobileHome';
import { MobileBookingsPage } from './MobileBookingsPage';
import { PaymentsHub, type PayTab } from '../client/PaymentsHub';
import { MobileProfilePage } from './MobileProfilePage';
import { MobileServicesPage } from './MobileServicesPage';
import { useHaptics } from '../../hooks/useHaptics';
import { useAuth } from '../../contexts/AuthContext';

type MobilePage = 'home' | 'bookings' | 'wallet' | 'profile' | 'services';

interface Props {
  page?: string;
  onNavigate: (page: string) => void;
  onSelectService: (svc: any, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onRebook: (booking: any) => void;
  onQuickBook: (serviceId: string, preset: any) => void;
}

export function shellTabForPage(page: string): MobilePage {
  if (page === 'bookings') return 'bookings';
  if (page === 'services') return 'services';
  if (page === 'profile' || page === 'account') return 'profile';
  if (page === 'payments' || page === 'billing' || page === 'quotes' || page === 'wallet') return 'wallet';
  return 'home';
}

export function payTabForPage(page: string): PayTab {
  if (page === 'billing') return 'bills';
  if (page === 'quotes') return 'quotes';
  return 'wallet';
}

const ALL_NAV_ITEMS: { id: MobilePage; label: string; icon: typeof Home }[] = [
  { id: 'home',     label: 'Home',     icon: Home },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays },
  { id: 'wallet',   label: 'Pay',      icon: Wallet },
  { id: 'profile',  label: 'Profile',  icon: UserCircle },
];

const PAGE_TITLE: Record<MobilePage, string> = {
  home: 'Home',
  bookings: 'My Bookings',
  wallet: 'Payments',
  profile: 'Account',
  services: 'All Services',
};


export function MobileShell({ page = 'home', onNavigate, onSelectService, onRebook, onQuickBook }: Props) {
  const { url: logoUrl } = useAppLogo();
  const { profile } = useAuth();
  const { vibrate } = useHaptics();
  const [mobilePage, setMobilePage] = useState<MobilePage>(() => shellTabForPage(page));
  const [pageKey, setPageKey] = useState(0);
  const [openedBookingId, setOpenedBookingId] = useState<string | null>(null);
  const skipPageSync = useRef(true);

  useEffect(() => {
    if (skipPageSync.current) {
      skipPageSync.current = false;
      return;
    }
    setOpenedBookingId(null);
    setMobilePage(shellTabForPage(page));
    setPageKey((k) => k + 1);
  }, [page]);

  // Edge swipe-to-back gesture tracking
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = Math.abs(touchEndY - touchStartY.current);

    // Left edge swipe (started within 30px of left edge, moved right > 80px, minimal vertical drift)
    if (touchStartX.current <= 30 && deltaX > 80 && deltaY < 50) {
      if (mobilePage !== 'home') {
        vibrate('medium');
        handleSetPage('home');
      }
    }
  };

  const handleSetPage = (p: MobilePage) => {
    vibrate('selection');
    setOpenedBookingId(null);
    setMobilePage(p);
    setPageKey(k => k + 1);
  };

  const handleOpenBooking = (bookingId: string) => {
    vibrate('selection');
    setOpenedBookingId(bookingId);
    setMobilePage('bookings');
    setPageKey(k => k + 1);
  };

  const focusingBooking = mobilePage === 'bookings' && !!openedBookingId;
  const isSubPage = mobilePage === 'services' || focusingBooking;
  const showTopBar = mobilePage !== 'home';
  const profileInitial = (profile?.full_name || profile?.email || 'U').trim().charAt(0).toUpperCase();

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="h-full min-h-0 w-full flex flex-col overflow-hidden bg-[#f5f8ff] dark:bg-slate-950 black:bg-black no-tap-highlight z-20"
    >
      {/* Top Bar — fixed height, safe-area top padding */}
      {showTopBar && (
      <header className="native-topbar flex-shrink-0 z-30 bg-white/95 dark:bg-slate-900/95 black:bg-black backdrop-blur-md border-b border-slate-100 dark:border-slate-800 no-select">
        <div className="relative flex items-center justify-between px-3 pb-1.5 shell-safe-header min-h-0">
          {/* Left: back button or logo */}
          {isSubPage ? (
            <button
              onClick={() => handleSetPage('home')}
              className="flex items-center justify-center w-9 h-9 -ml-1 rounded-full text-slate-800 dark:text-slate-100 active:bg-slate-100 dark:active:bg-slate-800 transition-colors no-select"
              aria-label="Back"
            >
              <ChevronLeft className="w-6 h-6" strokeWidth={2.4} />
            </button>
          ) : (
            <button onClick={() => handleSetPage('home')} className="active:scale-95 transition-transform no-select">
              <BrandLogo
                src={logoUrl}
                alt="Alphatek Nexus"
                className="h-6 w-auto"
              />
            </button>
          )}

          {/* Center: page title */}
          <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-slate-900 dark:text-slate-100 pointer-events-none truncate max-w-[46%]">
            {focusingBooking ? 'Booking' : PAGE_TITLE[mobilePage]}
          </h1>

          {/* Right: notifications only */}
          <div className="flex items-center gap-2">
            <NotificationsPanel />
            <button
              onClick={() => handleSetPage('profile')}
              className="h-8 w-8 rounded-full border border-slate-200 bg-white inline-flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Open profile"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold inline-flex items-center justify-center">
                  {profileInitial}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>
      )}

      {/* Page Content — flex-1 fills remaining space, scrolls internally */}
      <main className="flex-1 overflow-y-auto overscroll-y-contain mobile-scroll min-h-0 w-full relative z-10" key={pageKey}>
        <div>
          {mobilePage === 'home' && (
            <MobileHome
              onNavigate={(page) => {
                if (page === 'services') handleSetPage('services');
                else if (page === 'bookings') handleSetPage('bookings');
                else if (page === 'account') handleSetPage('profile');
                else if (page === 'payments' || page === 'billing' || page === 'quotes') handleSetPage('wallet');
                else onNavigate(page);
              }}
              onSelectService={onSelectService}
              onOpenBooking={handleOpenBooking}
            />
          )}

          {mobilePage === 'bookings' && (
            <MobileBookingsPage
              onNavigate={(page) => {
                if (page === 'account') handleSetPage('profile');
                else if (page === 'subscriptions') onNavigate('smart-sort-subs');
                else if (page === 'services') handleSetPage('services');
                else onNavigate(page);
              }}
              onRebook={onRebook}
              focusBookingId={openedBookingId}
            />
          )}

          {mobilePage === 'wallet' && (
            <div className="p-4">
              <PaymentsHub
                key={payTabForPage(page)}
                initialTab={payTabForPage(page)}
                onNavigate={(next) => {
                  if (next === 'services') handleSetPage('services');
                  else if (next === 'home') handleSetPage('home');
                  else onNavigate(next);
                }}
                onChooseService={() => handleSetPage('services')}
              />
            </div>
          )}

          {mobilePage === 'profile' && (
            <MobileProfilePage
              onMobileNav={handleSetPage}
              onNavigate={onNavigate}
              onQuickBook={onQuickBook}
              onRebook={onRebook}
            />
          )}

          {mobilePage === 'services' && (
            <MobileServicesPage
              onSelectService={onSelectService}
              onNavigate={(page) => {
                if (page === 'payments' || page === 'billing' || page === 'quotes') handleSetPage('wallet');
                else onNavigate(page);
              }}
            />
          )}
        </div>
      </main>

      {/* Bottom Navigation — pinned in the flex column, padded above the system inset */}
      <nav className="native-tabbar flex-shrink-0 z-40 bg-white/95 dark:bg-slate-900 black:bg-black border-t border-slate-200/80 dark:border-slate-700 no-select w-full mobile-nav-pb backdrop-blur" aria-label="App">
        <div className="flex items-end justify-around px-2 pt-1 max-w-lg mx-auto w-full">
          {ALL_NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = mobilePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSetPage(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-end gap-1 min-w-0 min-h-[48px] pb-1 transition-transform duration-200 active:scale-95 no-select ${
                  active ? 'text-[#173362] dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span className={`inline-flex items-center justify-center h-8 min-w-14 px-4 rounded-full transition-colors duration-200 ${
                  active ? 'bg-[#173362] text-white dark:bg-blue-500' : 'bg-transparent'
                }`}>
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

