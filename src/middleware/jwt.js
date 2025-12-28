const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and adds user info to request object
 */
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            message: 'Token expired'
          });
        }
        return res.status(403).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Add user info to request object
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('JWT middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Role Authorization Middleware
 * Checks if user has required role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Generate JWT Token
 * Helper function for token generation
 */
const generateToken = (payload, options = {}) => {
  const defaultOptions = {
    expiresIn: '24h'
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your-secret-key',
    { ...defaultOptions, ...options }
  );
};

/**
 * Verify JWT Token
 * Helper function for token verification
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  generateToken,
  verifyToken
};