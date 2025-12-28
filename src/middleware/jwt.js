const jwt = require('jsonwebtoken');

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied. No token provided.' 
    });
  }
  
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token has expired' 
      });
    }
    
    return res.status(401).json({ 
      error: 'Invalid token' 
    });
  }
};

// Role-based authorization middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    if (req.user.role !== role) {
      return res.status(403).json({ 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  };
};

// Generate new token (for refresh)
const generateToken = (payload) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

// Decode token without verification (for debugging)
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

module.exports = {
  verifyToken,
  requireRole,
  generateToken,
  decodeToken
};