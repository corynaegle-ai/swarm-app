const request = require('supertest');
const app = require('../src/app');
const { dbManager } = require('../src/database/init');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Use in-memory database for testing
beforeAll(() => {
  dbManager.initialize(':memory:');
  
  // Create test user
  const db = dbManager.getDatabase();
  const passwordHash = bcrypt.hashSync('testpassword123', 10);
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run('test@example.com', passwordHash);
});

aftereAll(() => {
  const db = dbManager.getDatabase();
  if (db) {
    db.close();
  }
});

describe('Password Reset Endpoint', () => {
  describe('POST /auth/reset-password/request', () => {
    test('should accept valid email and return success message', async () => {
      const response = await request(app)
        .post('/auth/reset-password/request')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(response.body.message).toContain('reset link has been sent');
      expect(response.body._dev_token).toBeDefined();
    });
    
    test('should return same message for non-existent email', async () => {
      const response = await request(app)
        .post('/auth/reset-password/request')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);
      
      expect(response.body.message).toContain('reset link has been sent');
      expect(response.body._dev_token).toBeUndefined();
    });
    
    test('should reject request without email', async () => {
      const response = await request(app)
        .post('/auth/reset-password/request')
        .send({})
        .expect(400);
      
      expect(response.body.error).toContain('Email is required');
    });
    
    test('should use crypto.randomBytes for token generation', async () => {
      const originalRandomBytes = crypto.randomBytes;
      const mockRandomBytes = jest.fn().mockReturnValue(Buffer.from('mock-random-bytes-32-chars-long!!'));
      crypto.randomBytes = mockRandomBytes;
      
      await request(app)
        .post('/auth/reset-password/request')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
      
      crypto.randomBytes = originalRandomBytes;
    });
  });
  
  describe('POST /auth/reset-password/confirm', () => {
    let resetToken;
    
    beforeEach(async () => {
      // Get a fresh reset token
      const response = await request(app)
        .post('/auth/reset-password/request')
        .send({ email: 'test@example.com' });
      
      resetToken = response.body._dev_token;
    });
    
    test('should reset password with valid token', async () => {
      const newPassword = 'newpassword123';
      
      const response = await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token: resetToken, newPassword })
        .expect(200);
      
      expect(response.body.message).toBe('Password reset successfully');
      
      // Verify password was updated with bcrypt
      const db = dbManager.getDatabase();
      const user = db.prepare('SELECT password_hash FROM users WHERE email = ?')
        .get('test@example.com');
      
      const isValid = await bcrypt.compare(newPassword, user.password_hash);
      expect(isValid).toBe(true);
    });
    
    test('should reject invalid token', async () => {
      const response = await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token: 'invalid-token', newPassword: 'newpassword123' })
        .expect(400);
      
      expect(response.body.error).toBe('Invalid or expired token');
    });
    
    test('should reject used token', async () => {
      // Use the token once
      await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token: resetToken, newPassword: 'newpassword123' })
        .expect(200);
      
      // Try to use it again
      const response = await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token: resetToken, newPassword: 'anotherpassword' })
        .expect(400);
      
      expect(response.body.error).toBe('Invalid or expired token');
    });
    
    test('should reject short password', async () => {
      const response = await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token: resetToken, newPassword: '123' })
        .expect(400);
      
      expect(response.body.error).toContain('Password must be at least 6 characters');
    });
    
    test('should hash password with bcrypt', async () => {
      const originalHash = bcrypt.hash;
      const mockHash = jest.fn().mockResolvedValue('mocked-hash');
      bcrypt.hash = mockHash;
      
      await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token: resetToken, newPassword: 'newpassword123' })
        .expect(200);
      
      expect(mockHash).toHaveBeenCalledWith('newpassword123', 12);
      
      bcrypt.hash = originalHash;
    });
  });
  
  describe('Token expiration', () => {
    test('should set token expiration to 1 hour', async () => {
      const beforeRequest = Math.floor(Date.now() / 1000);
      
      await request(app)
        .post('/auth/reset-password/request')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      const afterRequest = Math.floor(Date.now() / 1000);
      
      // Check database for token expiration
      const db = dbManager.getDatabase();
      const token = db.prepare('SELECT expires_at FROM reset_tokens ORDER BY id DESC LIMIT 1').get();
      
      expect(token.expires_at).toBeGreaterThanOrEqual(beforeRequest + 3600);
      expect(token.expires_at).toBeLessThanOrEqual(afterRequest + 3600);
    });
    
    test('should reject expired token', async () => {
      // Create token and manually expire it
      const response = await request(app)
        .post('/auth/reset-password/request')
        .send({ email: 'test@example.com' });
      
      const token = response.body._dev_token;
      
      // Manually expire the token in database
      const db = dbManager.getDatabase();
      const expiredTime = Math.floor(Date.now() / 1000) - 1; // 1 second ago
      db.prepare('UPDATE reset_tokens SET expires_at = ? WHERE token_hash = ?')
        .run(expiredTime, crypto.createHash('sha256').update(token).digest('hex'));
      
      const confirmResponse = await request(app)
        .post('/auth/reset-password/confirm')
        .send({ token, newPassword: 'newpassword123' })
        .expect(400);
      
      expect(confirmResponse.body.error).toBe('Invalid or expired token');
    });
  });
});