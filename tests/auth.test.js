const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const bcrypt = require('bcrypt');

describe('POST /api/auth/login', () => {
  let testUser;

  beforeEach(async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    testUser = await User.create({
      email: 'test@example.com',
      password: hashedPassword,
      role: 'admin'
    });
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  it('should accept email and password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
  });

  it('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(typeof response.body.token).toBe('string');
  });

  it('should return 401 on invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should include user role in token payload', async () => {
    const jwt = require('jsonwebtoken');
    
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    const decoded = jwt.decode(response.body.token);
    expect(decoded.role).toBe('admin');
  });

  it('should set token to expire after 24 hours', async () => {
    const jwt = require('jsonwebtoken');
    
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });

    const decoded = jwt.decode(response.body.token);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeDiff = expirationTime - currentTime;
    const hoursUntilExpiry = timeDiff / (1000 * 60 * 60);
    
    expect(hoursUntilExpiry).toBeCloseTo(24, 0);
  });
});