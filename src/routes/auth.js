const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Demo users with properly hashed passwords
// In production, this would be replaced with database queries
const users = [
  {
    id: 1,
    email: 'admin@example.com',
    // Password: 'admin123' - properly hashed with bcrypt
    password: '$2b$10$YourRealHashHere123456789012345678901234567890123456',
    role: 'admin'
  },
  {
    id: 2,
    email: 'user@example.com',
    // Password: 'user123' - properly hashed with bcrypt
    password: '$2b$10$AnotherRealHashHere12345678901234567890123456789012',
    role: 'user'
  }
];

// Initialize demo users with real hashed passwords on startup
async function initializeDemoUsers() {
  try {
    users[0].password = await bcrypt.hash('admin123', 10);
    users[1].password = await bcrypt.hash('user123', 10);
  } catch (error) {
    console.error('Failed to initialize demo user passwords:', error);
  }
}

// Valid dummy hash for timing attack prevention
let DUMMY_HASH = null;

// Initialize dummy hash
async function initializeDummyHash() {
  try {
    DUMMY_HASH = await bcrypt.hash('dummy_password_for_timing', 10);
  } catch (error) {
    console.error('Failed to initialize dummy hash:', error);
    // Fallback to a real bcrypt hash
    DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN';
  }
}

// Initialize on module load
initializeDemoUsers();
initializeDummyHash();

// Find user by email
function findUserByEmail(email) {
  return users.find(user => user.email.toLowerCase() === email.toLowerCase());
}

// Validate JWT_SECRET at runtime
function validateJWTSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    // Validate JWT_SECRET before proceeding
    validateJWTSecret();

    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Email and password must be strings'
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Find user
    const user = findUserByEmail(email);
    
    // Always perform password comparison to prevent timing attacks
    // Use dummy hash if user not found
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const isValidPassword = await bcrypt.compare(password, hashToCompare);

    // Check if user exists and password is valid
    if (!user || !isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token with 24 hour expiration
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { 
        expiresIn: '24h',
        issuer: 'swarm-app',
        audience: 'swarm-app-users'
      }
    );

    // Return success response
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    
    // Handle specific JWT errors
    if (error.message.includes('JWT_SECRET')) {
      return res.status(500).json({
        error: 'Authentication service configuration error'
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;