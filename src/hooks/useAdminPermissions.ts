import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { ADMIN_FINANCE_WORKSPACE_PAGES } from '../lib/capabilities';

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
  'division-procurement', 'booking-review', 'messages', 'users',
  'reviews', 'bundles', 'campaigns', 'referrals', 'field-dispatch', 'field-job-review',
  'field-incidents', 'finance', 'wallet', 'receipts', 'admin-finance',
  'finance-services', 'finance-cf', 'finance-smart-sort', 'finance-cleaning',
  'finance-security', 'finance-procurement',
  'task-delegation', 'backup', 'admin-sessions',
  'settings', 'notification-log', 'hr-dashboard', 'hr-employees', 'hr-roles',
  'hr-id-cards', 'hr-activity', 'hr-directory', 'hr-permissions',
  'hr-documents', 'hr-payslips', 'media-library',
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
      const [{ data, error }, { data: financeOps }] = await Promise.all([
        supabase
          .from('hr_role_permissions')
          .select('page_key, can_access')
          .eq('role_id', profile.admin_role_id)
          .eq('can_access', true),
        supabase.rpc('is_admin_finance_ops'),
      ]);

      if (cancelled) return;

      const pages = new Set<string>(error || !data ? [] : data.map(p => p.page_key));
      if (financeOps) {
        ADMIN_FINANCE_WORKSPACE_PAGES.forEach((page) => pages.add(page));
        pages.add('analytics');
      }
      setAllowedPages(pages);
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
