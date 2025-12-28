const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = require('../src/app'); // Assuming main app file
const User = require('../src/models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

describe('POST /api/auth/login', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    role: 'admin'
  };

  beforeEach(async () => {
    // Clear users and create test user
    await User.deleteMany({});
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    await User.create({
      email: testUser.email,
      password: hashedPassword,
      role: testUser.role
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  it('should accept email and password and return JWT token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(200);

    expect(response.body.token).toBeDefined();
    expect(response.body.message).toBe('Login successful');
  });

  it('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'wrongpassword'
      })
      .expect(401);

    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should return 401 for non-existent user', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123'
      })
      .expect(401);

    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should generate token that expires after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(200);

    const decoded = jwt.verify(response.body.token, JWT_SECRET);
    const expirationTime = decoded.exp * 1000;
    const issuedTime = decoded.iat * 1000;
    const duration = expirationTime - issuedTime;
    
    // Should be 24 hours (86400000 ms)
    expect(duration).toBe(24 * 60 * 60 * 1000);
  });

  it('should include user role in token payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(200);

    const decoded = jwt.verify(response.body.token, JWT_SECRET);
    expect(decoded.role).toBe(testUser.role);
    expect(decoded.email).toBe(testUser.email);
  });

  it('should return 400 when email is missing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        password: testUser.password
      })
      .expect(400);

    expect(response.body.error).toBe('Email and password are required');
  });

  it('should return 400 when password is missing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email
      })
      .expect(400);

    expect(response.body.error).toBe('Email and password are required');
  });
});