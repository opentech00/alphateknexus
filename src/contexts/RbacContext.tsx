import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { permissionService, userRolesService, departmentsService } from '../lib/rbacService';
import type { RbacContextValue, UserRoles, RbacDepartment } from '../types/rbac';

const RbacContext = createContext<RbacContextValue | undefined>(undefined);

export function RbacProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<UserRoles[]>([]);
  const [departments, setDepartments] = useState<RbacDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setRoles([]);
      setLoading(false);
      return;
    }

    const loadRbac = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load user's permissions, roles, and departments in parallel
        const [userPerms, userRoles, allDepts] = await Promise.all([
          permissionService.getUserPermissions(user.id),
          userRolesService.getUserRoles(user.id),
          departmentsService.getAllDepartments(),
        ]);

        setPermissions(userPerms);
        setRoles(userRoles);
        setDepartments(allDepts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load RBAC');
        console.error('RBAC loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRbac();
  }, [user?.id]);

  const hasPermission = (permissionCode: string): boolean => {
    return permissions.includes(permissionCode);
  };

  const hasAnyPermission = (permissionCodes: string[]): boolean => {
    return permissionCodes.some((code) => permissions.includes(code));
  };

  const hasAllPermissions = (permissionCodes: string[]): boolean => {
    return permissionCodes.every((code) => permissions.includes(code));
  };

  const isInDepartment = (departmentId: string): boolean => {
    return roles.some((role) => role.department_id === departmentId);
  };

  const value: RbacContextValue = {
    permissions,
    roles,
    departments,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isInDepartment,
    loading,
    error,
  };

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac() {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error('useRbac must be used within RbacProvider');
  return ctx;
}

/**
 * Hook to check a single permission
 */
export function usePermission(permissionCode: string): boolean {
  const { hasPermission } = useRbac();
  return hasPermission(permissionCode);
}

/**
 * Hook to check multiple permissions (any match)
 */
export function useAnyPermission(permissionCodes: string[]): boolean {
  const { hasAnyPermission } = useRbac();
  return hasAnyPermission(permissionCodes);
}

/**
 * Hook to check multiple permissions (all match)
 */
export function useAllPermissions(permissionCodes: string[]): boolean {
  const { hasAllPermissions } = useRbac();
  return hasAllPermissions(permissionCodes);
}

/**
 * Component to conditionally render based on permissions
 */
interface PermissionGuardProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const rbac = useRbac();

  if (rbac.loading) return null;

  let hasAccess = true;

  if (permission) {
    hasAccess = rbac.hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll ? rbac.hasAllPermissions(permissions) : rbac.hasAnyPermission(permissions);
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
