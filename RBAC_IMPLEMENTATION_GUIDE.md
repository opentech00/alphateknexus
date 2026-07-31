# Comprehensive Role-Based Access Control (RBAC) Implementation Guide

## Overview

AlphaTek Nexus now features a sophisticated, production-ready RBAC system providing granular permission management, custom role creation, department-based access control, and comprehensive audit logging.

## Architecture

### Core Components

1. **Database Layer** (`supabase/migrations/20260730_implement_comprehensive_rbac.sql`)
   - `permission_definitions` - Master list of all permissions (60+ predefined)
   - `roles` - Role definitions (system and custom)
   - `role_permissions` - Mapping of permissions to roles
   - `user_role_assignments` - User-role associations with departments
   - `rbac_departments` - Department/team groupings
   - `audit_logs` - Comprehensive activity tracking

2. **Service Layer** (`src/lib/rbacService.ts`)
   - `permissionService` - Permission queries and checks
   - `rolesService` - Role CRUD and management
   - `userRolesService` - User role assignments
   - `departmentsService` - Department management
   - `auditService` - Audit logging and querying

3. **Context Layer** (`src/contexts/RbacContext.tsx`)
   - `RbacProvider` - Global permission state management
   - `useRbac()` - Hook for accessing RBAC context
   - `PermissionGuard` - Component for conditional rendering

4. **UI Layer**
   - `RoleManagementPanel` - Create/edit/delete roles
   - `UserRoleAssignmentPanel` - Assign roles to users
   - `DepartmentManagementPanel` - Manage departments
   - `AuditLogViewer` - View and export audit logs

## Permission Categories

### 1. **Bookings** (4 permissions)
- `view_bookings` - View all bookings
- `manage_bookings` - Create, edit, update booking status
- `approve_quotes` - Review and approve quote requests
- `delete_bookings` - Delete booking records

### 2. **Customers** (5 permissions)
- `view_customers` - View customer profiles
- `manage_customers` - Create, edit, delete customers
- `view_customer_documents` - Access customer documents
- `manage_customer_documents` - Upload/delete documents
- `message_customers` - Send messages to customers

### 3. **Finance** (4 permissions)
- `view_finance` - View financial reports
- `manage_finance` - Process payments/invoices
- `approve_payments` - Approve payment transactions
- `manage_wallet` - Adjust customer wallets

### 4. **Employees** (4 permissions)
- `view_employees` - View employee records
- `manage_employees` - Create/edit/delete employees
- `manage_employee_roles` - Assign employee roles
- `view_employee_activity` - View activity logs

### 5. **Settings/RBAC** (4 permissions)
- `view_rbac` - View RBAC settings
- `manage_roles` - Create/edit/delete roles
- `manage_permissions` - Assign permissions to roles
- `manage_users` - Manage user accounts

### 6. **Reports** (3 permissions)
- `view_analytics` - Access analytics dashboards
- `view_reports` - Generate and view reports
- `export_data` - Export business data

### 7. **Audit** (3 permissions)
- `view_audit_logs` - Access audit logs
- `manage_audit_logs` - Archive/delete audit records
- `view_compliance` - View compliance reports

### 8. **Divisions** (5 permissions)
- `manage_division_cf` - Full access to Clearing & Forwarding
- `manage_division_ss` - Full access to Smart Sort
- `manage_division_clean` - Full access to Cleaning Services
- `manage_division_security` - Full access to Private Security
- `manage_division_procurement` - Full access to Procurement

## Default System Roles

### 1. **Super Admin**
- All permissions granted
- Full system access
- Cannot be modified

### 2. **Admin**
- All permissions except `manage_audit_logs`
- Can create custom roles
- Cannot manage audit log deletion

### 3. **Manager**
- Operational permissions: bookings, customers, finance (read), employees, reports, audit (read)
- Can manage their team
- Cannot manage roles or permissions

### 4. **Supervisor**
- Limited management permissions
- Can view and manage operational data
- Cannot manage users or roles

### 5. **Operator**
- Basic operational permissions
- Can view and manage assigned work
- Limited reporting access

### 6. **Viewer**
- Read-only access to most modules
- Can view reports and analytics
- Cannot make any changes

## Usage Guide

### For Administrators

#### Creating a Custom Role

1. Navigate to **Admin → Access Control → Roles**
2. Click **New Role**
3. Enter role details:
   - **Name**: Unique role identifier (e.g., "Finance Approver")
   - **Description**: Role purpose and responsibilities
   - **Color**: Visual identifier for UI display
4. Select permissions by category:
   - Review each category carefully
   - Check required permissions (red icons indicate sensitive operations)
5. Click **Save Role**
6. Audit log entry created automatically

