import { Construction, LogOut, Mail } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ThemeToggle } from './ThemeToggle';
import { useAppLogo } from '../lib/media';

export function PortalMaintenanceScreen({
  companyName,
  supportEmail,
  onSignOut,
}: {
  companyName: string;
  supportEmail?: string;
  onSignOut?: () => void;
}) {
  const { url: logoUrl } = useAppLogo();

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col px-4 py-6 sm:py-10 safe-area-pt safe-area-pb">
      <div className="flex items-center justify-between max-w-lg mx-auto w-full mb-6">
        <BrandLogo src={logoUrl} alt={companyName} className="h-8 w-auto" />
        <ThemeToggle menuId="maintenance-theme" />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center shadow-sm animate-slideUp">
          <div className="caution-banner-stripes rounded-t-3xl -mx-6 sm:-mx-8 -mt-6 sm:-mt-8 mb-6 h-2 overflow-hidden" aria-hidden="true" />
          <div className="relative w-16 h-16 mx-auto mb-5">
            <span className="absolute inset-0 rounded-2xl bg-amber-400/25 motion-safe:animate-ping" />
            <div className="relative w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center animate-scaleIn">
              <Construction className="w-8 h-8 text-amber-600 caution-banner-icon" />
            </div>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Maintenance</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">{companyName}</h1>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            The client portal is temporarily closed. Existing accounts and bookings are safe. Please check back shortly.
          </p>
          {supportEmail && (
            <a
              href={`mailto:${supportEmail}`}
              className="mt-5 min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <Mail className="w-4 h-4" /> {supportEmail}
            </a>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="mt-6 min-h-[48px] w-full sm:w-auto sm:px-8 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 active:scale-[0.98] transition-transform"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
