import { supabase } from './supabase';
import type {
  PermissionDefinition,
  Role,
  UserRoleAssignment,
  UserPermissions,
  UserRoles,
  AuditLog,
  AuditLogFilters,
  CreateRoleInput,
  UpdateRoleInput,
  AssignRoleInput,
  RbacDepartment,
} from '../types/rbac';

/**
 * PERMISSIONS SERVICE
 * Handles all permission-related operations
 */
export const permissionService = {
  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<PermissionDefinition[]> {
    const { data, error } = await supabase
      .from('permission_definitions')
      .select('*')
      .order('category, name');
    if (error) throw error;
    return data || [];
  },

  /**
   * Get permissions by category
   */
  async getPermissionsByCategory(category: string): Promise<PermissionDefinition[]> {
    const { data, error } = await supabase
      .from('permission_definitions')
      .select('*')
      .eq('category', category)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  /**
   * Get user's permission codes
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_user_permissions', {
      p_user_id: userId,
    });
    if (error) throw error;
    return (data as UserPermissions[])?.map((p) => p.permission_code) || [];
  },

  /**
   * Check if user has specific permission
   */
  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('has_permission', {
      p_user_id: userId,
      p_permission_code: permissionCode,
    });
    if (error) throw error;
    return Boolean(data);
  },

  /**
   * Batch check permissions (more efficient)
   */
  async hasPermissions(
    userId: string,
    permissionCodes: string[]
  ): Promise<Record<string, boolean>> {
    const permissions = await this.getUserPermissions(userId);
    const result: Record<string, boolean> = {};
    permissionCodes.forEach((code) => {
      result[code] = permissions.includes(code);
    });
    return result;
  },
};

/**
 * ROLES SERVICE
 * Handles role management
 */