#### Assigning Roles to Users

1. Navigate to **Admin → Access Control → User Access**
2. Search for the user
3. Click user card to expand details
4. Click **Assign Role**
5. Configure assignment:
   - **Role**: Select from available roles
   - **Department**: Assign to specific department (optional)
   - **Primary**: Mark as primary role (default user role)
   - **Expiration**: Set temporary access (optional)
6. Click **Assign Role**
7. Set as primary using the ★ icon if needed
8. Remove roles using the ✕ icon

#### Managing Departments

1. Navigate to **Admin → Access Control → Departments**
2. Create/edit departments:
   - **Code**: Unique identifier (auto-uppercase)
   - **Name**: Department display name
   - **Description**: Purpose and scope
   - **Manager**: Assign department manager
   - **Active**: Enable/disable department
3. Departments can scope role assignments and control data access

#### Reviewing Audit Logs

1. Navigate to **Admin → Access Control → Audit Logs**
2. Search and filter logs:
   - **Action Type**: Filter by action (create, update, delete, etc.)
   - **Resource Type**: Filter by resource (role, user, permission)
   - **Status**: Success or failure
   - **Date Range**: Time-based filtering
3. Click log entry to view detailed changes:
   - User who performed action
   - Before/after values
   - IP address and metadata
4. **Export**: Download audit trail as CSV for compliance

### For Developers

#### Checking Permissions in Components

```typescript
import { usePermission, useAnyPermission, useAllPermissions } from '@/contexts/RbacContext';

function MyComponent() {
  // Single permission
  const canEdit = usePermission('manage_bookings');
  
  // Any of multiple permissions
  const canModify = useAnyPermission(['manage_bookings', 'manage_customers']);
  
  // All permissions required
  const isApprover = useAllPermissions(['approve_payments', 'approve_quotes']);
  
  if (!canEdit) return <div>Access Denied</div>;
  
  return <div>Edit Form</div>;
}
```

#### Using PermissionGuard Component

```typescript
import { PermissionGuard } from '@/contexts/RbacContext';

function MyComponent() {
  return (
    <>
      <PermissionGuard permission="manage_bookings">
        <button>Edit Booking</button>
      </PermissionGuard>
      
      {/* Multiple permissions - require all */}
      <PermissionGuard 
        permissions={['manage_finance', 'approve_payments']} 
        requireAll={true}
        fallback={<p>Insufficient permissions</p>}
      >
        <button>Process Payment</button>
      </PermissionGuard>
      
      {/* Multiple permissions - require any */}
      <PermissionGuard permissions={['view_analytics', 'view_reports']}>
        <button>View Reports</button>
      </PermissionGuard>
    </>
  );
}
```

#### Accessing User Permissions Programmatically

```typescript
import { permissionService, userRolesService } from '@/lib/rbacService';

// Get all user permissions
const permissions = await permissionService.getUserPermissions(userId);

// Check single permission
const canDelete = await permissionService.hasPermission(userId, 'delete_bookings');

// Check multiple permissions
const perms = await permissionService.hasPermissions(userId, [
  'manage_bookings', 
  'approve_quotes'
]);

// Get user roles
const roles = await userRolesService.getUserRoles(userId);
```

#### Logging Audit Events

```typescript
import { auditService } from '@/lib/rbacService';

// Log a successful action
await auditService.logAction(
  'delete_booking',
  'booking',
  bookingId,
  bookingName,
  {
    status: 'success',
    changes: {
      before: { status: 'confirmed' },
      after: { status: 'deleted' }
    }
  }
);

// Log a failed action
await auditService.logAction(
  'approve_payment',
  'payment',
  paymentId,
  paymentName,
  {
    status: 'failure',
    errorMessage: 'Insufficient funds'
  }
);
```

#### Creating Roles Programmatically

```typescript
import { rolesService } from '@/lib/rbacService';

const newRole = await rolesService.createRole(
  {
    name: 'Custom Viewer',
    description: 'Read-only access to reports',
    color_code: 'blue',
    permission_ids: [/* permission IDs */]
  },
  currentUserId
);
```

## Security Best Practices

### 1. **Principle of Least Privilege**
- Assign minimum necessary permissions
- Review permissions quarterly
- Remove unused roles

### 2. **Role Segregation**
- Separate conflicting duties
- Use specific roles, not blanket admin
- Implement approval workflows

### 3. **Audit Monitoring**
- Review audit logs regularly
- Alert on sensitive operations
- Export logs for compliance
- Archive sensitive operations

### 4. **Access Review**
- Quarterly review of role assignments
- Remove users from roles when they change positions
- Use temporary assignments for contractors

### 5. **Permission Naming**
- Use consistent naming convention
- Document permission purposes
- Flag sensitive operations
- Group related permissions

