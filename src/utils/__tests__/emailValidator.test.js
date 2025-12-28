import { validateEmail } from '../emailValidator.js';

describe('validateEmail', () => {
  describe('valid emails', () => {
    test('should return true for valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user_name@example-domain.com',
        'test123@test123.com',
        'a@b.co'
      ];
      
      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });
  });
  
  describe('invalid emails', () => {
    test('should return false for invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test..test@example.com',
        'test@example.',
        'test@.example.com',
        'test @example.com',
        'test@example .com'
      ];
      
      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });
  
  describe('null and undefined handling', () => {
    test('should return false for null input', () => {
      expect(validateEmail(null)).toBe(false);
    });
    
    test('should return false for undefined input', () => {
      expect(validateEmail(undefined)).toBe(false);
    });
  });
  
  describe('edge cases', () => {
    test('should return false for empty string', () => {
      expect(validateEmail('')).toBe(false);
    });
    
    test('should return false for whitespace only', () => {
      expect(validateEmail('   ')).toBe(false);
    });
    
    test('should return false for non-string inputs', () => {
      expect(validateEmail(123)).toBe(false);
      expect(validateEmail({})).toBe(false);
      expect(validateEmail([])).toBe(false);
      expect(validateEmail(true)).toBe(false);
    });
    
    test('should handle emails with whitespace padding', () => {
      expect(validateEmail('  test@example.com  ')).toBe(true);
    });
  });
});