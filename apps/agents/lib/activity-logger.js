/**
 * Activity Logger - Reusable logging helper for Swarm agents
 * 
 * Fire-and-forget pattern: logging failures never break agent execution
 * 
 * Usage:
 *   const { logActivity, CATEGORIES } = require('./lib/activity-logger');
 *   logActivity('TKT-001', 'forge-agent', CATEGORIES.CODE_GENERATION, 'Generated file');
 */

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:8080';
const AGENT_SERVICE_KEY = process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev';

/**
 * Standard activity categories for consistent logging
 */
const CATEGORIES = {
  TICKET_CLAIMED: 'ticket_claimed',
  CODE_GENERATION: 'code_generation',
  FILE_CREATED: 'file_created',
  FILE_MODIFIED: 'file_modified',
  GIT_OPERATION: 'git_operation',
  PR_CREATED: 'pr_created',
  API_CALL: 'api_call',
  API_RESPONSE: 'api_response',
  ERROR: 'error',
  COMPLETION: 'completion'
};

/**
 * Log an activity event for a ticket
 * 
 * @param {string} ticketId - The ticket ID (e.g., 'TKT-001')
 * @param {string} agentId - The agent identifier (e.g., 'forge-agent-1')
 * @param {string} category - Activity category from CATEGORIES
 * @param {string} message - Human-readable description
 * @param {object} metadata - Optional additional data (default: {})
 * @returns {Promise<boolean>} - True if logged successfully, false otherwise
 * 
 * Note: This function is fire-and-forget. It catches all errors internally
 * and logs them to console. It will never throw or reject.
 */
async function logActivity(ticketId, agentId, category, message, metadata = {}) {
  try {
    const url = `${PLATFORM_URL}/api/tickets/${encodeURIComponent(ticketId)}/activity`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': AGENT_SERVICE_KEY
      },
      body: JSON.stringify({
        agent_id: agentId,
        category: category,
        message: message,
        metadata: metadata
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[ActivityLogger] Failed to log activity: ${response.status} - ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    // Fire-and-forget: log error but never throw
    console.error(`[ActivityLogger] Error logging activity: ${error.message}`);
    return false;
  }
}

/**
 * Convenience wrapper that returns immediately without waiting
 * Use when you don't need to know if logging succeeded
 * 
 * @param {...args} - Same arguments as logActivity
 */
function logActivityFireAndForget(ticketId, agentId, category, message, metadata = {}) {
  // Don't await - let it run in background
  logActivity(ticketId, agentId, category, message, metadata);
}

module.exports = { 
  logActivity, 
  logActivityFireAndForget,
  CATEGORIES,
  // Export config for testing/debugging
  config: {
    PLATFORM_URL,
    AGENT_SERVICE_KEY
  }
};