## Database Schema

### permission_definitions
```sql
- id (UUID, PK)
- code (TEXT, UNIQUE) -- e.g., 'manage_bookings'
- name (TEXT) -- User-friendly name
- description (TEXT) -- What the permission allows
- category (TEXT) -- Grouping category
- is_sensitive (BOOLEAN) -- Triggers audit logging
- created_at (TIMESTAMPTZ)
```

### roles
```sql
- id (UUID, PK)
- name (TEXT, UNIQUE)
- description (TEXT)
- is_system_role (BOOLEAN)
- is_active (BOOLEAN)
- color_code (TEXT) -- For UI display
- department_id (UUID, FK)
- created_by (UUID, FK)
- created_at, updated_at (TIMESTAMPTZ)
```

### role_permissions
```sql
- id (UUID, PK)
- role_id (UUID, FK)
- permission_id (UUID, FK)
- granted_at (TIMESTAMPTZ)
- granted_by (UUID, FK)
- UNIQUE(role_id, permission_id)
```

### user_role_assignments
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- role_id (UUID, FK)
- department_id (UUID, FK) -- Department-scoped access
- is_primary (BOOLEAN) -- User's main role
- assigned_at (TIMESTAMPTZ)
- assigned_by (UUID, FK)
- expires_at (TIMESTAMPTZ) -- Temporary assignments
- UNIQUE(user_id, role_id, department_id)
```

### rbac_departments
```sql
- id (UUID, PK)
- code (TEXT, UNIQUE) -- e.g., 'FIN', 'HR', 'OPS'
- name (TEXT)
- description (TEXT)
- manager_id (UUID, FK)
- is_active (BOOLEAN)
- created_at, updated_at (TIMESTAMPTZ)
```

### audit_logs
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- action (TEXT) -- e.g., 'create_role', 'delete_booking'
- resource_type (TEXT) -- e.g., 'role', 'booking'
- resource_id (TEXT)
- resource_name (TEXT)
- status (TEXT) -- 'success' or 'failure'
- changes (JSONB) -- {before: {}, after: {}}
- ip_address (TEXT)
- user_agent (TEXT)
- error_message (TEXT)
- metadata (JSONB)
- created_at (TIMESTAMPTZ)
```

## API Functions

### SQL Functions

```sql
-- Get user permissions
SELECT * FROM get_user_permissions(p_user_id);

-- Check single permission
SELECT has_permission(p_user_id, 'manage_bookings');

-- Get user roles
SELECT * FROM get_user_roles(p_user_id);

-- Log audit action
SELECT log_audit_action(
  p_action := 'delete_booking',
  p_resource_type := 'booking',
  p_resource_id := '...',
  p_resource_name := 'Booking #123'
);
```

## Compliance & Audit

### Sensitive Operations Tracked
- Role creation, modification, deletion
- Permission assignment changes
- User role assignments
- Bookings deletion
- Finance operations
- Audit log deletion

### Audit Export
- CSV format for compliance tools
- All fields included
- Timestamp and user info
- Before/after values for changes

### Retention Policy
- Keep audit logs for minimum 2 years
- Archive older logs regularly
- Enable audit log backups

## Troubleshooting

### User Can't Access Feature
1. Check user's roles: **Admin → Access Control → User Access**
2. Verify role has required permission
3. Check department assignment (if applicable)
4. Review audit logs for permission changes
5. Verify role is active

### Permission Not Working
1. Verify permission code is correct
2. Check role has permission assigned
3. Ensure user has the role
4. Review RLS policies in Supabase
5. Check browser console for errors

### Audit Logs Not Recording
1. Verify `audit_logs` table exists
2. Check RLS policies allow logging
3. Enable database logs in Supabase
4. Verify app is calling audit functions

## Future Enhancements

1. **Time-Based Access** - Schedule access (9AM-5PM)
2. **Conditional Permissions** - Based on IP, location, device
3. **Approval Workflows** - Multi-step approvals for sensitive actions
4. **Permission Inheritance** - Role hierarchies
5. **Integration with SSO** - Azure AD, Google Workspace sync
6. **Real-time Notifications** - Alert on sensitive operations
7. **Access Review Workflows** - Automated compliance reviews
8. **Fine-Grained Field Access** - Column-level permissions
9. **Attribute-Based Access Control** - More complex rule engines
10. **OAuth Scopes** - For API access tokens

## Support & Questions

For implementation questions or issues:
1. Review this documentation
2. Check audit logs for error details
3. Consult the database schema
4. Review permission definitions in database
5. Test with admin account first

---

**Last Updated:** July 30, 2026
**Version:** 1.0.0
**Status:** Production Ready
