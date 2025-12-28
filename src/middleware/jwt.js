const jwt = require('jsonwebtoken');

// JWT middleware for protecting routes
const authenticateToken = (req, res, next) => {
  // Validate JWT_SECRET at runtime, not at module load
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      error: 'Authentication service not properly configured'
    });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'swarm-app',
      audience: 'swarm-app-users'
    });
    
    req.user = decoded;
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

    // Generic JWT error
    return res.status(401).json({
      error: 'Token verification failed'
    });
  }
};

// Middleware to check for specific roles
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

// Middleware to check if user is admin
const requireAdmin = requireRole('admin');

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin
};