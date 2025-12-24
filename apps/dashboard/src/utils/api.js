/**
 * Centralized API Client with Token Management
 * Provides token-aware fetch wrapper that attaches Bearer tokens from localStorage
 * and handles 401 responses globally
 */

const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'swarm_token';

/**
 * Get authentication token from localStorage
 * @returns {string|null} The stored JWT token or null if not present
 */
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store authentication token in localStorage
 * @param {string} token - The JWT token to store
 */
export function storeAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clear authentication token from localStorage
 */
export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Token-aware fetch wrapper that automatically attaches Bearer token
 * and handles 401 unauthorized responses
 *
 * @param {string} endpoint - API endpoint (relative path starting with /)
 * @param {Object} options - Fetch options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.headers] - Additional headers
 * @param {Object|string|FormData} [options.body] - Request body
 * @param {boolean} [options.skipAuth=false] - Skip adding Authorization header
 * @returns {Promise<Response>} Fetch response object
 */
export async function apiCall(endpoint, options = {}) {
  const token = getAuthToken();
  
  // Don't set Content-Type for FormData (browser sets it with boundary)
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(token && !options.skipAuth && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status === 401) {
    clearAuthToken();
    // Redirect to signin page
    window.location.href = '/signin';
  }

  return response;
}

/**
 * Convenience method for GET requests
 * @param {string} endpoint - API endpoint
 * @param {Object} [options] - Additional fetch options
 * @returns {Promise<Response>} Fetch response object
 */
export async function apiGet(endpoint, options = {}) {
  return apiCall(endpoint, { ...options, method: 'GET' });
}

/**
 * Convenience method for POST requests
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body (will be JSON stringified)
 * @param {Object} [options] - Additional fetch options
 * @returns {Promise<Response>} Fetch response object
 */
export async function apiPost(endpoint, body, options = {}) {
  return apiCall(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body)
  });
}

/**
 * Convenience method for PUT requests
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body (will be JSON stringified)
 * @param {Object} [options] - Additional fetch options
 * @returns {Promise<Response>} Fetch response object
 */
export async function apiPut(endpoint, body, options = {}) {
  return apiCall(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/**
 * Convenience method for DELETE requests
 * @param {string} endpoint - API endpoint
 * @param {Object} [options] - Additional fetch options
 * @returns {Promise<Response>} Fetch response object
 */
export async function apiDelete(endpoint, options = {}) {
  return apiCall(endpoint, { ...options, method: 'DELETE' });
}
