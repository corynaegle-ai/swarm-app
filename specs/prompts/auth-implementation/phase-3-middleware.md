# Phase 3: Add Auth Middleware

**Project**: Swarm Dashboard Authentication
**Phase**: 3 of 7
**Estimated Time**: 10-15 minutes
**Prerequisite**: Phase 2 complete (auth module exists)

---

## Context

Create Express middleware that protects routes by validating JWT tokens from cookies. Two middleware functions: one for any authenticated user, one for admin-only routes.

## Objective

Create `/opt/swarm-tickets/lib/middleware.js` with authentication middleware.

## Implementation

### File: `/opt/swarm-tickets/lib/middleware.js`

```javascript
const { verifyAccessToken } = require('./auth');

// Require valid JWT - any authenticated user
function requireAuth(req, res, next) {
  const token = req.cookies?.access_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Require admin role
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Optional auth - attach user if token present, continue otherwise
function optionalAuth(req, res, next) {
  const token = req.cookies?.access_token;
  
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch (err) {
      // Invalid token, continue without user
    }
  }
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
```

## Steps

1. SSH to droplet
2. Install cookie-parser if not present: `npm install cookie-parser`
3. Create middleware.js in lib/
4. Add cookie-parser to api-server-dashboard.js:
   ```javascript
   const cookieParser = require('cookie-parser');
   app.use(cookieParser());
   ```
5. Test middleware import

## Success Criteria

- [ ] cookie-parser installed
- [ ] `/opt/swarm-tickets/lib/middleware.js` exists
- [ ] Exports requireAuth, requireAdmin, optionalAuth
- [ ] cookie-parser added to Express app

## Session Notes Update

Update Step 3 status from ⏳ to ✅.
