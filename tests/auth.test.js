const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRouter = require('../src/routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/login', () => {
  test('should return JWT token on valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('admin@example.com');
    expect(response.body.user.role).toBe('admin');
    expect(response.body.expiresIn).toBe('24h');
  });

  test('should return 401 on invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123'
      })
      .expect(401);

    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 401 on invalid password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'wrongpassword'
      })
      .expect(401);

    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 400 on missing email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        password: 'password123'
      })
      .expect(400);

    expect(response.body.error).toBe('Email and password are required');
  });

  test('should return 400 on missing password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com'
      })
      .expect(400);

    expect(response.body.error).toBe('Email and password are required');
  });

  test('should include user role in token payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      })
      .expect(200);

    const decoded = jwt.decode(response.body.token);
    expect(decoded.role).toBe('user');
    expect(decoded.email).toBe('user@example.com');
  });

  test('should set token expiration to 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      })
      .expect(200);

    const decoded = jwt.decode(response.body.token);
    const now = Math.floor(Date.now() / 1000);
    const expectedExpiry = now + (24 * 60 * 60); // 24 hours
    
    expect(decoded.exp).toBeCloseTo(expectedExpiry, -2);
  });
});