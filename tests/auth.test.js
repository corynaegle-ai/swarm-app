const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Create test app
const app = express();
app.use(express.json());

// Import auth routes
const authRoutes = require('../src/routes/auth');
app.use('/api/auth', authRoutes);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

describe('POST /api/auth/login', () => {
  describe('Successful Authentication', () => {
    test('should return JWT token for valid admin credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'admin@example.com');
      expect(response.body.user).toHaveProperty('role', 'admin');
      
      // Verify token is valid and contains correct payload
      const decoded = jwt.verify(response.body.token, JWT_SECRET);
      expect(decoded).toHaveProperty('userId', 1);
      expect(decoded).toHaveProperty('email', 'admin@example.com');
      expect(decoded).toHaveProperty('role', 'admin');
      expect(decoded).toHaveProperty('exp');
    });

    test('should return JWT token for valid user credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'userpass'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('role', 'user');
    });

    test('should handle case insensitive email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ADMIN@EXAMPLE.COM',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('admin@example.com');
    });
  });

  describe('Authentication Failures', () => {
    test('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_FAILED');
      expect(response.body).not.toHaveProperty('token');
    });

    test('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_FAILED');
    });
  });

  describe('Input Validation', () => {
    test('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email and password are required');
      expect(response.body).toHaveProperty('code', 'MISSING_CREDENTIALS');
    });

    test('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'MISSING_CREDENTIALS');
    });

    test('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid email format');
      expect(response.body).toHaveProperty('code', 'INVALID_EMAIL_FORMAT');
    });

    test('should return 400 for non-string inputs', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 123,
          password: ['password']
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'INVALID_INPUT_TYPE');
    });
  });

  describe('Token Properties', () => {
    test('should generate token that expires in 24 hours', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      
      const decoded = jwt.verify(response.body.token, JWT_SECRET);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (24 * 60 * 60); // 24 hours from now
      
      // Allow 10 second tolerance for test execution time
      expect(decoded.exp).toBeGreaterThan(now + (24 * 60 * 60) - 10);
      expect(decoded.exp).toBeLessThan(now + (24 * 60 * 60) + 10);
    });

    test('should include user role in token payload', async () => {
      const adminResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'password123'
        });

      const adminDecoded = jwt.verify(adminResponse.body.token, JWT_SECRET);
      expect(adminDecoded.role).toBe('admin');

      const userResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'userpass'
        });

      const userDecoded = jwt.verify(userResponse.body.token, JWT_SECRET);
      expect(userDecoded.role).toBe('user');
    });
  });

  describe('Rate Limiting', () => {
    test('should allow up to 5 login attempts', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
        
        expect(response.status).toBe(401);
      }
    }, 10000);

    test('should block 6th login attempt with rate limit', async () => {
      // Make 5 failed attempts to hit the rate limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'ratelimit@example.com',
            password: 'wrongpassword'
          });
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ratelimit@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(429);
      expect(response.body).toHaveProperty('error', 'Too many login attempts, please try again later');
      expect(response.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
    }, 15000);
  });
});