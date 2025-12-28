const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// In-memory user store for demonstration
// In production, this would be replaced with a proper database
const users = new Map([
  ['admin@example.com', {
    id: 1,
    email: 'admin@example.com',
    // Password: 'password123' hashed with bcrypt
    passwordHash: '$2b$10$rQZ5Kx8Kx8Kx8Kx8Kx8Kx.EXAMPLE_HASH_REPLACE_IN_PRODUCTION',
    role: 'admin'
  }],
  ['user@example.com', {
    id: 2,
    email: 'user@example.com',
    // Password: 'userpass' hashed with bcrypt
    passwordHash: '$2b$10$anotherExampleHashForUserReplaceMeInProduction',
    role: 'user'
  }]
]);

// Rate limiting: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many login attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// JWT secret - in production, this should be from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = '24h';

/**
 * Find user by email address
 * @param {string} email - User email
 * @returns {Object|null} User object or null if not found
 */
function findUserByEmail(email) {
  return users.get(email.toLowerCase()) || null;
}

/**
 * Verify password against stored hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored password hash
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
  try {
    // For demo purposes with example hashes, we'll do simple comparison
    // In production, this would use bcrypt.compare(password, hash)
    if (hash.includes('EXAMPLE_HASH')) {
      return password === 'password123';
    }
    if (hash.includes('anotherExampleHash')) {
      return password === 'userpass';
    }
    return await bcrypt.compare(password, hash);
  } catch (error) {
    return false;
  }
}

/**
 * Generate JWT token for authenticated user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Email and password must be strings',
        code: 'INVALID_INPUT_TYPE'
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        code: 'INVALID_EMAIL_FORMAT'
      });
    }

    // Find user and verify password
    const user = findUserByEmail(email);
    let isValidPassword = false;
    
    if (user) {
      isValidPassword = await verifyPassword(password, user.passwordHash);
    } else {
      // Perform a dummy password check to prevent timing attacks
      await verifyPassword(password, '$2b$10$dummyHashToPreventTimingAttacks');
    }

    // Consistent response time for both invalid user and invalid password
    if (!user || !isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'AUTHENTICATION_FAILED'
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Successful authentication
    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;