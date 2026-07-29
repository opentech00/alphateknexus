import { useState } from 'react';
import {
  Home, CalendarDays, Wallet, UserCircle, ChevronLeft,
} from 'lucide-react';
import { NotificationsPanel } from '../NotificationsPanel';
import { MobileHome } from './MobileHome';
import { MobileBookingsPage } from './MobileBookingsPage';
import { WalletPanel } from '../WalletPanel';
import { MobileProfilePage } from './MobileProfilePage';
import { MobileServicesPage } from './MobileServicesPage';

type MobilePage = 'home' | 'bookings' | 'wallet' | 'profile' | 'services';

interface Props {
  onNavigate: (page: string) => void;
  onSelectService: (svc: any, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onRebook: (booking: any) => void;
  onQuickBook: (serviceId: string, preset: any) => void;
}

const NAV_ITEMS: { id: MobilePage; label: string; icon: typeof Home }[] = [
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
  const [mobilePage, setMobilePage] = useState<MobilePage>('home');
  const [pageKey, setPageKey] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const handleSetPage = (p: MobilePage) => {
    setMobilePage(p);
    setPageKey(k => k + 1);
  };

  const handleOpenBooking = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    handleSetPage('bookings');
  };

  const isSubPage = mobilePage === 'services';

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-gray-50 dark:bg-slate-950 black:bg-black no-tap-highlight safe-area-all">
      {/* Top Bar — fixed height, safe-area top padding */}
      <header className="flex-shrink-0 bg-white dark:bg-slate-900 black:bg-black border-b border-slate-100 dark:border-slate-800 shadow-sm no-select">
        <div className="relative flex items-center justify-between px-4 py-3 safe-area-pt">
          {/* Left: back button or logo */}
          {isSubPage ? (
            <button
              onClick={() => handleSetPage('home')}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 active:scale-95 transition-transform no-select"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          ) : (
            <button onClick={() => handleSetPage('home')} className="active:scale-95 transition-transform no-select">
              <img
                src="/alphateknexus_logo_transparent.webp"
                alt="Alphatek Nexus"
                className="h-7 object-contain"
              />
            </button>
          )}

          {/* Center: page title */}
          <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-bold text-slate-900 dark:text-slate-100 pointer-events-none truncate max-w-[50%]">
            {PAGE_TITLE[mobilePage]}
          </h1>

          {/* Right: notifications only */}
          <NotificationsPanel />
        </div>
      </header>

      {/* Page Content — flex-1 fills remaining space, scrolls internally */}
      <main className="flex-1 overflow-y-auto mobile-scroll min-h-0" key={pageKey}>
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

          {mobilePage === 'wallet' && (
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
      <nav className="flex-shrink-0 bg-white dark:bg-slate-900 black:bg-black border-t border-slate-100 dark:border-slate-800 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] no-select">
        <div className="flex items-center justify-around px-2 py-1 safe-area-pb">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = mobilePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSetPage(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-all active:scale-90 no-select min-w-[60px] ${
                  active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <div className="relative">
                  <Icon
                    className="w-5 h-5 transition-colors"
                    strokeWidth={active ? 2.5 : 1.75}
                  />
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full" />
                  )}
                </div>
                <span className={`text-[10px] font-medium mt-0.5 ${active ? 'text-blue-600' : ''}`}>
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
