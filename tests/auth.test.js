const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('POST /api/auth/login', () => {
  test('should return JWT token on valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('admin@example.com');
    expect(response.body.user.role).toBe('admin');
  });

  test('should return 401 on invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 401 on invalid password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 400 on missing email or password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  test('JWT token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });

    const decoded = jwt.decode(response.body.token);
    const expiryTime = decoded.exp;
    const issuedTime = decoded.iat;
    const duration = expiryTime - issuedTime;

    expect(duration).toBe(86400); // 24 hours in seconds
  });

  test('JWT token should include user role in payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password'
      });

    const decoded = jwt.decode(response.body.token);
    expect(decoded.role).toBe('user');
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.userId).toBe(2);
  });
});