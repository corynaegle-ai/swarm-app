const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT Secret - should match the one used in auth routes
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * JWT Authentication Middleware
 * Verifies JWT token and adds user info to request object
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'swarm-app',
      audience: 'swarm-app-users'
    });

    // Optional: Verify user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid token - user not found'
      });
    }

    // Add user info to request object
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }
    
    console.error('JWT middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {string|Array} allowedRoles - Role(s) that are allowed
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};