/**
 * Email validation utility
 * Validates email addresses using regex pattern
 */

// RFC 5322 compliant email regex pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validates an email address format
 * @param {string|null|undefined} email - The email address to validate
 * @returns {boolean} - True if email is valid, false otherwise
 */
export function validateEmail(email) {
  // Handle null/undefined inputs gracefully
  if (email === null || email === undefined) {
    return false;
  }
  
  // Handle non-string inputs
  if (typeof email !== 'string') {
    return false;
  }
  
  // Trim whitespace and check if empty
  const trimmedEmail = email.trim();
  if (trimmedEmail === '') {
    return false;
  }
  
  // Use regex to validate email format
  return EMAIL_REGEX.test(trimmedEmail);
}

// Default export for convenience
export default validateEmail;