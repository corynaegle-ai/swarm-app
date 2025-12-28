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
        email: 'admin@example.com',
        password: 'password'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    
    // Verify token is valid JWT
    const decoded = jwt.decode(response.body.token);
    expect(decoded).toBeDefined();
  });

  test('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'wrongpassword'
      });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });
    
    const decoded = jwt.decode(response.body.token);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const issuedTime = decoded.iat * 1000;
    const expectedExpiration = issuedTime + (24 * 60 * 60 * 1000); // 24 hours
    
    expect(expirationTime).toBe(expectedExpiration);
  });

  test('should include user role in token payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });
    
    const decoded = jwt.decode(response.body.token);
    expect(decoded.role).toBe('admin');
  });
});