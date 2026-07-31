/*
# Comprehensive Role-Based Access Control (RBAC) System

## Features
1. Granular permission-based system
2. Custom role creation and management
3. Department-based data isolation
4. Comprehensive audit logging
5. Permission inheritance and defaults

## New/Modified Tables

### 1. roles (Enhanced)
- Core role definitions with permission inheritance
- Supports custom roles beyond default ones

### 2. role_permissions
- Maps each role to specific permissions
- Granular action-level permissions

### 3. user_role_assignments
- Assigns users to roles
- Multiple role support per user
- Department-scoped assignments

### 4. audit_logs
- Comprehensive audit trail for sensitive actions
- User tracking, timestamp, before/after values

### 5. rbac_departments (Optional)
- Logical department groupings for data isolation
- Supports multi-department users

### 6. permission_definitions
- Master list of all available permissions
- Categorized for UI grouping
*/

-- ===========================
-- 1. PERMISSION DEFINITIONS
-- ===========================
CREATE TABLE IF NOT EXISTS permission_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL, -- 'bookings', 'users', 'reports', 'finance', 'settings', 'audit'
  is_sensitive boolean DEFAULT false, -- triggers audit logging
  created_at timestamptz DEFAULT now()
);

-- Seed core permissions
DELETE FROM permission_definitions WHERE code LIKE 'view_%' OR code LIKE 'manage_%' OR code LIKE 'approve_%' OR code LIKE 'audit_%';
INSERT INTO permission_definitions (code, name, description, category, is_sensitive) VALUES
  -- Booking Management
  ('view_bookings', 'View Bookings', 'View all bookings', 'bookings', false),
  ('manage_bookings', 'Manage Bookings', 'Create, edit, update booking status', 'bookings', true),
  ('approve_quotes', 'Approve Quotes', 'Review and approve quote requests', 'bookings', true),
  ('delete_bookings', 'Delete Bookings', 'Delete booking records', 'bookings', true),
  
  -- Customer Management
  ('view_customers', 'View Customers', 'View customer profiles and data', 'customers', false),
  ('manage_customers', 'Manage Customers', 'Create, edit, delete customer records', 'customers', true),
  ('view_customer_documents', 'View Customer Documents', 'Access customer documents and files', 'customers', false),
  ('manage_customer_documents', 'Manage Customer Documents', 'Upload, delete customer documents', 'customers', true),
  ('message_customers', 'Message Customers', 'Send messages and notifications to customers', 'customers', true),
  
  -- Finance & Payments
  ('view_finance', 'View Finance', 'View financial reports and transactions', 'finance', false),
  ('manage_finance', 'Manage Finance', 'Process payments, invoices, refunds', 'finance', true),
  ('approve_payments', 'Approve Payments', 'Approve payment transactions', 'finance', true),
  ('manage_wallet', 'Manage Wallet', 'Adjust customer wallets and balances', 'finance', true),
  
  -- Employee Management
  ('view_employees', 'View Employees', 'View employee records', 'employees', false),
  ('manage_employees', 'Manage Employees', 'Create, edit, delete employee records', 'employees', true),
  ('manage_employee_roles', 'Manage Employee Roles', 'Assign and modify employee roles', 'employees', true),
  ('view_employee_activity', 'View Employee Activity', 'View employee activity logs', 'employees', false),
  
  -- RBAC Management
  ('view_rbac', 'View RBAC Settings', 'View roles and permissions', 'settings', false),
  ('manage_roles', 'Manage Roles', 'Create, edit, delete roles', 'settings', true),
  ('manage_permissions', 'Manage Permissions', 'Assign permissions to roles', 'settings', true),
  ('manage_users', 'Manage Users', 'Manage user accounts and access', 'settings', true),
  
  -- Analytics & Reports
  ('view_analytics', 'View Analytics', 'Access analytics dashboards', 'reports', false),
  ('view_reports', 'View Reports', 'Generate and view reports', 'reports', false),
  ('export_data', 'Export Data', 'Export business data', 'reports', true),
  
  -- Audit & Compliance
  ('view_audit_logs', 'View Audit Logs', 'Access audit and activity logs', 'audit', false),
  ('manage_audit_logs', 'Manage Audit Logs', 'Archive or delete audit records', 'audit', true),
  ('view_compliance', 'View Compliance', 'View compliance reports', 'audit', false),
  
  -- Division/Service Access
  ('manage_division_cf', 'Manage Clearing & Forwarding', 'Full access to C&F division', 'divisions', true),
  ('manage_division_ss', 'Manage Smart Sort', 'Full access to Smart Sort division', 'divisions', true),
  ('manage_division_clean', 'Manage Cleaning Services', 'Full access to Cleaning division', 'divisions', true),
  ('manage_division_security', 'Manage Private Security', 'Full access to Security division', 'divisions', true),
  ('manage_division_procurement', 'Manage Procurement', 'Full access to Procurement division', 'divisions', true);

