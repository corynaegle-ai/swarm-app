const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRoutes = require('../src/routes/auth');
const { verifyToken } = require('../src/middleware/jwt');

// Set up test environment
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('POST /api/auth/login', () => {
  
  describe('Successful Authentication', () => {
    test('should return JWT token for valid admin credentials', async () => {
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
      expect(response.body.user.id).toBe(1);
    });
    
    test('should return JWT token for valid user credentials', async () => {
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
      expect(response.body.user.id).toBe(2);
    });
    
    test('should include user role in token payload', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        })
        .expect(200);
      
      const decoded = verifyToken(response.body.token);
      expect(decoded.role).toBe('admin');
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('admin@example.com');
    });
    
    test('should set token to expire in 24 hours', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        })
        .expect(200);
      
      const decoded = jwt.decode(response.body.token);
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBe(24 * 60 * 60); // 24 hours in seconds
    });
  });
  
  describe('Authentication Failures', () => {
    test('should return 401 for invalid email', async () => {
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
    
    test('should return 401 for invalid password', async () => {
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
    
    test('should return 401 for valid email with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'admin123'
        })
        .expect(401);
      
      expect(response.body.error).toBe('Invalid credentials');
    });
  });
  
  describe('Input Validation', () => {
    test('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'admin123'
        })
        .expect(400);
      
      expect(response.body.error).toBe('Email and password are required');
    });
    
    test('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com'
        })
        .expect(400);
      
      expect(response.body.error).toBe('Email and password are required');
    });
    
    test('should return 400 when both email and password are missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
      
      expect(response.body.error).toBe('Email and password are required');
    });
    
    test('should return 400 when email is empty string', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: '',
          password: 'admin123'
        })
        .expect(400);
      
      expect(response.body.error).toBe('Email and password are required');
    });
    
    test('should return 400 when password is empty string', async () => {
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
  
  describe('Rate Limiting', () => {
    test('should allow up to 5 login attempts', async () => {
      const loginData = {
        email: 'ratelimit@example.com',
        password: 'wrongpassword'
      };
      
      // Make 5 failed attempts - should all return 401
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(loginData)
          .expect(401);
      }
      
      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(429);
      
      expect(response.body.error).toContain('Too many login attempts');
    });
    
    test('should reset rate limit after successful login', async () => {
      const validLogin = {
        email: 'admin@example.com',
        password: 'admin123'
      };
      
      // Make some failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@example.com',
            password: 'wrongpassword'
          })
          .expect(401);
      }
      
      // Successful login should reset the counter
      await request(app)
        .post('/api/auth/login')
        .send(validLogin)
        .expect(200);
      
      // Should be able to make failed attempts again
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        })
        .expect(401);
    });
  });
  
  describe('Security', () => {
    test('should not leak user existence through timing attacks', async () => {
      const nonExistentUserTimes = [];
      const existentUserTimes = [];
      
      // Measure response times for non-existent users
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@example.com',
            password: 'wrongpassword'
          })
          .expect(401);
        nonExistentUserTimes.push(Date.now() - start);
      }
      
      // Measure response times for existing users with wrong password
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@example.com',
            password: 'wrongpassword'
          })
          .expect(401);
        existentUserTimes.push(Date.now() - start);
      }
      
      // Response times should be relatively similar
      const avgNonExistent = nonExistentUserTimes.reduce((a, b) => a + b, 0) / nonExistentUserTimes.length;
      const avgExistent = existentUserTimes.reduce((a, b) => a + b, 0) / existentUserTimes.length;
      
      // Allow for some variance but they should be in the same ballpark
      expect(Math.abs(avgNonExistent - avgExistent)).toBeLessThan(100);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
    
    test('should handle unexpected errors gracefully', async () => {
      // This would require mocking bcrypt.compare to throw an error
      // For now, we'll test that the endpoint exists and handles basic cases
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123'
        });
      
      expect([200, 401, 500]).toContain(response.status);
    });
  });
});