const request = require('supertest');
const express = require('express');
const authRouter = require('../src/routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/login', () => {
  test('should accept email and password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
  
  test('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    
    // Verify token structure
    const decoded = jwt.decode(response.body.token);
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('email');
    expect(decoded).toHaveProperty('role');
  });
  
  test('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid@example.com',
        password: 'wrongpassword'
      });
    
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
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
  
  test('token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });
    
    const decoded = jwt.decode(response.body.token);
    const now = Math.floor(Date.now() / 1000);
    const expectedExpiry = now + (24 * 60 * 60); // 24 hours
    
    expect(decoded.exp).toBeCloseTo(expectedExpiry, -1);
  });
});