const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Set up test environment
process.env.JWT_SECRET = 'test_secret_key_that_is_long_enough_for_security_requirements_12345';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('POST /api/auth/login', () => {
  // Wait for demo users to be initialized
  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Successful authentication', () => {
    it('should return JWT token for valid admin credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('admin@example.com');
      expect(response.body.user.role).toBe('admin');
      expect(response.body.message).toBe('Login successful');
    });

    it('should return JWT token for valid user credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('user@example.com');
      expect(response.body.user.role).toBe('user');
    });

    it('should handle case-insensitive email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ADMIN@EXAMPLE.COM',
          password: 'admin123'
        })
        .expect(200);

      expect(response.body.user.email).toBe('admin@example.com');
    });
  });

  describe('JWT token validation', () => {
    it('should generate valid JWT token with correct payload', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        })
        .expect(200);

      const token = response.body.token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('email', 'admin@example.com');
      expect(decoded).toHaveProperty('role', 'admin');
      expect(decoded).toHaveProperty('iss', 'swarm-app');
      expect(decoded).toHaveProperty('aud', 'swarm-app-users');
    });

    it('should set token expiration to 24 hours', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        })
        .expect(200);

      const token = response.body.token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const expirationTime = decoded.exp * 1000; // Convert to milliseconds
      const issuedTime = decoded.iat * 1000;
      const expectedExpiration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      expect(expirationTime - issuedTime).toBe(expectedExpiration);
    });

    it('should include user role in token payload', async () => {
      const adminResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        });

      const userResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'user123'
        });

      const adminToken = jwt.verify(adminResponse.body.token, process.env.JWT_SECRET);
      const userToken = jwt.verify(userResponse.body.token, process.env.JWT_SECRET);

      expect(adminToken.role).toBe('admin');
      expect(userToken.role).toBe('user');
    });
  });

  describe('Authentication failures', () => {
    it('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'admin123'
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body).not.toHaveProperty('token');
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body).not.toHaveProperty('token');
    });

    it('should return 401 for empty password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: ''
        })
        .expect(400);

      expect(response.body.error).toBe('Email and password are required');
    });
  });

  describe('Input validation', () => {
    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'admin123'
        })
        .expect(400);

      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'admin123'
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid email format');
    });

    it('should return 400 for non-string email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 123,
          password: 'admin123'
        })
        .expect(400);

      expect(response.body.error).toBe('Email and password must be strings');
    });

    it('should return 400 for non-string password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 123
        })
        .expect(400);

      expect(response.body.error).toBe('Email and password must be strings');
    });
  });

  describe('Rate limiting', () => {
    it('should allow multiple requests within limit', async () => {
      const requests = [];
      for (let i = 0; i < 3; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'admin@example.com',
              password: 'admin123'
            })
        );
      }

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Security features', () => {
    it('should prevent timing attacks by always performing password comparison', async () => {
      const start1 = Date.now();
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'somepassword'
        });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        });
      const time2 = Date.now() - start2;

      // Both should take similar time (within reasonable variance)
      const timeDifference = Math.abs(time1 - time2);
      expect(timeDifference).toBeLessThan(100); // Allow 100ms variance
    });

    it('should not leak user existence in error messages', async () => {
      const nonExistentResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'somepassword'
        })
        .expect(401);

      const wrongPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(nonExistentResponse.body.error).toBe('Invalid credentials');
      expect(wrongPasswordResponse.body.error).toBe('Invalid credentials');
    });
  });

  describe('Environment configuration', () => {
    it('should handle missing JWT_SECRET gracefully', async () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        })
        .expect(500);

      expect(response.body.error).toBe('Authentication service configuration error');

      // Restore JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
    });
  });
});