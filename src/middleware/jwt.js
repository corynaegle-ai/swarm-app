const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming User model exists

// JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

/**
 * Middleware to verify JWT tokens
 */
const verifyToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Optional: Fetch fresh user data
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid token - user not found'
      });
    }

    // Add user info to request object
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role || 'user'
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired'
      });
    }
    
    console.error('JWT verification error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Middleware to check user role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  verifyToken,
  requireRole
};