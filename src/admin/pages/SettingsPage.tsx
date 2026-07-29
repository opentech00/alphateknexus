import { Settings, Bell, Globe, Shield, Database } from 'lucide-react';
import { PageHeader } from '../components/ui';

export function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Settings"
        description="Configure system preferences and admin options"
        icon={Settings}
      />

      <div className="space-y-3">
        <SettingCard
          icon={<Bell className="w-5 h-5 text-blue-600" />}
          title="Notifications"
          description="Configure email and push notification preferences for admin alerts"
        />
        <SettingCard
          icon={<Globe className="w-5 h-5 text-emerald-600" />}
          title="Portal Settings"
          description="Manage client portal visibility, branding, and access controls"
        />
        <SettingCard
          icon={<Shield className="w-5 h-5 text-amber-600" />}
          title="Security"
          description="Two-factor authentication, session management, and audit logs"
        />
        <SettingCard
          icon={<Database className="w-5 h-5 text-slate-600" />}
          title="Data & Exports"
          description="Export reports, manage backups, and configure data retention policies"
        />
        <SettingCard
          icon={<Settings className="w-5 h-5 text-rose-600" />}
          title="System"
          description="API keys, webhook configuration, and integrations"
        />
      </div>
    </div>
  );
}

function SettingCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="text-slate-300 group-hover:text-slate-500 transition-colors">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
