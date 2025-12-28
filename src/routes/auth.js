const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();

// Initialize SQLite database
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
});

// Rate limiting for password reset requests
const resetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: 'Too many password reset attempts, please try again later.' }
});

// Password strength validation
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number' };
  }
  return { valid: true };
}

// Password reset request endpoint
router.post('/request-reset', resetRateLimit, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    // Check if user exists
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, email FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      // Don't reveal whether email exists or not for security
      return res.status(200).json({ 
        message: 'If the email exists in our system, a password reset link has been sent.' 
      });
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour from now

    // Store hashed token in database
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [user.id, tokenHash, expiresAt],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // In a real application, you would send this token via email
    // For testing purposes, we'll simulate email sending
    console.log(`[EMAIL SIMULATION] Password reset link for ${email}: /reset-password?token=${resetToken}`);

    res.status(200).json({ 
      message: 'If the email exists in our system, a password reset link has been sent.' 
    });
  } catch (error) {
    console.error('Password reset request error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password reset confirmation endpoint
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  // Validate password strength
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  try {
    // Hash the provided token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const currentTime = Date.now();

    // Find valid token
    const resetRecord = await new Promise((resolve, reject) => {
      db.get(
        'SELECT rt.user_id, rt.expires_at FROM reset_tokens rt WHERE rt.token_hash = ? AND rt.expires_at > ?',
        [tokenHash, currentTime],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user's password
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [hashedPassword, resetRecord.user_id],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Delete used token
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM reset_tokens WHERE token_hash = ?',
        [tokenHash],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper endpoint to create test users (for testing only)
router.post('/create-test-user', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        [email, hashedPassword],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    res.status(201).json({ message: 'Test user created successfully' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'User already exists' });
    } else {
      console.error('Create user error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Cleanup expired tokens periodically
let cleanupInterval;
function startTokenCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(async () => {
    try {
      const currentTime = Date.now();
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM reset_tokens WHERE expires_at <= ?', [currentTime], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.error('Token cleanup error:', error.message);
    }
  }, 5 * 60 * 1000); // Run every 5 minutes
}

// Start cleanup when module is loaded
startTokenCleanup();

// Export cleanup function for testing
router.stopTokenCleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

module.exports = router;