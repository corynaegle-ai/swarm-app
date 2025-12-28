const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const router = express.Router();

// In-memory storage for reset tokens (replace with database in production)
const resetTokens = new Map();

// Password reset request endpoint
router.post('/password-reset-request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Generate secure random token using crypto.randomBytes
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration time to 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Store token with expiration
    resetTokens.set(token, {
      email,
      expiresAt,
      used: false
    });
    
    // In production, send email with token
    console.log(`Password reset token for ${email}: ${token}`);
    
    res.json({ message: 'Password reset token generated', token });
  } catch (error) {
    console.error('Error generating reset token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password reset endpoint
router.post('/password-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    // Validate token
    const tokenData = resetTokens.get(token);
    
    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Check if token has expired
    if (new Date() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return res.status(400).json({ error: 'Token has expired' });
    }
    
    // Check if token has already been used
    if (tokenData.used) {
      return res.status(400).json({ error: 'Token has already been used' });
    }
    
    // Hash the new password with bcrypt
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Mark token as used
    tokenData.used = true;
    
    // In production, update user password in database
    console.log(`Password reset for ${tokenData.email}:`, hashedPassword);
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup expired tokens (helper function)
function cleanupExpiredTokens() {
  const now = new Date();
  for (const [token, data] of resetTokens.entries()) {
    if (now > data.expiresAt) {
      resetTokens.delete(token);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupExpiredTokens, 30 * 60 * 1000);

module.exports = router;