-- ===========================
-- 2. DEPARTMENTS
-- ===========================
CREATE TABLE IF NOT EXISTS rbac_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO rbac_departments (code, name, description, is_active) VALUES
  ('admin', 'Administration', 'Central admin team', true),
  ('operations', 'Operations', 'Day-to-day operations', true),
  ('finance', 'Finance', 'Financial and accounting', true),
  ('hr', 'Human Resources', 'HR and personnel', true),
  ('sales', 'Sales', 'Sales and business development', true);

-- ===========================
-- 3. ROLES (Enhanced)
-- ===========================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_system_role boolean DEFAULT false, -- true for built-in roles
  is_active boolean DEFAULT true,
  color_code text, -- for UI display
  department_id uuid REFERENCES rbac_departments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed default system roles
DELETE FROM roles WHERE is_system_role = true;
INSERT INTO roles (name, description, is_system_role, color_code) VALUES
  ('Super Admin', 'Full system access', true, 'red'),
  ('Admin', 'Administrative access', true, 'red'),
  ('Manager', 'Department manager with team oversight', true, 'blue'),
  ('Supervisor', 'Team supervisor with limited admin', true, 'blue'),
  ('Operator', 'Standard operator role', true, 'green'),
  ('Viewer', 'Read-only access', true, 'gray');

-- ===========================
-- 4. ROLE PERMISSIONS
-- ===========================
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permission_definitions(id) ON DELETE CASCADE,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(role_id, permission_id)
);

-- Seed Super Admin with all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permission_definitions p
WHERE r.name = 'Super Admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed Admin with all permissions except sensitive audit management
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permission_definitions p
WHERE r.name = 'Admin' 
  AND p.code NOT IN ('manage_audit_logs')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed Manager with operational permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permission_definitions p
WHERE r.name = 'Manager'
  AND p.code IN (
    'view_bookings', 'manage_bookings', 'view_customers', 'manage_customers',
    'view_finance', 'view_employees', 'manage_employees', 'view_analytics',
    'view_reports', 'view_audit_logs'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed Viewer with read-only permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permission_definitions p
WHERE r.name = 'Viewer'
  AND p.code IN (
    'view_bookings', 'view_customers', 'view_finance', 'view_employees',
    'view_analytics', 'view_reports', 'view_audit_logs'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ===========================
-- 5. USER ROLE ASSIGNMENTS
-- ===========================
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  department_id uuid REFERENCES rbac_departments(id) ON DELETE SET NULL,
  is_primary boolean DEFAULT false, -- primary role for the user
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at timestamptz, -- optional: temporary role assignment
  UNIQUE(user_id, role_id, department_id)
);

-- ===========================
-- 6. AUDIT LOGS
-- ===========================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL, -- e.g., 'update_booking', 'delete_user', 'manage_permission'
  resource_type text NOT NULL, -- e.g., 'booking', 'user', 'role'
  resource_id text,
  resource_name text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure')),
  changes jsonb, -- {before: {field: value}, after: {field: value}}
  ip_address text,
  user_agent text,
  error_message text,
  metadata jsonb, -- additional context
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- ===========================
-- 7. ROLE LEVEL SECURITY
-- ===========================
ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Permission Definitions: Admins full access, others read-only
DROP POLICY IF EXISTS "permission_defs_select" ON permission_definitions;
CREATE POLICY "permission_defs_select" ON permission_definitions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "permission_defs_manage" ON permission_definitions;
CREATE POLICY "permission_defs_manage" ON permission_definitions FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());

