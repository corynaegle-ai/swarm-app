const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('POST /api/auth/login', () => {
  test('should accept email and password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(typeof response.body.token).toBe('string');
  });

  test('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'wrongpassword'
      });
    
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      });
    
    const decoded = jwt.decode(response.body.token);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiration = expirationTime - currentTime;
    
    // Should expire in approximately 24 hours (within 1 minute tolerance)
    expect(timeUntilExpiration).toBeCloseTo(24 * 60 * 60 * 1000, -60000);
  });

  test('token should include user role in payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });
    
    const decoded = jwt.decode(response.body.token);
    expect(decoded.role).toBeDefined();
    expect(decoded.role).toBe('admin');
  });

  test('should return 400 for missing email or password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com'
      });
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});