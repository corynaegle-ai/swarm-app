const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { dbManager } = require('../database/init');

const router = express.Router();

// Initialize password reset tokens table
function initializeResetTokensTable() {
  const db = dbManager.getDatabase();
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='reset_tokens'"
  ).get();
  
  if (!tableExists) {
    db.prepare(`
      CREATE TABLE reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER DEFAULT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();
    
    // Create index for efficient token lookups
    db.prepare('CREATE INDEX idx_reset_tokens_hash ON reset_tokens(token_hash)').run();
    db.prepare('CREATE INDEX idx_reset_tokens_expires ON reset_tokens(expires_at)').run();
  }
}

// Initialize users table for testing
function initializeUsersTable() {
  const db = dbManager.getDatabase();
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
  ).get();
  
  if (!tableExists) {
    db.prepare(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `).run();
    
    db.prepare('CREATE INDEX idx_users_email ON users(email)').run();
  }
}

// Initialize tables
initializeResetTokensTable();
initializeUsersTable();

// Password reset request endpoint
router.post('/reset-password/request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const db = dbManager.getDatabase();
    
    // Find user by email
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    
    if (!user) {
      // Don't reveal if user exists, always return success
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }
    
    // Generate secure token using crypto.randomBytes (AC-001)
    const tokenBytes = crypto.randomBytes(32);
    const token = tokenBytes.toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Calculate expiration (1 hour from now) (AC-002)
    const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60); // 1 hour in seconds
    
    // Store token hash in database
    const stmt = db.prepare(`
      INSERT INTO reset_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(user.id, tokenHash, expiresAt);
    
    if (result.changes === 0) {
      return res.status(500).json({ error: 'Failed to create reset token' });
    }
    
    // In a real app, you would send email here
    // For testing, we'll return the token (remove in production)
    res.json({ 
      message: 'If the email exists, a reset link has been sent',
      // Remove this in production:
      _dev_token: token
    });
    
  } catch (error) {
    console.error('Reset request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password reset confirmation endpoint
router.post('/reset-password/confirm', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const db = dbManager.getDatabase();
    
    // Hash the provided token to match against stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Find valid, unused, non-expired token
    const resetToken = db.prepare(`
      SELECT rt.id, rt.user_id, rt.expires_at
      FROM reset_tokens rt
      WHERE rt.token_hash = ? 
        AND rt.used_at IS NULL 
        AND rt.expires_at > ?
    `).get(tokenHash, currentTime);
    
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Hash new password with bcrypt (AC-003)
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Start transaction
    const transaction = db.transaction(() => {
      // Update user password
      const updateUser = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
      const userResult = updateUser.run(passwordHash, resetToken.user_id);
      
      if (userResult.changes === 0) {
        throw new Error('Failed to update password');
      }
      
      // Mark token as used
      const markUsed = db.prepare('UPDATE reset_tokens SET used_at = ? WHERE id = ?');
      markUsed.run(currentTime, resetToken.id);
    });
    
    transaction();
    
    res.json({ message: 'Password reset successfully' });
    
  } catch (error) {
    console.error('Reset confirm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup expired tokens (run periodically)
function cleanupExpiredTokens() {
  try {
    const db = dbManager.getDatabase();
    const currentTime = Math.floor(Date.now() / 1000);
    
    const result = db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?').run(currentTime);
    
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} expired reset tokens`);
    }
  } catch (error) {
    console.error('Token cleanup error:', error);
  }
}

// Run cleanup every 30 minutes
let cleanupInterval;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(cleanupExpiredTokens, 30 * 60 * 1000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
});

process.on('SIGTERM', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
});

module.exports = router;