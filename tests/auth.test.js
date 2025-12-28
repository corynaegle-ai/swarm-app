const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');

describe('Password Reset Endpoints', () => {
  describe('POST /api/auth/password-reset-request', () => {
    it('should generate a reset token with crypto.randomBytes', async () => {
      const response = await request(app)
        .post('/api/auth/password-reset-request')
        .send({ email: 'test@example.com' })
        .expect(200);
      
      expect(response.body).toHaveProperty('token');
      expect(response.body.token).toHaveLength(64); // 32 bytes * 2 (hex)
      expect(response.body.message).toBe('Password reset token generated');
    });
    
    it('should require email', async () => {
      const response = await request(app)
        .post('/api/auth/password-reset-request')
        .send({})
        .expect(400);
      
      expect(response.body.error).toBe('Email is required');
    });
  });
  
  describe('POST /api/auth/password-reset', () => {
    let resetToken;
    
    beforeEach(async () => {
      // Generate a fresh token for each test
      const tokenResponse = await request(app)
        .post('/api/auth/password-reset-request')
        .send({ email: 'test@example.com' });
      resetToken = tokenResponse.body.token;
    });
    
    it('should reset password with bcrypt hashing', async () => {
      const newPassword = 'newSecurePassword123';
      
      const response = await request(app)
        .post('/api/auth/password-reset')
        .send({ 
          token: resetToken,
          newPassword 
        })
        .expect(200);
      
      expect(response.body.message).toBe('Password reset successfully');
    });
    
    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .post('/api/auth/password-reset')
        .send({ 
          token: 'invalid-token',
          newPassword: 'newPassword123' 
        })
        .expect(400);
      
      expect(response.body.error).toBe('Invalid or expired token');
    });
    
    it('should reject expired tokens', async () => {
      // Mock Date.now to simulate token expiration
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + (2 * 60 * 60 * 1000)); // 2 hours later
      
      const response = await request(app)
        .post('/api/auth/password-reset')
        .send({ 
          token: resetToken,
          newPassword: 'newPassword123' 
        })
        .expect(400);
      
      expect(response.body.error).toBe('Token has expired');
      
      // Restore original Date.now
      Date.now = originalNow;
    });
    
    it('should reject reused tokens', async () => {
      const newPassword = 'newPassword123';
      
      // First use of token should succeed
      await request(app)
        .post('/api/auth/password-reset')
        .send({ token: resetToken, newPassword })
        .expect(200);
      
      // Second use should fail
      const response = await request(app)
        .post('/api/auth/password-reset')
        .send({ token: resetToken, newPassword })
        .expect(400);
      
      expect(response.body.error).toBe('Token has already been used');
    });
    
    it('should require both token and password', async () => {
      const response = await request(app)
        .post('/api/auth/password-reset')
        .send({ token: resetToken })
        .expect(400);
      
      expect(response.body.error).toBe('Token and new password are required');
    });
  });
  
  describe('Security Requirements', () => {
    it('should use crypto.randomBytes for token generation', () => {
      const crypto = require('crypto');
      const spy = jest.spyOn(crypto, 'randomBytes');
      
      return request(app)
        .post('/api/auth/password-reset-request')
        .send({ email: 'test@example.com' })
        .then(() => {
          expect(spy).toHaveBeenCalledWith(32);
          spy.mockRestore();
        });
    });
    
    it('should hash passwords with bcrypt', async () => {
      const tokenResponse = await request(app)
        .post('/api/auth/password-reset-request')
        .send({ email: 'test@example.com' });
      
      const spy = jest.spyOn(bcrypt, 'hash');
      
      await request(app)
        .post('/api/auth/password-reset')
        .send({ 
          token: tokenResponse.body.token,
          newPassword: 'testPassword123' 
        });
      
      expect(spy).toHaveBeenCalledWith('testPassword123', 12);
      spy.mockRestore();
    });
  });
});