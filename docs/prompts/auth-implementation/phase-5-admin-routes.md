# Phase 5: Add /api/admin/users Routes

**Project**: Swarm Dashboard Authentication
**Phase**: 5 of 7
**Estimated Time**: 15-20 minutes
**Prerequisite**: Phases 1-4 complete

---

## Context

Admin-only endpoints for user management. No public registration - only admins can create users.

## Objective

Create `/opt/swarm-tickets/routes/admin.js` with user management endpoints.

## Endpoints

### GET /api/admin/users
List all users (admin only)

### POST /api/admin/users
Create new user (admin only)
```json
{ "email": "user@example.com", "password": "...", "name": "User Name", "role": "user" }
```

### DELETE /api/admin/users/:id
Delete user (admin only, cannot delete self)

### PATCH /api/admin/users/:id
Update user role or reset password (admin only)

## Implementation

### File: `/opt/swarm-tickets/routes/admin.js`

```javascript
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('../lib/auth');
const { requireAdmin } = require('../lib/middleware');

module.exports = function(db) {
  
  // All admin routes require admin role
  router.use(requireAdmin);
  
  // GET /api/admin/users - list all users
  router.get('/users', (req, res) => {
    const users = db.prepare(`
      SELECT id, email, name, role, oauth_provider, created_at, last_login 
      FROM users ORDER BY created_at DESC
    `).all();
    res.json({ users });
  });
  
  // POST /api/admin/users - create user
  router.post('/users', async (req, res) => {
    const { email, password, name, role = 'user' } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Check if email exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    const id = uuidv4();
    const passwordHash = await hashPassword(password);
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, email, passwordHash, name || null, role);
    
    res.status(201).json({ 
      user: { id, email, name, role } 
    });
  });
  
  // DELETE /api/admin/users/:id
  router.delete('/users/:id', (req, res) => {
    const { id } = req.params;
    
    // Prevent self-deletion
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true });
  });
  
  // PATCH /api/admin/users/:id
  router.patch('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { role, password, name } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updates = [];
    const params = [];
    
    if (role && ['user', 'admin'].includes(role)) {
      updates.push('role = ?');
      params.push(role);
    }
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (password) {
      updates.push('password_hash = ?');
      params.push(await hashPassword(password));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    params.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    res.json({ success: true });
  });
  
  return router;
};
```

## Integration

Add to api-server-dashboard.js:
```javascript
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes(db));
```

## Steps

1. SSH to droplet
2. Create routes/admin.js
3. Add route mount to api-server-dashboard.js
4. Restart server
5. Test with curl (will need auth token from Phase 6)

## Success Criteria

- [ ] routes/admin.js exists
- [ ] All endpoints protected by requireAdmin
- [ ] User CRUD operations work
- [ ] Cannot delete self

## Session Notes Update

Update Step 5 status from ⏳ to ✅.
