const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authRoutes = require('../src/routes/auth');
const { authenticateToken } = require('../src/middleware/jwt');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// Test user data
const testUser = {
  id: 1,
  email: 'test@example.com',
  hashedPassword: '', // Will be set in beforeAll
  role: 'user'
};

beforeAll(async () => {
  // Set JWT_SECRET for tests
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
  
  // Hash test password
  testUser.hashedPassword = await bcrypt.hash('password123', 10);
  
  // Mock the findUserByEmail function for tests
  const authModule = require('../src/routes/auth');
  const originalFindUser = authModule.findUserByEmail;
  
  // Override the findUserByEmail function for testing
  jest.doMock('../src/routes/auth', () => {
    const originalModule = jest.requireActual('../src/routes/auth');
    return {
      ...originalModule,
      findUserByEmail: jest.fn().mockImplementation(async (email) => {
        if (email === testUser.email) {
          return testUser;
        }
        return null;
      })
    };
  });
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe('POST /api/auth/login', () => {
  test('should accept email and password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });

  test('should return JWT token on successful authentication', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(typeof response.body.token).toBe('string');
    
    // Verify it's a valid JWT
    const decoded = jwt.decode(response.body.token);
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('email');
    expect(decoded).toHaveProperty('role');
  });

  test('should return 401 on invalid credentials - wrong password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });
    
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should return 401 on invalid credentials - user not found', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('should return token that expires after 24 hours', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    
    const decoded = jwt.decode(response.body.token);
    const currentTime = Math.floor(Date.now() / 1000);
    const expectedExpiry = currentTime + (24 * 60 * 60); // 24 hours from now
    
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(currentTime);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5); // Allow 5 second tolerance
    expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry - 5);
  });

  test('should include user role in token payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    
    const decoded = jwt.decode(response.body.token);
    expect(decoded).toHaveProperty('role', 'user');
  });

  test('should validate email format', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid-email',
        password: 'password123'
      });
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Validation failed');
  });

  test('should require password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com'
      });
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Validation failed');
  });

  test('should enforce rate limiting', async () => {
    // Make 6 requests quickly (limit is 5)
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          })
      );
    }
    
    const responses = await Promise.all(requests);
    
    // The 6th request should be rate limited
    const rateLimitedResponse = responses[responses.length - 1];
    expect(rateLimitedResponse.status).toBe(429);
  });
});

describe('JWT Middleware', () => {
  test('should authenticate valid token', async () => {
    // First, get a token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    const token = loginResponse.body.token;
    
    // Create a test route to verify middleware
    const testApp = express();
    testApp.use('/protected', authenticateToken, (req, res) => {
      res.json({ message: 'Access granted', user: req.user });
    });
    
    const response = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Access granted');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
  });

  test('should reject request without token', async () => {
    const testApp = express();
    testApp.use('/protected', authenticateToken, (req, res) => {
      res.json({ message: 'Access granted' });
    });
    
    const response = await request(testApp)
      .get('/protected');
    
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Access token required');
  });

  test('should reject invalid token', async () => {
    const testApp = express();
    testApp.use('/protected', authenticateToken, (req, res) => {
      res.json({ message: 'Access granted' });
    });
    
    const response = await request(testApp)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');
    
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid token');
  });
});