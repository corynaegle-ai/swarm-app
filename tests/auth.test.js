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
        email: 'user@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.role).toBe('user');
  });

  test('should return 401 on invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should return 401 on invalid password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should include user role in token payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    
    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'your-secret-key');
    expect(decoded).toHaveProperty('role', 'admin');
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('email', 'admin@example.com');
  });

  test('token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      });

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'your-secret-key');
    const expirationTime = decoded.exp - decoded.iat;
    expect(expirationTime).toBe(24 * 60 * 60); // 24 hours in seconds
  });

  test('should return 400 on missing email or password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Email and password are required');
  });
});