import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AdminPermissionsState {
  loading: boolean;
  allowedPages: Set<string>;
  isSuperAdmin: boolean;
  hasPermission: (pageKey: string) => boolean;
  refresh: () => void;
}

const ALL_PAGES = [
  'overview', 'analytics', 'bookings', 'documents', 'clients', 'divisions',
  'division-cf', 'division-smart-sort', 'division-cleaning', 'division-security',
  'division-procurement', 'wallet', 'booking-review', 'messages', 'users',
  'reviews', 'bundles', 'referrals', 'field-dispatch', 'field-job-review',
  'field-incidents', 'finance', 'task-delegation', 'backup', 'admin-sessions',
  'settings', 'notification-log', 'hr-dashboard', 'hr-employees', 'hr-roles',
  'hr-id-cards', 'hr-activity', 'hr-directory', 'hr-permissions',
  'media-library',
];

export function useAdminPermissions(profile: Profile | null, isAdmin: boolean): AdminPermissionsState {
  const [allowedPages, setAllowedPages] = useState<Set<string>>(new Set(ALL_PAGES));
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!isAdmin || !profile) {
      setAllowedPages(new Set(ALL_PAGES));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // Super admin (no admin_role_id) gets full access
      if (!profile.admin_role_id) {
        if (!cancelled) {
          setAllowedPages(new Set(ALL_PAGES));
          setLoading(false);
        }
        return;
      }

      // Load permissions for this admin's HR role
      const { data, error } = await supabase
        .from('hr_role_permissions')
        .select('page_key, can_access')
        .eq('role_id', profile.admin_role_id)
        .eq('can_access', true);

      if (cancelled) return;

      if (error || !data) {
        setAllowedPages(new Set());
      } else {
        setAllowedPages(new Set(data.map(p => p.page_key)));
      }
      setLoading(false);
    };

    load();

    return () => { cancelled = true; };
  }, [profile, isAdmin, refreshKey]);

  const isSuperAdmin = isAdmin && !profile?.admin_role_id;

  const hasPermission = useCallback(
    (pageKey: string) => {
      if (!isAdmin) return false;
      if (!profile?.admin_role_id) return true; // super admin
      return allowedPages.has(pageKey);
    },
    [isAdmin, profile, allowedPages],
  );

  return { loading, allowedPages, isSuperAdmin, hasPermission, refresh };
}
