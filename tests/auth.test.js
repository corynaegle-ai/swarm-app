const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRouter = require('../src/routes/auth');

// Mock User model
jest.mock('../src/models/User');
const User = require('../src/models/User');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/login', () => {
  const mockUser = {
    _id: 'user123',
    email: 'test@example.com',
    password: '$2a$10$hashedpassword',
    role: 'user'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return JWT token on successful authentication', async () => {
    User.findOne.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.role).toBe('user');
  });

  test('should return 401 on invalid credentials', async () => {
    User.findOne.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Invalid credentials');
  });

  test('should return 400 when email or password missing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com'
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('token should expire after 24 hours', async () => {
    User.findOne.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    const decoded = jwt.decode(response.body.token);
    const tokenLifetime = decoded.exp - decoded.iat;
    expect(tokenLifetime).toBe(24 * 60 * 60); // 24 hours in seconds
  });

  test('token should include user role in payload', async () => {
    User.findOne.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    const decoded = jwt.decode(response.body.token);
    expect(decoded.role).toBe('user');
  });
});