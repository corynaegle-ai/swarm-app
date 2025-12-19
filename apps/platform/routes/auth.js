/**
 * Authentication routes - PostgreSQL version
 * Async/await for all database operations
 */

const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { query } = require('../db');
const { 
  createToken, hashPassword, verifyPassword, requireAuth, requireAdmin 
} = require('../middleware/auth');

// Cookie options for cross-subdomain auth
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  domain: process.env.COOKIE_DOMAIN || '.swarmstack.net',
  maxAge: 86400000  // 24 hours
};

// Helper: Get user permissions from role
async function getUserPermissions(roleId) {
  if (!roleId) return [];
  const result = await query(`
    SELECT p.name FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = $1
  `, [roleId]);
  return result.rows.map(p => p.name);
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get role info
    let roleInfo = null;
    if (user.role_id) {
      const roleResult = await query('SELECT name, level FROM roles WHERE id = $1', [user.role_id]);
      roleInfo = roleResult.rows[0];
    }

    const token = createToken({ 
      id: user.id, 
      email: user.email, 
      role: user.role,
      role_id: user.role_id,
      tenant_id: user.tenant_id 
    });
    
    // Update last_login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    
    res.cookie('auth_token', token, cookieOptions);
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        role: user.role,
        role_id: user.role_id,
        role_name: roleInfo?.name,
        role_level: roleInfo?.level
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const passwordHash = hashPassword(password);
    const defaultRoleId = 'role-developer';
    
    await query(`
      INSERT INTO users (id, email, password_hash, name, role, role_id, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, 'user', $5, NULL, CURRENT_TIMESTAMP)
    `, [id, email, passwordHash, name || email.split('@')[0], defaultRoleId]);

    const token = createToken({ id, email, role: 'user', role_id: defaultRoleId, tenant_id: null });
    res.cookie('auth_token', token, cookieOptions);
    res.status(201).json({ success: true, user: { id, email, role: 'user', role_id: defaultRoleId } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', { domain: process.env.COOKIE_DOMAIN || '.swarmstack.net' });
  res.json({ success: true });
});

// POST /api/auth/refresh
router.post('/refresh', requireAuth, (req, res) => {
  const token = createToken(req.user);
  res.cookie('auth_token', token, cookieOptions);
  res.json({ success: true });
});

// GET /api/auth/me - Returns user with permissions
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userResult = await query(`
      SELECT u.id, u.email, u.name, u.role, u.role_id, u.tenant_id, u.created_at,
             r.name as role_name, r.level as role_level
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [req.user.id]);
    
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const permissions = await getUserPermissions(user.role_id);
    res.json({ ...user, permissions });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/roles - List all roles
router.get('/roles', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT id, name, level, description FROM roles ORDER BY level DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get roles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/permissions - List all permissions
router.get('/permissions', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT id, name, description, category FROM permissions ORDER BY category, name');
    res.json(result.rows);
  } catch (err) {
    console.error('Get permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/users (admin)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.name, u.role, u.role_id, u.tenant_id, u.created_at,
             r.name as role_name, r.level as role_level
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
    `);
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/users (admin)
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role, role_id, tenant_id } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const id = uuidv4();
    const passwordHash = hashPassword(password);
    const assignedRoleId = role_id || 'role-developer';
    
    await query(`
      INSERT INTO users (id, email, password_hash, name, role, role_id, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [id, email, passwordHash, name, role || 'user', assignedRoleId, tenant_id]);
    
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
