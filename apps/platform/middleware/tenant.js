/**
 * Multi-tenant isolation middleware
 * Ensures data isolation between tenants
 */

// Attach tenant context from authenticated user
function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!req.user.tenant_id) {
    return res.status(403).json({ error: 'No tenant association' });
  }
  
  req.tenantId = req.user.tenant_id;
  next();
}

// Optional tenant - sets tenantId if user has one
function optionalTenant(req, res, next) {
  if (req.user?.tenant_id) {
    req.tenantId = req.user.tenant_id;
  }
  next();
}

module.exports = { requireTenant, optionalTenant };
