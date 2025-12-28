const jwt = require('jsonwebtoken');
const { verifyToken, requireRole, generateToken, verifyTokenSync } = require('../src/middleware/jwt');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Mock Express request/response objects
const createMockReq = (headers = {}) => ({
  headers: headers
});

const createMockRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res)
  };
  return res;
};

const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('JWT Middleware', () => {
  describe('verifyToken', () => {
    test('should verify valid token and set req.user', () => {
      const payload = {
        userId: 1,
        email: 'test@example.com',
        role: 'user'
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      
      const req = createMockReq({
        authorization: `Bearer ${token}`
      });
      const res = createMockRes();
      
      verifyToken(req, res, mockNext);
      
      expect(req.user).toEqual({
        userId: 1,
        email: 'test@example.com',
        role: 'user'
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should return 401 for missing authorization header', () => {
      const req = createMockReq();
      const res = createMockRes();
      
      verifyToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization header is required',
        code: 'MISSING_AUTH_HEADER'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 401 for invalid authorization format', () => {
      const req = createMockReq({
        authorization: 'InvalidFormat token'
      });
      const res = createMockRes();
      
      verifyToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization header must start with Bearer',
        code: 'INVALID_AUTH_FORMAT'
      });
    });

    test('should return 401 for expired token', () => {
      const payload = { userId: 1, email: 'test@example.com', role: 'user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' }); // Expired
      
      const req = createMockReq({
        authorization: `Bearer ${token}`
      });
      const res = createMockRes();
      
      verifyToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    });

    test('should return 401 for invalid token', () => {
      const req = createMockReq({
        authorization: 'Bearer invalid.token.here'
      });
      const res = createMockRes();
      
      verifyToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    });
  });

  describe('requireRole', () => {
    test('should allow access for user with required role', () => {
      const req = {
        user: { userId: 1, email: 'admin@example.com', role: 'admin' }
      };
      const res = createMockRes();
      
      const middleware = requireRole('admin');
      middleware(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should allow access for user with one of multiple required roles', () => {
      const req = {
        user: { userId: 1, email: 'user@example.com', role: 'user' }
      };
      const res = createMockRes();
      
      const middleware = requireRole(['admin', 'user']);
      middleware(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should return 403 for user without required role', () => {
      const req = {
        user: { userId: 1, email: 'user@example.com', role: 'user' }
      };
      const res = createMockRes();
      
      const middleware = requireRole('admin');
      middleware(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 401 for missing user', () => {
      const req = {};
      const res = createMockRes();
      
      const middleware = requireRole('admin');
      middleware(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    });
  });

  describe('generateToken', () => {
    test('should generate valid JWT token with default expiration', () => {
      const payload = {
        userId: 1,
        email: 'test@example.com',
        role: 'user'
      };
      
      const token = generateToken(payload);
      
      expect(typeof token).toBe('string');
      
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('user');
      expect(decoded.exp).toBeDefined();
    });

    test('should generate token with custom expiration', () => {
      const payload = { userId: 1 };
      const token = generateToken(payload, '1h');
      
      const decoded = jwt.verify(token, JWT_SECRET);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (60 * 60); // 1 hour
      
      // Allow 10 second tolerance
      expect(decoded.exp).toBeGreaterThan(expectedExp - 10);
      expect(decoded.exp).toBeLessThan(expectedExp + 10);
    });
  });

  describe('verifyTokenSync', () => {
    test('should verify token and return payload', () => {
      const payload = {
        userId: 1,
        email: 'test@example.com',
        role: 'user'
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      
      const decoded = verifyTokenSync(token);
      
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('user');
    });

    test('should throw error for invalid token', () => {
      expect(() => {
        verifyTokenSync('invalid.token');
      }).toThrow();
    });
  });
});