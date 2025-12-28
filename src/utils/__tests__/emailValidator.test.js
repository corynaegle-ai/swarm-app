import { validateEmail } from '../emailValidator.js';

describe('validateEmail', () => {
  test('should return true for valid email addresses', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@domain.co.uk')).toBe(true);
    expect(validateEmail('user+tag@example.org')).toBe(true);
    expect(validateEmail('valid_email@sub.domain.com')).toBe(true);
  });

  test('should return false for invalid email addresses', () => {
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('user..name@example.com')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });

  test('should handle null and undefined inputs gracefully', () => {
    expect(validateEmail(null)).toBe(false);
    expect(validateEmail(undefined)).toBe(false);
  });

  test('should handle non-string inputs gracefully', () => {
    expect(validateEmail(123)).toBe(false);
    expect(validateEmail({})).toBe(false);
    expect(validateEmail([])).toBe(false);
    expect(validateEmail(true)).toBe(false);
  });

  test('should trim whitespace and validate', () => {
    expect(validateEmail('  test@example.com  ')).toBe(true);
    expect(validateEmail(' invalid-email ')).toBe(false);
  });
});