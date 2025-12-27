const request = require('supertest');
const express = require('express');
const authRouter = require('../src/routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/login', () => {
  test('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password'
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.role).toBeDefined();
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

  test('should return 401 for non-existent user', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
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

  test('should set token to expire after 24 hours', async () => {
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
});