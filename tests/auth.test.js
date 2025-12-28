const request = require('supertest');
const app = require('../src/server');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

describe('Authentication Routes', () => {
  let db;
  
  beforeAll(() => {
    // Use in-memory database for testing
    db = new sqlite3.Database(':memory:');
    
    // Create test tables
    db.serialize(() => {
      db.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(`
        CREATE TABLE reset_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);
    });
  });
  
  beforeEach(async () => {
    // Clean up tables before each test
    await new Promise((resolve) => {
      db.run('DELETE FROM reset_tokens', () => {
        db.run('DELETE FROM users', resolve);
      });
    });
    
    // Create a test user
    await request(app)
      .post('/auth/create-test-user')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123'
      });
  });
  
  afterAll(() => {
    // Stop token cleanup to prevent interference
    const authRoutes = require('../src/routes/auth');
    if (authRoutes.stopTokenCleanup) {
      authRoutes.stopTokenCleanup();
    }
    
    if (db) {
      db.close();
    }
  });

  describe('POST /auth/request-reset', () => {
    it('should accept valid email and return success message', async () => {
      const response = await request(app)
        .post('/auth/request-reset')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.message).toBe('If the email exists in our system, a password reset link has been sent.');
    });

    it('should return same message for non-existent email (security)', async () => {
      const response = await request(app)
        .post('/auth/request-reset')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBe('If the email exists in our system, a password reset link has been sent.');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/request-reset')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error).toBe('Invalid email format');
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/request-reset')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Email is required');
    });
  });

  describe('POST /auth/reset-password', () => {
    let resetToken;
    
    beforeEach(async () => {
      // Create a reset token for testing
      const crypto = require('crypto');
      resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour from now
      
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
          [1, tokenHash, expiresAt],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    it('should successfully reset password with valid token', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123'
        })
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'weak'
        })
        .expect(400);

      expect(response.body.error).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without required characters', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'onlylowercase'
        })
        .expect(400);

      expect(response.body.error).toContain('Password must contain at least one lowercase letter, one uppercase letter, and one number');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'NewPassword123'
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid or expired reset token');
    });

    it('should reject expired token', async () => {
      // Create an expired token
      const crypto = require('crypto');
      const expiredToken = crypto.randomBytes(32).toString('hex');
      const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
      const expiredTime = Date.now() - 1000; // 1 second ago
      
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
          [1, expiredTokenHash, expiredTime],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: expiredToken,
          newPassword: 'NewPassword123'
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid or expired reset token');
    });

    it('should reject missing token or password', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: resetToken })
        .expect(400);

      expect(response.body.error).toBe('Token and new password are required');
    });
  });
});