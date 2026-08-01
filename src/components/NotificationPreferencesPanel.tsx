import { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, Smartphone, Calendar, CreditCard, MessageCircle, Truck, Users, AlertTriangle, Recycle, Info, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface NotificationPrefs {
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  cat_bookings: boolean;
  cat_payments: boolean;
  cat_messages: boolean;
  cat_field_dispatch: boolean;
  cat_hr: boolean;
  cat_incidents: boolean;
  cat_smart_sort: boolean;
  cat_system: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_enabled: true,
  push_enabled: true,
  in_app_enabled: true,
  cat_bookings: true,
  cat_payments: true,
  cat_messages: true,
  cat_field_dispatch: true,
  cat_hr: true,
  cat_incidents: true,
  cat_smart_sort: true,
  cat_system: true,
};

interface CategoryConfig {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  icon: typeof Calendar;
}

const CATEGORIES: CategoryConfig[] = [
  { key: 'cat_bookings', label: 'Bookings', description: 'Booking created, updated, cancelled, or completed', icon: Calendar },
  { key: 'cat_payments', label: 'Payments', description: 'Payment verified, rejected, wallet top-ups, withdrawals', icon: CreditCard },
  { key: 'cat_messages', label: 'Messages', description: 'New messages from admin or support', icon: MessageCircle },
  { key: 'cat_smart_sort', label: 'Smart Sort', description: 'Pickup reminders and subscription renewals', icon: Recycle },
  { key: 'cat_system', label: 'System', description: 'Announcements and system-wide notices', icon: Info },
];

interface ChannelToggleProps {
  icon: typeof Bell;
  label: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}

function ChannelToggle({ icon: Icon, label, enabled, onChange }: ChannelToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 flex items-center justify-center rounded-lg ${enabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          <Icon className={`w-5 h-5 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
        </div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

interface CategoryToggleProps {
  icon: typeof Calendar;
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}

function CategoryToggle({ icon: Icon, label, description, enabled, onChange }: CategoryToggleProps) {
  return (
    <div className="flex items-start justify-between py-3 gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${enabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          <Icon className={`w-5 h-5 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${enabled ? 'text-slate-700' : 'text-slate-500'}`}>{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-1 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function NotificationPreferencesPanel({ dark }: { dark?: boolean }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const fetchPrefs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setPrefs(data as NotificationPrefs);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const updatePref = async (key: keyof NotificationPrefs, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaving(true);
    try {
      await supabase
        .from('notification_preferences')
        .upsert({ user_id: user!.id, [key]: value, updated_at: new Date().toISOString() });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const cardClass = dark
    ? 'bg-slate-800/50 border-slate-700'
    : 'bg-white border-slate-200';
  const sectionTitleClass = dark ? 'text-slate-200' : 'text-slate-800';
  const dividerClass = dark ? 'divide-slate-700' : 'divide-slate-100';

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${cardClass} overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-semibold ${sectionTitleClass}`}>Delivery Channels</h3>
            {saving && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            {showSaved && <span className="text-xs text-emerald-500 font-medium">Saved</span>}
          </div>
        </div>
        <div className={`px-5 divide-y ${dividerClass}`}>
          <ChannelToggle icon={Bell} label="In-App Notifications" enabled={prefs.in_app_enabled} onChange={(v) => updatePref('in_app_enabled', v)} />
          <ChannelToggle icon={Mail} label="Email Notifications" enabled={prefs.email_enabled} onChange={(v) => updatePref('email_enabled', v)} />
          <ChannelToggle icon={Smartphone} label="Push Notifications" enabled={prefs.push_enabled} onChange={(v) => updatePref('push_enabled', v)} />
        </div>
      </div>

      <div className={`rounded-xl border ${cardClass} overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
          <h3 className={`text-sm font-semibold ${sectionTitleClass}`}>Categories</h3>
          <p className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            Choose which types of notifications you want to receive
          </p>
        </div>
        <div className={`px-5 divide-y ${dividerClass}`}>
          {CATEGORIES.map((cat) => (
            <CategoryToggle
              key={cat.key}
              icon={cat.icon}
              label={cat.label}
              description={cat.description}
              enabled={prefs[cat.key]}
              onChange={(v) => updatePref(cat.key, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
