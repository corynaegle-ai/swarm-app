const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('POST /api/auth/login', () => {
  test('should return JWT token for valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.role).toBe('admin');

    // Verify token is valid JWT
    const decoded = jwt.decode(response.body.token);
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('role');
    expect(decoded.role).toBe('admin');
  });

  test('should return 401 for invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should return 401 for invalid password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should return 400 for missing email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        password: 'password123'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Email and password are required');
  });

  test('should return 400 for missing password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Email and password are required');
  });

  test('token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    const decoded = jwt.decode(response.body.token);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const issuedTime = decoded.iat * 1000;
    const expectedDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    expect(expirationTime - issuedTime).toBe(expectedDuration);
  });
});