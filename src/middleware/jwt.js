const jwt = require('jsonwebtoken');

/**
 * JWT Authentication middleware
 * Validates JWT tokens and attaches user info to request
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required' 
    });
  }

  try {
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback-secret-key',
      {
        issuer: 'swarm-app',
        audience: 'swarm-app-users'
      }
    );

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
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

    console.error('JWT verification error:', error);
    return res.status(500).json({ 
      error: 'Token verification failed' 
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {string|string[]} allowedRoles - Roles that can access the route
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions' 
      });
    }

    next();
  };
};

/**
 * Generate JWT token utility
 * @param {Object} payload - Token payload
 * @param {string} expiresIn - Token expiration (default: 24h)
 */
const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallback-secret-key',
    {
      expiresIn,
      issuer: 'swarm-app',
      audience: 'swarm-app-users'
    }
  );
};

/**
 * Verify token utility
 * @param {string} token - JWT token to verify
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-key',
      {
        issuer: 'swarm-app',
        audience: 'swarm-app-users'
      }
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  generateToken,
  verifyToken
};