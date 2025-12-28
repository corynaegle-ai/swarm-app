# Phase 4: Add /api/auth Routes (login, logout, refresh)

**Project**: Swarm Dashboard Authentication
**Phase**: 4 of 7
**Estimated Time**: 20-25 minutes
**Prerequisite**: Phases 1-3 complete

---

## Context

Add authentication endpoints for login, logout, and token refresh. Tokens are stored in httpOnly cookies for security.

## Objective

Add auth routes to api-server-dashboard.js or create separate routes file.

## Endpoints

### POST /api/auth/login
```javascript
// Request body: { email, password }
// Response: { user: { id, email, name, role } }
// Sets cookies: access_token, refresh_token
```

### POST /api/auth/logout
```javascript
// Clears auth cookies
// Response: { success: true }
```

### POST /api/auth/refresh
```javascript
// Uses refresh_token cookie to issue new access_token
// Response: { success: true }
```

### GET /api/auth/me
```javascript
// Returns current user from token
// Response: { user: { id, email, name, role } }
```

## Implementation

### File: `/opt/swarm-tickets/routes/auth.js`

```javascript
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { 
  hashPassword, verifyPassword, 
  generateAccessToken, generateRefreshToken,
  verifyRefreshToken 
} = require('../lib/auth');
const { requireAuth } = require('../lib/middleware');

// Cookie options
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
};

module.exports = function(db) {
  
  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last_login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    
    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Set cookies
    res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    
    res.json({ 
      user: { id: user.id, email: user.email, name: user.name, role: user.role } 
    });
  });
  
  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    res.clearCookie('access_token', COOKIE_OPTIONS);
    res.clearCookie('refresh_token', COOKIE_OPTIONS);
    res.json({ success: true });
  });
  
  // POST /api/auth/refresh
  router.post('/refresh', (req, res) => {
    const refreshToken = req.cookies?.refresh_token;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }
    
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const accessToken = generateAccessToken(user);
      res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
      res.json({ success: true });
    } catch (err) {
      res.clearCookie('refresh_token', COOKIE_OPTIONS);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
  });
  
  // GET /api/auth/me
  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  
  return router;
};
```

## Integration

Add to api-server-dashboard.js:
```javascript
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes(db));
```

## Steps

1. SSH to droplet
2. Create routes directory: `mkdir -p /opt/swarm-tickets/routes`
3. Create routes/auth.js
4. Add route mount to api-server-dashboard.js
5. Restart server and test endpoints

## Success Criteria

- [ ] routes/auth.js exists
- [ ] All 4 endpoints respond correctly
- [ ] Cookies set/cleared properly
- [ ] Invalid credentials return 401

## Session Notes Update

Update Step 4 status from ⏳ to ✅.
