import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Briefcase, CalendarDays, UserCircle,
  LogOut, Menu, X, Sparkles, Shield, ChevronDown,
  Sun, Moon, Monitor, Circle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { NotificationsPanel } from './NotificationsPanel';

interface TopNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  devAdmin: boolean;
  onToggleDevAdmin: () => void;
}

const navItems = [
  { label: 'Home',     page: 'home',     icon: LayoutDashboard },
  { label: 'Services', page: 'services', icon: Briefcase },
  { label: 'Bookings', page: 'bookings', icon: CalendarDays },
  { label: 'Account',  page: 'account',  icon: UserCircle },
];

export function TopNav({ currentPage, onNavigate, devAdmin, onToggleDevAdmin }: TopNavProps) {
  const { profile, signOut, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const effectiveAdmin = isAdmin || devAdmin;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleNav = (page: string) => {
    onNavigate(page);
    setMobileOpen(false);
    setProfileOpen(false);
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/85 backdrop-blur-lg shadow-sm border-b border-slate-200/80'
            : 'bg-white border-b border-slate-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`flex items-center justify-between transition-all duration-300 ${scrolled ? 'h-14' : 'h-16'}`}>
            {/* Logo */}
            <button
              onClick={() => handleNav('home')}
              className="flex items-center gap-2.5 group flex-shrink-0"
            >
              <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="font-bold text-slate-900 text-sm leading-tight">Alphatek Nexus</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Client Portal</p>
              </div>
            </button>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.page;
                return (
                  <button
                    key={item.page}
                    onClick={() => handleNav(item.page)}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                      active
                        ? 'text-emerald-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 transition-colors ${active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    {item.label}
                    {active && (
                      <span className="absolute -bottom-px left-3 right-3 h-0.5 bg-emerald-600 rounded-full" />
                    )}
                  </button>
                );
              })}
              {effectiveAdmin && (
                <a
                  href="/admin.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  <Shield className="w-4 h-4 text-slate-400" />
                  Admin
                </a>
              )}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Theme switcher */}
              <div ref={themeRef} className="relative">
                <button
                  onClick={() => setThemeOpen(!themeOpen)}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label="Theme"
                >
                  {theme === 'light' && <Sun className="w-4 h-4" />}
                  {theme === 'dark' && <Moon className="w-4 h-4" />}
                  {theme === 'black' && <Circle className="w-4 h-4 fill-current" />}
                  {theme === 'system' && <Monitor className="w-4 h-4" />}
                </button>
                {themeOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50">
                    {([
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'black', label: 'Black', icon: Circle },
                      { id: 'system', label: 'System', icon: Monitor },
                    ] as { id: ThemeMode; label: string; icon: typeof Sun }[]).map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => { setTheme(opt.id); setThemeOpen(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${theme === opt.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          <Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <NotificationsPanel />

              {/* Profile Dropdown (desktop) */}
              <div ref={profileRef} className="hidden lg:block relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-700 font-semibold text-sm">
                      {profile?.full_name?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                <div
                  className={`absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden transition-all duration-200 origin-top-right ${
                    profileOpen
                      ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                      : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
                  }`}
                >
                  <div className="p-4 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800 truncate">{profile?.full_name || 'User'}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{profile?.email}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => handleNav('account')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <UserCircle className="w-4 h-4 text-slate-400" />
                      Account Settings
                    </button>
                    <div className="my-1.5 h-px bg-slate-100" />
                    <button
                      onClick={onToggleDevAdmin}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Dev Admin
                      </span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${devAdmin ? 'bg-amber-400' : 'bg-slate-200'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${devAdmin ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                    </button>
                    <button
                      onClick={signOut}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-all duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        <div
          className={`absolute top-16 left-0 right-0 bg-white shadow-xl border-b border-slate-200 max-h-[calc(100vh-4rem)] overflow-y-auto transition-transform duration-300 ${
            mobileOpen ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
          }`}
        >
          <nav className="p-4 space-y-1">
            {navItems.map((item, i) => {
              const Icon = item.icon;
              const active = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => handleNav(item.page)}
                  style={{ transitionDelay: mobileOpen ? `${i * 30}ms` : '0ms' }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    mobileOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                  } ${
                    active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              );
            })}

            {effectiveAdmin && (
              <a
                href="/admin.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Shield className="w-5 h-5 text-slate-400" />
                Admin Dashboard
              </a>
            )}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-700 font-semibold">
                  {profile?.full_name?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{profile?.full_name || 'User'}</p>
                <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
              </div>
            </div>
            <button
              onClick={onToggleDevAdmin}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-50 transition-colors mb-1"
            >
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Dev Admin
              </span>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${devAdmin ? 'bg-amber-400' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${devAdmin ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
