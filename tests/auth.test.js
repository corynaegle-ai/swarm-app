const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const User = require('../src/models/User');

// Mock User model
jest.mock('../src/models/User');

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 when email or password is missing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  it('should return 401 for invalid email', async () => {
    User.findOne.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should return 401 for invalid password', async () => {
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

  it('should return JWT token on successful authentication', async () => {
    const password = 'correctpassword';
    const hashedPassword = await bcrypt.hash(password, 10);
    const mockUser = {
      _id: '123',
      email: 'test@example.com',
      password: hashedPassword,
      role: 'admin'
    };

    User.findOne.mockResolvedValue(mockUser);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: password
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.role).toBe('admin');

    // Verify token contains user role and expires in 24 hours
    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'your-secret-key');
    expect(decoded.role).toBe('admin');
    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60); // 24 hours in seconds
  });
});