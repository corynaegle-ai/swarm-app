const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    await User.create({
      email: 'test@example.com',
      password: hashedPassword,
      role: 'admin'
    });
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  test('should accept email and password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
  });

  test('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    
    // Verify token is valid JWT
    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'default-secret-key');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('admin');
  });

  test('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
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
        password: 'testpassword123'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  test('token should expire after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'default-secret-key');
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const issuedTime = decoded.iat * 1000;
    const expectedExpiration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    expect(expirationTime - issuedTime).toBe(expectedExpiration);
  });

  test('token should include user role in payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'default-secret-key');
    expect(decoded.role).toBe('admin');
    expect(decoded.userId).toBeDefined();
    expect(decoded.email).toBe('test@example.com');
  });
});