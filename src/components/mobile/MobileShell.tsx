import { useState, useRef } from 'react';
import {
  Home, CalendarDays, Wallet, UserCircle, ChevronLeft,
} from 'lucide-react';
import { useAppLogo } from '../../lib/media';
import { NotificationsPanel } from '../NotificationsPanel';
import { MobileHome } from './MobileHome';
import { MobileBookingsPage } from './MobileBookingsPage';
import { WalletPanel } from '../WalletPanel';
import { MobileProfilePage } from './MobileProfilePage';
import { MobileServicesPage } from './MobileServicesPage';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useHaptics } from '../../hooks/useHaptics';

type MobilePage = 'home' | 'bookings' | 'wallet' | 'profile' | 'services';

interface Props {
  onNavigate: (page: string) => void;
  onSelectService: (svc: any, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onRebook: (booking: any) => void;
  onQuickBook: (serviceId: string, preset: any) => void;
}

const ALL_NAV_ITEMS: { id: MobilePage; label: string; icon: typeof Home }[] = [
  { id: 'home',     label: 'Home',     icon: Home },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays },
  { id: 'wallet',   label: 'Wallet',   icon: Wallet },
  { id: 'profile',  label: 'Profile',  icon: UserCircle },
];

const PAGE_TITLE: Record<MobilePage, string> = {
  home: 'Home',
  bookings: 'My Bookings',
  wallet: 'Wallet',
  profile: 'Account',
  services: 'All Services',
};


export function MobileShell({ onNavigate, onSelectService, onRebook, onQuickBook }: Props) {
  const { wallet_enabled } = useFeatureFlags();
  const { url: logoUrl } = useAppLogo();
  const { vibrate } = useHaptics();
  const [mobilePage, setMobilePage] = useState<MobilePage>('home');
  const [pageKey, setPageKey] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

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
    setMobilePage(p);
    setPageKey(k => k + 1);
  };

  const handleOpenBooking = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    handleSetPage('bookings');
  };

  const isSubPage = mobilePage === 'services';

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 h-[100dvh] h-screen w-full flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-950 black:bg-black no-tap-highlight safe-area-all z-20"
    >
      {/* Top Bar — fixed height, safe-area top padding */}
      <header className="flex-shrink-0 z-30 bg-white/95 dark:bg-slate-900/95 black:bg-black backdrop-blur-md border-b border-slate-100 dark:border-slate-800 shadow-sm no-select">
        <div className="relative flex items-center justify-between px-4 py-2.5 safe-area-pt">
          {/* Left: back button or logo */}
          {isSubPage ? (
            <button
              onClick={() => handleSetPage('home')}
              className="flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 active:scale-95 transition-transform no-select"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
              Back
            </button>
          ) : (
            <button onClick={() => handleSetPage('home')} className="active:scale-95 transition-transform no-select">
              <img
                src={logoUrl}
                alt="Alphatek Nexus"
                className="h-7 w-auto object-contain"
              />
            </button>
          )}

          {/* Center: page title */}
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-bold text-slate-900 dark:text-slate-100 pointer-events-none truncate max-w-[50%]">
            {PAGE_TITLE[mobilePage]}
          </h1>

          {/* Right: notifications only */}
          <NotificationsPanel />
        </div>
      </header>

      {/* Page Content — flex-1 fills remaining space, scrolls internally */}
      <main className="flex-1 overflow-y-auto overscroll-y-contain mobile-scroll min-h-0 w-full relative z-10" key={pageKey}>
        <div>
          {mobilePage === 'home' && (
            <MobileHome
              onNavigate={(page) => {
                if (page === 'services') handleSetPage('services');
                else if (page === 'bookings') handleSetPage('bookings');
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
              initialExpandId={selectedBookingId}
            />
          )}

          {mobilePage === 'wallet' && wallet_enabled && (
            <div className="p-4">
              <WalletPanel onChooseService={() => handleSetPage('services')} />
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
              onNavigate={onNavigate}
            />
          )}
        </div>
      </main>

      {/* Bottom Navigation — static, always visible, safe-area bottom padding */}
      <nav className="flex-shrink-0 z-30 bg-white/95 dark:bg-slate-900/95 black:bg-black backdrop-blur-md border-t border-slate-100 dark:border-slate-800 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] no-select">
        <div className="flex items-center justify-around px-1.5 py-1 safe-area-pb">
          {ALL_NAV_ITEMS.filter(item => item.id !== 'wallet' || wallet_enabled).map(item => {
            const Icon = item.icon;
            const active = mobilePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSetPage(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-2xl transition-all duration-200 active:scale-90 no-select min-w-[58px] ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon
                  className="w-5 h-5 transition-colors duration-200"
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span className={`text-[10px] font-medium transition-colors duration-200 ${active ? 'font-semibold' : ''}`}>
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

