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
        password: 'password'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.role).toBe('admin');
  });

  test('should return 401 for invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should return 400 for missing email or password', async () => {
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
        password: 'password'
      });

    const decoded = jwt.decode(response.body.token);
    const expirationTime = decoded.exp - decoded.iat;
    expect(expirationTime).toBe(24 * 60 * 60); // 24 hours in seconds
  });

  test('token should include user role in payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password'
      });

    const decoded = jwt.decode(response.body.token);
    expect(decoded).toHaveProperty('role', 'user');
    expect(decoded).toHaveProperty('email', 'user@example.com');
  });
});