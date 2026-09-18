import { Construction, LogOut, Mail } from 'lucide-react';

export function PortalMaintenanceScreen({
  companyName,
  supportEmail,
  onSignOut,
}: {
  companyName: string;
  supportEmail?: string;
  onSignOut?: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-14 h-14 mx-auto bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
          <Construction className="w-7 h-7 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">{companyName}</h1>
        <p className="text-sm text-slate-500 mt-2">
          The client portal is temporarily closed. Existing accounts are safe. Please check back later.
        </p>
        {supportEmail && (
          <a
            href={`mailto:${supportEmail}`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <Mail className="w-4 h-4" /> {supportEmail}
          </a>
        )}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        )}
      </div>
    </div>
  );
}
