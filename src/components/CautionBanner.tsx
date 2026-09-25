import { useState } from 'react';
import { AlertTriangle, Construction, X } from 'lucide-react';

export function CautionBanner({
  tone = 'amber',
  title,
  message,
  onDismiss,
}: {
  tone?: 'amber' | 'red';
  title: string;
  message: string;
  onDismiss?: () => void;
}) {
  const Icon = tone === 'red' ? Construction : AlertTriangle;
  return (
    <div
      role="status"
      className={`caution-banner relative overflow-hidden border-b px-3 sm:px-4 py-2.5 ${
        tone === 'red'
          ? 'caution-banner-red'
          : 'caution-banner-amber'
      }`}
    >
      <div className="caution-banner-stripes" aria-hidden="true" />
      <div className="relative max-w-5xl mx-auto flex items-start gap-2.5">
        <span className="caution-banner-icon mt-0.5 flex-shrink-0">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          <p className="text-xs sm:text-sm leading-relaxed mt-0.5 opacity-90">{message}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 min-h-[44px] min-w-[44px] -mr-1 -mt-1 inline-flex items-center justify-center rounded-lg opacity-80 hover:opacity-100"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function PortalCautionStack({
  announcementEnabled,
  announcement,
  portalClosed,
}: {
  announcementEnabled: boolean;
  announcement: string;
  portalClosed: boolean;
}) {
  const [hideAnnounce, setHideAnnounce] = useState(false);
  const showAnnounce = announcementEnabled && !!announcement.trim() && !hideAnnounce;

  if (!portalClosed && !showAnnounce) return null;

  return (
    <div className="sticky top-0 md:top-16 z-[45] animate-slideDown">
      {portalClosed && (
        <CautionBanner
          tone="red"
          title="Client portal is in maintenance"
          message="Customers see a maintenance screen. Admin, employee, and field apps stay available."
        />
      )}
      {showAnnounce && (
        <CautionBanner
          tone="amber"
          title="Notice"
          message={announcement.trim()}
          onDismiss={() => setHideAnnounce(true)}
        />
      )}
    </div>
  );
}
