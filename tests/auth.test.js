const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

describe('POST /api/auth/login', () => {
  test('should accept email and password and return JWT token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe('user@example.com');
  });

  test('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
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
        password: 'password123'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return token that expires after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    
    const decoded = jwt.verify(response.body.token, JWT_SECRET);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const issuedTime = decoded.iat * 1000;
    const expectedDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    expect(expirationTime - issuedTime).toBe(expectedDuration);
  });

  test('should include user role in token payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    
    const decoded = jwt.verify(response.body.token, JWT_SECRET);
    expect(decoded.role).toBe('admin');
    expect(decoded.userId).toBeDefined();
    expect(decoded.email).toBe('admin@example.com');
  });

  test('should require email and password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });
});