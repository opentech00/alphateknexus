# RBAC Quick Start Guide

## Quick Setup Checklist

- [ ] Run database migration: `20260730_implement_comprehensive_rbac.sql`
- [ ] Wrap app with `RbacProvider`
- [ ] Start using permission hooks and components

## In 5 Minutes

### 1. Add RbacProvider (Already Done in App.tsx)

```typescript
// src/App.tsx
import { RbacProvider } from './contexts/RbacContext';

export default function App() {
  return (
    <AuthProvider>
      <RbacProvider>
        <ThemeProvider>
          <PortalContent />
        </ThemeProvider>
      </RbacProvider>
    </AuthProvider>
  );
}
```

### 2. Check Permissions in Components

```typescript
import { usePermission, PermissionGuard } from '@/contexts/RbacContext';

// Method 1: Using hooks
function EditButton() {
  const canEdit = usePermission('manage_bookings');
  return canEdit ? <button>Edit</button> : null;
}

// Method 2: Using PermissionGuard
function DeleteButton() {
  return (
    <PermissionGuard permission="delete_bookings">
      <button>Delete</button>
    </PermissionGuard>
  );
}

// Method 3: Using RBAC context directly
function MyComponent() {
  const { hasPermission } = useRbac();
  
  return (
    <div>
      {hasPermission('view_analytics') && <Analytics />}
      {hasPermission('manage_users') && <UserMgmt />}
    </div>
  );
}
```

### 3. Common Permission Codes

```typescript
// Bookings
'view_bookings'
'manage_bookings'
'approve_quotes'
'delete_bookings'

// Customers
'view_customers'
'manage_customers'

// Finance
'view_finance'
'manage_finance'
'approve_payments'

// Management
'manage_roles'
'manage_permissions'
'manage_users'

// Audit
'view_audit_logs'

// Use in code:
if (usePermission('manage_bookings')) {
  // Show edit button
}
```

### 4. Admin Dashboard Access

Navigate to: **Admin Panel → Access Control**

Tabs available:
- **Overview** - Features & best practices
- **Roles** - Create and manage roles
- **User Access** - Assign roles to users
- **Departments** - Organize teams
- **Audit Logs** - View activity trail

## Common Tasks

### Protect a Feature

```typescript
// Option A: Simple check
const canDelete = usePermission('delete_bookings');
if (!canDelete) return <AccessDenied />;

// Option B: Guard component
<PermissionGuard permission="delete_bookings">
  <DeleteButton />
</PermissionGuard>

// Option C: Conditional UI
{usePermission('manage_users') && (
  <div>User management section</div>
)}
```

### Check Multiple Permissions

```typescript
import { useAnyPermission, useAllPermissions } from '@/contexts/RbacContext';

// User needs ANY of these
const isApprover = useAnyPermission([
  'approve_quotes',
  'approve_payments'
]);

// User needs ALL of these
const isFinanceManager = useAllPermissions([
  'manage_finance',
  'approve_payments',
  'view_audit_logs'
]);
```

### Create a Custom Role (Admin UI)

1. Go to **Admin → Access Control → Roles**
2. Click **New Role**
3. Fill in details
4. Select permissions
5. Click **Save Role**
6. Done! ✓

### Assign Role to User (Admin UI)

1. Go to **Admin → Access Control → User Access**
2. Search for user
3. Click to expand user card
4. Click **Assign Role**
5. Select role, set primary, add expiration if needed
6. Click **Assign Role**
7. Done! ✓

### View Audit Trail

1. Go to **Admin → Access Control → Audit Logs**
2. Search or filter by:
   - Action type
   - Resource type
   - Status
   - Date range
3. Click log to see details
4. Export as CSV if needed

## Permission Categories

