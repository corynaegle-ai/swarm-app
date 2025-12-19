-- RBAC Schema Migration
-- Run on dev: sqlite3 /opt/swarm-platform/data/swarm.db < rbac-schema.sql

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  level INTEGER NOT NULL,  -- Higher = more permissions (100=super_admin, 75=admin, 50=developer, 25=viewer)
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT,  -- Group permissions: 'features', 'users', 'system', etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission mapping (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);

-- Seed default roles
INSERT OR IGNORE INTO roles (id, name, level, description) VALUES
  ('role-super-admin', 'super_admin', 100, 'Full system access, can manage other admins'),
  ('role-admin', 'admin', 75, 'Can approve deployments, manage features, view all data'),
  ('role-developer', 'developer', 50, 'Can create projects, view dev environment'),
  ('role-viewer', 'viewer', 25, 'Read-only access to dashboards');

-- Seed permissions
INSERT OR IGNORE INTO permissions (id, name, description, category) VALUES
  -- Feature management
  ('perm-create-feature', 'create_swarm_feature', 'Create new Swarm self-development features', 'features'),
  ('perm-approve-promotion', 'approve_promotion', 'Approve feature promotion to production', 'features'),
  ('perm-initiate-rollback', 'initiate_rollback', 'Initiate production rollback', 'features'),
  ('perm-view-features', 'view_features', 'View feature list and status', 'features'),
  
  -- Swarm Clarifier
  ('perm-access-clarifier', 'access_clarifier', 'Access Swarm Clarifier agent persona', 'features'),
  
  -- User management
  ('perm-manage-users', 'manage_users', 'Create, edit, delete users', 'users'),
  ('perm-assign-roles', 'assign_roles', 'Assign roles to users', 'users'),
  ('perm-view-users', 'view_users', 'View user list', 'users'),
  
  -- Projects
  ('perm-create-project', 'create_project', 'Create new projects', 'projects'),
  ('perm-view-projects', 'view_projects', 'View project list', 'projects'),
  ('perm-manage-tickets', 'manage_tickets', 'Create/edit/delete tickets', 'projects'),
  
  -- System
  ('perm-view-vms', 'view_vms', 'View VM status', 'system'),
  ('perm-manage-vms', 'manage_vms', 'Start/stop VMs', 'system'),
  ('perm-view-agents', 'view_agents', 'View agent status', 'system'),
  ('perm-manage-secrets', 'manage_secrets', 'Manage API keys and secrets', 'system'),
  ('perm-view-dashboard', 'view_dashboard', 'Access main dashboard', 'system'),
  
  -- Dev environment
  ('perm-access-dev', 'access_dev', 'Access dev environment', 'dev');

-- Assign permissions to roles
-- SUPER_ADMIN gets everything
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role-super-admin', id FROM permissions;

-- ADMIN gets most things except user management
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role-admin', id FROM permissions 
WHERE name NOT IN ('manage_users', 'assign_roles');

-- DEVELOPER gets project and viewing permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role-developer', id FROM permissions 
WHERE name IN (
  'view_features', 'view_users', 'create_project', 'view_projects', 
  'manage_tickets', 'view_vms', 'view_agents', 'view_dashboard', 'access_dev'
);

-- VIEWER gets read-only
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role-viewer', id FROM permissions 
WHERE name IN ('view_features', 'view_projects', 'view_vms', 'view_agents', 'view_dashboard');

-- Add role_id column to users if not exists (SQLite workaround)
-- First check if column exists
SELECT CASE 
  WHEN COUNT(*) = 0 THEN 'ALTER TABLE users ADD COLUMN role_id TEXT REFERENCES roles(id)'
  ELSE 'SELECT 1'
END FROM pragma_table_info('users') WHERE name = 'role_id';
