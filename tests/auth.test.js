const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Clear users before each test
    await User.deleteMany({});
  });

  it('should return JWT token on successful authentication', async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    await User.create({
      email: 'test@example.com',
      password: hashedPassword,
      role: 'user'
    });

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
  });

  it('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should include user role in token payload', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    await User.create({
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin'
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'your-secret-key');
    expect(decoded.role).toBe('admin');
  });

  it('should generate token that expires after 24 hours', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    await User.create({
      email: 'test@example.com',
      password: hashedPassword,
      role: 'user'
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'your-secret-key');
    const expirationTime = decoded.exp - decoded.iat;
    expect(expirationTime).toBe(24 * 60 * 60); // 24 hours in seconds
  });
});