| Category | Example Permissions |
|----------|-------------------|
| **Bookings** | view, manage, approve quotes, delete |
| **Customers** | view, manage, view/manage documents, message |
| **Finance** | view, manage, approve payments, manage wallet |
| **Employees** | view, manage, manage roles, view activity |
| **RBAC** | view settings, manage roles, manage permissions |
| **Reports** | view analytics, view reports, export data |
| **Audit** | view logs, manage logs, view compliance |
| **Divisions** | manage each division (C&F, Smart Sort, etc.) |

## Troubleshooting

### Component not showing up?
```typescript
// Check if permission loaded
const { loading, error } = useRbac();
if (loading) return <Spinner />;
if (error) return <Error message={error} />;

// Then check permission
if (!usePermission('manage_bookings')) {
  return <AccessDenied />;
}
```

### Permission not working?
1. Check user is logged in: `useAuth()` returns user
2. Check user has role assigned (Admin UI)
3. Check role has permission assigned
4. Check permission code is correct
5. Check browser console for errors

### How to log actions?
```typescript
import { auditService } from '@/lib/rbacService';

// Log success
await auditService.logAction(
  'delete_booking',
  'booking',
  bookingId,
  'Booking #123'
);

// Log failure
await auditService.logAction(
  'approve_payment',
  'payment',
  paymentId,
  'Payment #456',
  {
    status: 'failure',
    errorMessage: 'Insufficient balance'
  }
);
```

## API Reference

### Hooks

```typescript
useRbac()                    // Full RBAC context
usePermission(code)          // Single permission (boolean)
useAnyPermission([codes])    // Any of these (boolean)
useAllPermissions([codes])   // All of these (boolean)
```

### Components

```typescript
<PermissionGuard 
  permission="code"           // Single permission
  permissions={[codes]}       // Multiple permissions
  requireAll={false}          // All required? default: false
  fallback={<Denied />}       // Show if no access
>
  <ProtectedContent />
</PermissionGuard>
```

### Services

```typescript
permissionService.getUserPermissions(userId)      // Get all permissions
permissionService.hasPermission(userId, code)     // Check one
permissionService.hasPermissions(userId, codes)   // Check multiple

rolesService.getAllRoles()                        // Get all roles
rolesService.getRoleById(id)                      // Get one role
rolesService.createRole(input, userId)            // Create role
rolesService.updateRole(id, input, userId)        // Update role
rolesService.deleteRole(id)                       // Delete role

userRolesService.getUserRoles(userId)             // Get user's roles
userRolesService.assignRole(input, userId)        // Assign role
userRolesService.removeRole(userId, roleId)       // Remove role

auditService.logAction(...)                       // Log action
auditService.getAuditLogs(filters)               // Get logs
auditService.exportAuditLogs()                    // Export logs
```

## Default System Roles

| Role | Permissions | Use Case |
|------|------------|----------|
| **Super Admin** | All | System administrator |
| **Admin** | Most (except audit delete) | Department admin |
| **Manager** | Operational + read | Team manager |
| **Supervisor** | Limited management | Supervisor |
| **Operator** | Basic operations | Field operator |
| **Viewer** | Read-only | Reports/analytics |

## Best Practices

✅ **Do:**
- Use `usePermission()` for simple checks
- Use `PermissionGuard` for UI components
- Check permissions before sensitive operations
- Log sensitive actions
- Review audit logs regularly
- Use temporary role assignments
- Assign least privileges needed

❌ **Don't:**
- Grant admin to everyone
- Skip audit logging
- Use vague role names
- Create duplicate permissions
- Ignore audit logs
- Assign permanent roles to contractors
- Mix concerns in roles

## Next Steps

1. ✅ Understand permission structure
2. ✅ Review default roles
3. ✅ Create custom roles for your org
4. ✅ Assign roles to users
5. ✅ Add permission checks to features
6. ✅ Monitor audit logs
7. ✅ Review and adjust quarterly

---

**Need Help?** See [RBAC_IMPLEMENTATION_GUIDE.md](./RBAC_IMPLEMENTATION_GUIDE.md) for detailed documentation.
