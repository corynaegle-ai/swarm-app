const request = require('supertest');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const dbManager = require('../src/database/init');

describe('Password Reset API', () => {
  let db;

  beforeAll(() => {
    // Use in-memory database for testing
    db = dbManager.init(':memory:');
    
    // Create test user
    db.prepare(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `).run();
    
    db.prepare('INSERT INTO users (email, password) VALUES (?, ?)')
      .run('test@example.com', 'hashedpassword');
  });

  afterAll(() => {
    dbManager.close();
  });

  afterEach(() => {
    // Clean up tokens after each test
    db.prepare('DELETE FROM password_reset_tokens').run();
  });

  describe('POST /api/auth/password-reset', () => {
    test('should use crypto.randomBytes for token generation', async () => {
      const spy = jest.spyOn(crypto, 'randomBytes');
      
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(spy).toHaveBeenCalledWith(32);
      spy.mockRestore();
    });

    test('should create token that expires in 1 hour', async () => {
      const beforeRequest = Math.floor(Date.now() / 1000);
      
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      const afterRequest = Math.floor(Date.now() / 1000);
      
      // Check token expiration in database
      const token = db.prepare('SELECT expires_at FROM password_reset_tokens').get();
      expect(token).toBeDefined();
      
      // Token should expire between 3599-3601 seconds from now (allowing 1 second variance)
      const expectedMin = beforeRequest + 3599;
      const expectedMax = afterRequest + 3601;
      expect(token.expires_at).toBeGreaterThanOrEqual(expectedMin);
      expect(token.expires_at).toBeLessThanOrEqual(expectedMax);
    });

    test('should validate user exists before creating token', async () => {
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);
      
      // No token should be created for non-existent user
      const tokenCount = db.prepare('SELECT COUNT(*) as count FROM password_reset_tokens').get();
      expect(tokenCount.count).toBe(0);
    });

    test('should not expose token in response', async () => {
      const response = await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(response.body).not.toHaveProperty('token');
      expect(response.body.message).toBe('If an account with this email exists, a password reset link will be sent.');
    });

    test('should validate email format', async () => {
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'invalid-email' })
        .expect(400);
    });

    test('should enforce rate limiting', async () => {
      // Make 3 requests (the limit)
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/password-reset')
          .send({ email: 'test@example.com' })
          .expect(200);
      }
      
      // 4th request should be rate limited
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'test@example.com' })
        .expect(429);
    });
  });

  describe('POST /api/auth/password-reset/confirm', () => {
    let resetToken;
    
    beforeEach(async () => {
      // Create a valid reset token for testing
      resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      
      db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) 
        VALUES (1, ?, ?)
      `).run(tokenHash, expiresAt);
    });

    test('should hash password with bcrypt', async () => {
      const spy = jest.spyOn(bcrypt, 'hash');
      
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ 
          token: resetToken, 
          password: 'NewSecure123!' 
        })
        .expect(200);
      
      expect(spy).toHaveBeenCalledWith('NewSecure123!', 12);
      spy.mockRestore();
    });

    test('should update user password in database', async () => {
      const newPassword = 'NewSecure123!';
      
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ 
          token: resetToken, 
          password: newPassword 
        })
        .expect(200);
      
      // Verify password was updated
      const user = db.prepare('SELECT password FROM users WHERE id = 1').get();
      expect(user.password).not.toBe('hashedpassword');
      
      // Verify bcrypt hash
      const isValid = await bcrypt.compare(newPassword, user.password);
      expect(isValid).toBe(true);
    });

    test('should mark token as used', async () => {
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ 
          token: resetToken, 
          password: 'NewSecure123!' 
        })
        .expect(200);
      
      // Token should be marked as used
      const tokenRecord = db.prepare('SELECT used_at FROM password_reset_tokens').get();
      expect(tokenRecord.used_at).not.toBeNull();
      expect(tokenRecord.used_at).toBeGreaterThan(0);
    });

    test('should reject expired tokens', async () => {
      // Create expired token
      const expiredToken = crypto.randomBytes(32).toString('hex');
      const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) 
        VALUES (1, ?, ?)
      `).run(expiredTokenHash, pastTime);
      
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ 
          token: expiredToken, 
          password: 'NewSecure123!' 
        })
        .expect(400);
    });

    test('should enforce password strength requirements', async () => {
      // Too short
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ token: resetToken, password: '123' })
        .expect(400);
      
      // No uppercase
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ token: resetToken, password: 'lowercase123' })
        .expect(400);
      
      // No number
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ token: resetToken, password: 'NoNumbers!' })
        .expect(400);
    });

    test('should prevent token reuse', async () => {
      // Use token once
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ 
          token: resetToken, 
          password: 'NewSecure123!' 
        })
        .expect(200);
      
      // Try to use same token again
      await request(app)
        .post('/api/auth/password-reset/confirm')
        .send({ 
          token: resetToken, 
          password: 'AnotherSecure456!' 
        })
        .expect(400);
    });
  });

  describe('Security Tests', () => {
    test('should store token hash, not plaintext', async () => {
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      const tokenRecord = db.prepare('SELECT token_hash FROM password_reset_tokens').get();
      expect(tokenRecord.token_hash).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(tokenRecord.token_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should use database for token persistence', async () => {
      await request(app)
        .post('/api/auth/password-reset')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      // Verify token exists in database table
      const count = db.prepare('SELECT COUNT(*) as count FROM password_reset_tokens').get();
      expect(count.count).toBe(1);
    });
  });
});