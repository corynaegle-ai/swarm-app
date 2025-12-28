const jwt = require('jsonwebtoken');

// JWT secret - should match the one in auth routes
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and adds user info to request
 */
const authenticateToken = (req, res, next) => {
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
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            error: 'Token expired'
          });
        }
        return res.status(403).json({
          error: 'Invalid token'
        });
      }

      // Add user info to request object
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      };

      next();
    });

  } catch (error) {
    console.error('JWT middleware error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {string|string[]} allowedRoles - Role(s) allowed to access the route
 */
const authorizeRole = (allowedRoles) => {
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
  authorizeRole
};