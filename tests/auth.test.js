const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const User = require('../src/models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock the User model
jest.mock('../src/models/User');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return JWT token on successful authentication', async () => {
    const mockUser = {
      _id: '123',
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user'
    };

    User.findOne.mockResolvedValue(mockUser);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('test@example.com');
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
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should return 401 on wrong password', async () => {
    const mockUser = {
      _id: '123',
      email: 'test@example.com',
      password: await bcrypt.hash('correctpassword', 10),
      role: 'user'
    };

    User.findOne.mockResolvedValue(mockUser);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('should include user role in token payload', async () => {
    const mockUser = {
      _id: '123',
      email: 'admin@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'admin'
    };

    User.findOne.mockResolvedValue(mockUser);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    
    const decoded = jwt.verify(response.body.token, JWT_SECRET);
    expect(decoded.role).toBe('admin');
    expect(decoded.userId).toBe('123');
    expect(decoded.email).toBe('admin@example.com');
  });

  test('token should expire after 24 hours', async () => {
    const mockUser = {
      _id: '123',
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user'
    };

    User.findOne.mockResolvedValue(mockUser);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    const decoded = jwt.verify(response.body.token, JWT_SECRET);
    const expiresIn = decoded.exp - decoded.iat;
    
    // Should expire in 24 hours (86400 seconds)
    expect(expiresIn).toBe(86400);
  });
});