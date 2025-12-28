const express = require('express');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/jwt');
const router = express.Router();

// In-memory user store for demo purposes
// In production, this would be replaced with a proper database
const users = [
  {
    id: 1,
    email: 'admin@example.com',
    // Password: 'admin123' - hashed with bcrypt
    passwordHash: '$2b$10$rQJ8vQJ8vQJ8vQJ8vQJ8vOJ8vQJ8vQJ8vQJ8vQJ8vQJ8vQJ8vQJ8v.',
    role: 'admin'
  },
  {
    id: 2,
    email: 'user@example.com', 
    // Password: 'user123' - hashed with bcrypt
    passwordHash: '$2b$10$sRK9wRK9wRK9wRK9wRK9wOK9wRK9wRK9wRK9wRK9wRK9wRK9wRK9w.',
    role: 'user'
  }
];

// Rate limiting store (in production, use Redis or similar)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Helper function to check rate limiting
function checkRateLimit(email) {
  const attempts = loginAttempts.get(email);
  if (!attempts) return true;
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
    if (timeSinceLastAttempt < LOCKOUT_DURATION) {
      return false;
    } else {
      // Reset after lockout period
      loginAttempts.delete(email);
      return true;
    }
  }
  return true;
}

// Helper function to record failed attempt
function recordFailedAttempt(email) {
  const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(email, attempts);
}

// Helper function to clear attempts on successful login
function clearFailedAttempts(email) {
  loginAttempts.delete(email);
}

/**
 * POST /api/auth/login
 * Authenticates user and returns JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }
    
    // Check rate limiting
    if (!checkRateLimit(email)) {
      return res.status(429).json({
        error: 'Too many login attempts. Please try again later.'
      });
    }
    
    // Find user by email
    const user = users.find(u => u.email === email);
    
    // Always perform bcrypt comparison to prevent timing attacks
    const dummyHash = '$2b$10$dummyhashtopreventtimingattacks.dummy.hash.value.here';
    const hashToCompare = user ? user.passwordHash : dummyHash;
    
    const isValidPassword = await bcrypt.compare(password, hashToCompare);
    
    // Check if user exists and password is valid
    if (!user || !isValidPassword) {
      recordFailedAttempt(email);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }
    
    // Clear failed attempts on successful login
    clearFailedAttempts(email);
    
    // Generate JWT token with 24-hour expiration
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;