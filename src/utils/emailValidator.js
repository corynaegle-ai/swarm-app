/**
 * Email validation utility
 * Validates email addresses using regex pattern
 */

/**
 * Validates an email address format using regex
 * @param {string|null|undefined} email - The email address to validate
 * @returns {boolean} - Returns true if email is valid, false otherwise
 */
export function validateEmail(email) {
  // Handle null/undefined inputs gracefully
  if (email === null || email === undefined || typeof email !== 'string') {
    return false;
  }

  // Comprehensive email regex pattern
  // Matches: user@domain.com, user.name+tag@example.co.uk, etc.
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(email.trim());
}

export default validateEmail;