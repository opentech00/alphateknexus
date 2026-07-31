// RBAC Types and Interfaces
export type PermissionCategory = 'bookings' | 'customers' | 'finance' | 'employees' | 'settings' | 'reports' | 'audit' | 'divisions';

export interface PermissionDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: PermissionCategory;
  is_sensitive: boolean;
  created_at: string;
}

export interface RbacDepartment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  manager?: Profile | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  color_code: string | null;
  department_id: string | null;
  department?: RbacDepartment | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  permissions?: PermissionDefinition[];
  permission_count?: number;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  granted_at: string;
  granted_by: string | null;
  permission?: PermissionDefinition;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  department_id: string | null;
  is_primary: boolean;
  assigned_at: string;
  assigned_by: string | null;
  expires_at: string | null;
  role?: Role;
  department?: RbacDepartment | null;
  assigned_by_user?: Profile | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  status: 'success' | 'failure';
  changes: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  } | null;
  ip_address: string | null;
  user_agent: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  user?: Profile | null;
}

export interface UserPermissions {
  permission_code: string;
  permission_name: string;
  category: PermissionCategory;
}

export interface UserRoles {
  role_id: string;
  role_name: string;
  department_id: string | null;
  department_name: string | null;
  is_primary: boolean;
}

export interface RbacContextValue {
  permissions: string[]; // permission codes
  roles: UserRoles[];
  departments: RbacDepartment[];
  hasPermission: (permissionCode: string) => boolean;
  hasAnyPermission: (permissionCodes: string[]) => boolean;
  hasAllPermissions: (permissionCodes: string[]) => boolean;
  isInDepartment: (departmentId: string) => boolean;
  loading: boolean;
  error: string | null;
}

export interface AuditLogFilters {
  user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  status?: 'success' | 'failure';
  date_from?: Date;
  date_to?: Date;
  limit?: number;
  offset?: number;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  department_id?: string | null;
  color_code?: string;
  permission_ids: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  department_id?: string | null;
  color_code?: string;
  is_active?: boolean;
  permission_ids?: string[];
}

export interface AssignRoleInput {
  user_id: string;
  role_id: string;
  department_id?: string | null;
  is_primary?: boolean;
  expires_at?: Date | null;
}

// Import this into your main types.ts
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'user' | 'admin'; // Legacy support
  created_at: string;
  referral_code: string | null;
  avatar_url: string | null;
  address: string | null;
  // RBAC additions
  rbac_roles?: UserRoles[];
  rbac_permissions?: string[];
}
