/**
 * RBAC Middleware for Swarm Platform - PostgreSQL version
 * Provides role-based access control using database-defined roles and permissions
 */

const { queryAll } = require('../db');

/**
 * Cache for role permissions (refreshes every 5 minutes)
 */
let permissionsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load all role permissions into cache
 */
async function loadPermissionsCache() {
  const now = Date.now();
  if (permissionsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return permissionsCache;
  }

  const rows = await queryAll(`
    SELECT r.id as role_id, r.name as role_name, r.level, p.name as permission
    FROM roles r
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
  `);

  permissionsCache = {};
  for (const row of rows) {
    if (!permissionsCache[row.role_id]) {
      permissionsCache[row.role_id] = {
        name: row.role_name,
        level: row.level,
        permissions: new Set()
      };
    }
    if (row.permission) {
      permissionsCache[row.role_id].permissions.add(row.permission);
    }
  }

  cacheTimestamp = now;
  return permissionsCache;
}

/**
 * Clear the permissions cache (call after role/permission changes)
 */
function clearPermissionsCache() {
  permissionsCache = null;
  cacheTimestamp = 0;
}

/**
 * Check if user has a specific permission
 */
async function hasPermission(roleId, permission) {
  const cache = await loadPermissionsCache();
  const role = cache[roleId];
  if (!role) return false;
  return role.permissions.has(permission);
}

/**
 * Check if user has ANY of the specified permissions
 */
async function hasAnyPermission(roleId, permissions) {
  const cache = await loadPermissionsCache();
  const role = cache[roleId];
  if (!role) return false;
  return permissions.some(p => role.permissions.has(p));
}

/**
 * Check if user has ALL of the specified permissions
 */
async function hasAllPermissions(roleId, permissions) {
  const cache = await loadPermissionsCache();
  const role = cache[roleId];
  if (!role) return false;
  return permissions.every(p => role.permissions.has(p));
}

/**
 * Check if user's role level meets minimum
 */
async function hasMinimumLevel(roleId, minLevel) {
  const cache = await loadPermissionsCache();
  const role = cache[roleId];
  if (!role) return false;
  return role.level >= minLevel;
}

/**
 * Middleware: Require specific permission
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roleId = req.user.role_id;
    if (!roleId) {
      return res.status(403).json({ error: 'No role assigned' });
    }

    if (await hasPermission(roleId, permission)) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Permission denied',
      required: permission 
    });
  };
}

/**
 * Middleware: Require ANY of specified permissions
 */
function requireAnyPermission(permissions) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roleId = req.user.role_id;
    if (!roleId) {
      return res.status(403).json({ error: 'No role assigned' });
    }

    if (await hasAnyPermission(roleId, permissions)) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Permission denied',
      required_any: permissions 
    });
  };
}

/**
 * Middleware: Require minimum role level
 */
function requireLevel(minLevel) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roleId = req.user.role_id;
    if (!roleId) {
      return res.status(403).json({ error: 'No role assigned' });
    }

    if (await hasMinimumLevel(roleId, minLevel)) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Insufficient role level',
      required_level: minLevel 
    });
  };
}

/**
 * Helper: Attach user permissions to request for frontend use
 */
async function attachPermissions(req, res, next) {
  if (req.user && req.user.role_id) {
    const cache = await loadPermissionsCache();
    const role = cache[req.user.role_id];
    if (role) {
      req.user.permissions = Array.from(role.permissions);
      req.user.role_level = role.level;
      req.user.role_name = role.name;
    }
  }
  next();
}

// Role level constants
const ROLE_LEVELS = {
  SUPER_ADMIN: 100,
  ADMIN: 75,
  DEVELOPER: 50,
  VIEWER: 25
};

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireLevel,
  attachPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasMinimumLevel,
  clearPermissionsCache,
  ROLE_LEVELS
};
