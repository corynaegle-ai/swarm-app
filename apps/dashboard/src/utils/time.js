/**
 * Time Utility Functions
 * Provides human-readable relative time formatting for timestamps
 */

/**
 * Convert a timestamp to a human-readable relative time string
 *
 * @param {string|number|Date} timestamp - The timestamp to convert (ISO string, unix timestamp, or Date object)
 * @returns {string} Human-readable relative time string (e.g., "just now", "5min ago", "3hr ago", "2d ago")
 *
 * @example
 * getRelativeTime(new Date()) // "just now"
 * getRelativeTime(Date.now() - 30 * 60 * 1000) // "30min ago"
 * getRelativeTime('2024-01-15T10:30:00Z') // "2d ago" (depending on current time)
 */
export function getRelativeTime(timestamp) {
  // Handle null/undefined timestamps gracefully
  if (timestamp == null) {
    return '';
  }

  const date = new Date(timestamp);

  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now - date;

  // Handle future dates (shouldn't happen, but be safe)
  if (diffMs < 0) {
    return 'just now';
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Less than 1 minute
  if (diffMins < 1) {
    return 'just now';
  }

  // Less than 60 minutes
  if (diffMins < 60) {
    return `${diffMins}min ago`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours}hr ago`;
  }

  // Less than 7 days
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  // Older than 7 days - show formatted date
  return date.toLocaleDateString();
}
