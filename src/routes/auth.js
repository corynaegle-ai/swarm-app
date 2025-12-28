const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const dbManager = require('../database/init');

const router = express.Router();

// Rate limiting for password reset requests
const passwordResetLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password strength validation
const passwordValidator = (password) => {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return 'Password must contain at least one lowercase letter, one uppercase letter, and one number';
  }
  return null;
};

// Email format validation
const emailValidator = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Please provide a valid email address');

// Password reset request endpoint
router.post('/password-reset', 
  passwordResetLimit,
  emailValidator,
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Invalid input', 
          details: errors.array() 
        });
      }

      const { email } = req.body;
      const db = dbManager.getDatabase();

      // Check if user exists
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (!user) {
        // Return same response regardless to prevent email enumeration
        return res.json({ 
          message: 'If an account with this email exists, a password reset link will be sent.' 
        });
      }

      // Generate secure random token (32 bytes = 256 bits)
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Token expires in 1 hour (3600 seconds)
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      // Store hashed token in database
      const stmt = db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) 
        VALUES (?, ?, ?)
      `);
      stmt.run(user.id, tokenHash, expiresAt);

      // In production, send reset token via secure email
      // For now, we just confirm the request was processed
      // NOTE: The actual token is NEVER returned to the client
      res.json({ 
        message: 'If an account with this email exists, a password reset link will be sent.' 
      });

    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Password reset completion endpoint
router.post('/password-reset/confirm',
  body('token').isLength({ min: 64, max: 64 }).withMessage('Invalid token format'),
  body('password').custom((password) => {
    const error = passwordValidator(password);
    if (error) {
      throw new Error(error);
    }
    return true;
  }),
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Invalid input', 
          details: errors.array() 
        });
      }

      const { token, password } = req.body;
      const db = dbManager.getDatabase();
      const now = Math.floor(Date.now() / 1000);

      // Hash the provided token to match stored hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Find valid, unused token
      const tokenRecord = db.prepare(`
        SELECT prt.id, prt.user_id, u.id as user_exists
        FROM password_reset_tokens prt
        JOIN users u ON prt.user_id = u.id
        WHERE prt.token_hash = ? 
        AND prt.expires_at > ? 
        AND prt.used_at IS NULL
      `).get(tokenHash, now);

      if (!tokenRecord) {
        return res.status(400).json({ 
          error: 'Invalid or expired reset token' 
        });
      }

      // Hash the new password using bcrypt
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Update user's password and mark token as used
      const updateUser = db.prepare('UPDATE users SET password = ? WHERE id = ?');
      const markTokenUsed = db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?');
      
      // Use transaction for atomicity
      const transaction = db.transaction(() => {
        updateUser.run(hashedPassword, tokenRecord.user_id);
        markTokenUsed.run(now, tokenRecord.id);
      });
      transaction();

      res.json({ message: 'Password successfully reset' });

    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Cleanup expired tokens periodically (run once on module load)
setTimeout(() => {
  try {
    const db = dbManager.getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ?');
    stmt.run(now);
  } catch (error) {
    // Silent cleanup failure - not critical
  }
}, 1000);

module.exports = router;