const jwt = require('jsonwebtoken');

// JWT secret from environment variable (required in production)
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_EXPIRES_IN = '24h';

/**
 * Generate JWT token with user payload
 * @param {Object} payload - User data to include in token
 * @returns {string} JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'swarm-app',
    audience: 'swarm-app-users'
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: 'swarm-app',
    audience: 'swarm-app-users'
  });
}

/**
 * Express middleware to authenticate JWT tokens
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    } else {
      return res.status(500).json({ error: 'Token verification failed' });
    }
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken
};