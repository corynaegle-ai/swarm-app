const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Ensure JWT_SECRET is configured
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('JWT verification error:', {
      message: error.message,
      timestamp: new Date().toISOString()
    });
    return res.status(401).json({ error: 'Token verification failed' });
  }
};

module.exports = {
  authenticateToken
};