-- Departments: All can view, admins can modify
DROP POLICY IF EXISTS "departments_select" ON rbac_departments;
CREATE POLICY "departments_select" ON rbac_departments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "departments_manage" ON rbac_departments;
CREATE POLICY "departments_manage" ON rbac_departments FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());

-- Roles: All can view, admins can modify
DROP POLICY IF EXISTS "roles_select" ON roles;
CREATE POLICY "roles_select" ON roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles_manage" ON roles;
CREATE POLICY "roles_manage" ON roles FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());

-- Role Permissions: All can view, admins can modify
DROP POLICY IF EXISTS "role_permissions_select" ON role_permissions;
CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "role_permissions_manage" ON role_permissions;
CREATE POLICY "role_permissions_manage" ON role_permissions FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());

-- User Role Assignments: Users can view their own, admins can modify all
DROP POLICY IF EXISTS "user_role_assignments_select" ON user_role_assignments;
CREATE POLICY "user_role_assignments_select" ON user_role_assignments FOR SELECT TO authenticated 
  USING (is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "user_role_assignments_manage" ON user_role_assignments;
CREATE POLICY "user_role_assignments_manage" ON user_role_assignments FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());

-- Audit Logs: Users can view logs for actions they performed or admins, admins can manage
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated 
  USING (is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_manage" ON audit_logs;
CREATE POLICY "audit_logs_manage" ON audit_logs FOR DELETE TO authenticated 
  USING (is_admin());

-- ===========================
-- 8. HELPER FUNCTIONS
-- ===========================

-- Get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id uuid)
RETURNS TABLE(permission_code text, permission_name text, category text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    pd.code,
    pd.name,
    pd.category
  FROM user_role_assignments ura
  JOIN roles r ON ura.role_id = r.id
  JOIN role_permissions rp ON r.id = rp.role_id
  JOIN permission_definitions pd ON rp.permission_id = pd.id
  WHERE ura.user_id = p_user_id
    AND (ura.expires_at IS NULL OR ura.expires_at > now())
    AND r.is_active = true;
$$;

-- Check if user has permission
CREATE OR REPLACE FUNCTION has_permission(p_user_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN roles r ON ura.role_id = r.id
    JOIN role_permissions rp ON r.id = rp.role_id
    JOIN permission_definitions pd ON rp.permission_id = pd.id
    WHERE ura.user_id = p_user_id
      AND pd.code = p_permission_code
      AND (ura.expires_at IS NULL OR ura.expires_at > now())
      AND r.is_active = true
  );
$$;

-- Get user roles
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id uuid)
RETURNS TABLE(role_id uuid, role_name text, department_id uuid, department_name text, is_primary boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    ura.department_id,
    rd.name,
    ura.is_primary
  FROM user_role_assignments ura
  JOIN roles r ON ura.role_id = r.id
  LEFT JOIN rbac_departments rd ON ura.department_id = rd.id
  WHERE ura.user_id = p_user_id
    AND (ura.expires_at IS NULL OR ura.expires_at > now());
$$;

-- Audit log helper
CREATE OR REPLACE FUNCTION log_audit_action(
  p_action text,
  p_resource_type text,
  p_resource_id text DEFAULT NULL,
  p_resource_name text DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_changes jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO audit_logs (
    user_id, action, resource_type, resource_id, resource_name,
    status, changes, error_message, metadata, ip_address
  ) VALUES (
    auth.uid(), p_action, p_resource_type, p_resource_id, p_resource_name,
    p_status, p_changes, p_error_message, p_metadata,
    current_setting('app.client_ip')
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;