export const rolesService = {
  /**
   * Get all roles with permissions
   */
  async getAllRoles(includeInactive = false): Promise<Role[]> {
    let query = supabase
      .from('roles')
      .select(
        `*,
         role_permissions (
           id,
           permission_id,
           granted_at,
           granted_by,
           permission_definitions (*)
         )`
      );

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('name');
    if (error) throw error;

    return (data as any[])?.map((role) => ({
      ...role,
      permissions: role.role_permissions?.map((rp: any) => rp.permission_definitions) || [],
      permission_count: role.role_permissions?.length || 0,
    })) || [];
  },

  /**
   * Get role by ID with permissions
   */
  async getRoleById(roleId: string): Promise<Role | null> {
    const { data, error } = await supabase
      .from('roles')
      .select(
        `*,
         role_permissions (
           id,
           permission_id,
           granted_at,
           granted_by,
           permission_definitions (*)
         )`
      )
      .eq('id', roleId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      permissions: (data as any).role_permissions?.map((rp: any) => rp.permission_definitions) || [],
      permission_count: (data as any).role_permissions?.length || 0,
    };
  },

  /**
   * Create new role
   */
  async createRole(input: CreateRoleInput, createdBy: string): Promise<Role> {
    const { name, description, department_id, color_code, permission_ids } = input;

    // Create role
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .insert({
        name,
        description,
        department_id,
        color_code,
        created_by: createdBy,
      })
      .select()
      .single();

    if (roleError) throw roleError;

    // Add permissions
    if (permission_ids.length > 0) {
      const { error: permError } = await supabase.from('role_permissions').insert(
        permission_ids.map((permId) => ({
          role_id: roleData.id,
          permission_id: permId,
          granted_by: createdBy,
        }))
      );
      if (permError) throw permError;
    }

    // Log audit
    await auditService.logAction('create_role', 'role', roleData.id, name);

    return roleData;
  },

  /**
   * Update role
   */
  async updateRole(roleId: string, input: UpdateRoleInput, userId: string): Promise<Role> {
    const { name, description, department_id, color_code, is_active, permission_ids } = input;

    // Check if system role
    const role = await this.getRoleById(roleId);
    if (role?.is_system_role) {
      throw new Error('Cannot modify system roles');
    }

    // Update role
    const { data: updatedRole, error: updateError } = await supabase
      .from('roles')
      .update({
        name,
        description,
        department_id,
        color_code,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roleId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update permissions if provided
    if (permission_ids) {
      // Delete existing permissions
      await supabase.from('role_permissions').delete().eq('role_id', roleId);

      // Add new permissions
      if (permission_ids.length > 0) {
        const { error: permError } = await supabase.from('role_permissions').insert(
          permission_ids.map((permId) => ({
            role_id: roleId,
            permission_id: permId,
            granted_by: userId,
          }))
        );
        if (permError) throw permError;
      }
    }

    // Log audit
    await auditService.logAction('update_role', 'role', roleId, name || updatedRole.name);

    return updatedRole;
  },

  /**
   * Delete role (custom roles only)
   */
  async deleteRole(roleId: string): Promise<void> {
    const role = await this.getRoleById(roleId);
    if (!role) throw new Error('Role not found');
    if (role.is_system_role) throw new Error('Cannot delete system roles');

    const { error } = await supabase.from('roles').delete().eq('id', roleId);
    if (error) throw error;

    await auditService.logAction('delete_role', 'role', roleId, role.name);
  },
};

/**
 * USER ROLES SERVICE
 * Handles user role assignments
 */
export const userRolesService = {
  /**
   * Get user's roles
   */
  async getUserRoles(userId: string): Promise<UserRoles[]> {
    const { data, error } = await supabase.rpc('get_user_roles', {
      p_user_id: userId,
    });
    if (error) throw error;
    return (data as UserRoles[]) || [];
  },

  /**
   * Get all role assignments for a user
   */
  async getUserRoleAssignments(userId: string): Promise<UserRoleAssignment[]> {
    const { data, error } = await supabase
      .from('user_role_assignments')
      .select(
        `*,
         role:roles (*),
         department:rbac_departments (*)
       `
      )
      .eq('user_id', userId)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Assign role to user
   */
  async assignRole(input: AssignRoleInput, assignedBy: string): Promise<UserRoleAssignment> {
    const { user_id, role_id, department_id, is_primary = false, expires_at } = input;

    // If setting as primary, remove other primary assignments
    if (is_primary) {
      await supabase
        .from('user_role_assignments')
        .update({ is_primary: false })
        .eq('user_id', user_id);
    }

    const { data, error } = await supabase
      .from('user_role_assignments')
      .insert({
        user_id,
        role_id,
        department_id,
        is_primary,
        assigned_by: assignedBy,
        expires_at,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint - update instead
        const { data: existing } = await supabase
          .from('user_role_assignments')
          .select('id')
          .eq('user_id', user_id)
          .eq('role_id', role_id)
          .eq('department_id', department_id || null)
          .single();

        if (existing) {
          return supabase
            .from('user_role_assignments')
            .update({ is_primary, expires_at, assigned_by: assignedBy })
            .eq('id', existing.id)
            .select()
            .single()
            .then(({ data }) => data as UserRoleAssignment);
        }
      }
      throw error;
    }

    // Log audit
    const role = await rolesService.getRoleById(role_id);
    await auditService.logAction('assign_role', 'user_role', user_id, role?.name, {
      metadata: { department_id },
    });

    return data;
  },

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string): Promise<void> {
    const { error } = await supabase
      .from('user_role_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId);

    if (error) throw error;

    const role = await rolesService.getRoleById(roleId);
    await auditService.logAction('remove_role', 'user_role', userId, role?.name);
  },

  /**
   * Set primary role
   */
  async setPrimaryRole(userId: string, roleId: string): Promise<void> {
    // Remove current primary
    await supabase
      .from('user_role_assignments')
      .update({ is_primary: false })
      .eq('user_id', userId)
      .eq('is_primary', true);

    // Set new primary
    const { error } = await supabase
      .from('user_role_assignments')
      .update({ is_primary: true })
      .eq('user_id', userId)
      .eq('role_id', roleId);

    if (error) throw error;

    await auditService.logAction('set_primary_role', 'user_role', userId);
  },
};

/**
 * DEPARTMENTS SERVICE
 * Handles department management
 */
export const departmentsService = {
  /**
   * Get all departments
   */
  async getAllDepartments(includeInactive = false): Promise<RbacDepartment[]> {
    let query = supabase
      .from('rbac_departments')
      .select('*');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('name');
    if (error) throw error;
    return data || [];
  },

  /**
   * Get department by ID
   */
  async getDepartmentById(departmentId: string): Promise<RbacDepartment | null> {
    const { data, error } = await supabase
      .from('rbac_departments')
      .select('*')
      .eq('id', departmentId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },
};

/**
 * AUDIT SERVICE
 * Handles audit logging
 */
export const auditService = {
  /**
   * Log an action
   */
  async logAction(
    action: string,
    resourceType: string,
    resourceId: string | null = null,
    resourceName: string | null = null,
    options: {
      status?: 'success' | 'failure';
      changes?: Record<string, any>;
      errorMessage?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    const { status = 'success', changes, errorMessage, metadata } = options;

    const { data, error } = await supabase.rpc('log_audit_action', {
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_resource_name: resourceName,
      p_status: status,
      p_changes: changes,
      p_error_message: errorMessage,
      p_metadata: metadata,
    });

    if (error) throw error;
    return data as string;
  },

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    const { user_id, action, resource_type, resource_id, status, date_from, date_to, limit = 100, offset = 0 } =
      filters;

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (user_id) query = query.eq('user_id', user_id);
    if (action) query = query.eq('action', action);
    if (resource_type) query = query.eq('resource_type', resource_type);
    if (resource_id) query = query.eq('resource_id', resource_id);
    if (status) query = query.eq('status', status);

    if (date_from) {
      query = query.gte('created_at', date_from.toISOString());
    }
    if (date_to) {
      query = query.lte('created_at', date_to.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Get audit logs for a resource
   */
  async getResourceAuditLogs(resourceType: string, resourceId: string): Promise<AuditLog[]> {
    return this.getAuditLogs({
      resource_type: resourceType,
      resource_id: resourceId,
      limit: 1000,
    });
  },

  /**
   * Get sensitive operations (for compliance)
   */
  async getSensitiveOperations(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    const { user_id, date_from, date_to, limit = 100, offset = 0 } = filters;

    const sensitiveTasks = [
      'delete_booking',
      'manage_permission',
      'manage_role',
      'manage_finance',
      'delete_user',
      'update_user_role',
    ];

    let query = supabase
      .from('audit_logs')
      .select('*')
      .in('action', sensitiveTasks)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (user_id) query = query.eq('user_id', user_id);
    if (date_from) query = query.gte('created_at', date_from.toISOString());
    if (date_to) query = query.lte('created_at', date_to.toISOString());

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Export audit logs (for compliance reports)
   */
  async exportAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    return this.getAuditLogs({ ...filters, limit: 10000 });
  },
};
