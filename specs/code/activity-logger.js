/**
 * Activity Logger - Real-time agent activity logging
 * 
 * Logs agent activities to the Platform API for real-time dashboard updates.
 * All activities are stored in ticket_events table and broadcast via WebSocket.
 * 
 * Categories:
 * - ticket_claimed: Agent claimed a ticket
 * - code_generation: Starting code generation phase
 * - ai_request: Prompt sent to AI API (Claude)
 * - ai_response: Response received from AI API
 * - file_created: File written to repo
 * - file_modified: Existing file modified
 * - git_operation: Git command executed (clone, branch, commit, push)
 * - pr_created: Pull request created
 * - error: Error occurred during processing
 * 
 * @module activity-logger
 */

const http = require('http');
const https = require('https');

// Configuration from environment
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:8080';
const AGENT_KEY = process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev';
const AGENT_ID = process.env.AGENT_ID || 'forge-agent';

// Token truncation limits to avoid huge payloads
const MAX_PROMPT_LENGTH = 2000;
const MAX_RESPONSE_LENGTH = 2000;

/**
 * Truncate text with ellipsis indicator
 */
function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + `... [truncated, ${text.length} chars total]`;
}

/**
 * Make HTTP POST request to Platform API
 */
function postActivity(ticketId, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${PLATFORM_URL}/api/tickets/${ticketId}/activity`);
    const isHttps = urlObj.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': AGENT_KEY
      },
      timeout: 5000 // 5s timeout for logging - don't block agent work
    };
    
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          reject(new Error(`Activity log failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Activity log timeout'));
    });
    
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * Log activity to Platform API
 * Fire-and-forget pattern - errors are logged but don't block agent work
 */
async function logActivity(ticketId, category, message, metadata = {}) {
  if (!ticketId) {
    console.error('[Activity] No ticketId provided, skipping log');
    return;
  }
  
  const payload = {
    agent_id: AGENT_ID,
    category,
    message,
    metadata
  };
  
  try {
    await postActivity(ticketId, payload);
    console.log(`[Activity] Logged: ${category} - ${message}`);
  } catch (err) {
    // Don't fail the agent if logging fails
    console.error(`[Activity] Failed to log ${category}:`, err.message);
  }
}

// ============================================================================
// Convenience methods for common activity types
// ============================================================================

/**
 * Log ticket claimed
 */
function logTicketClaimed(ticketId, ticketTitle) {
  return logActivity(ticketId, 'ticket_claimed', `Claimed ticket: ${ticketTitle}`, {
    title: ticketTitle
  });
}

/**
 * Log code generation starting
 */
function logCodeGenerationStart(ticketId, model) {
  return logActivity(ticketId, 'code_generation', `Starting code generation with ${model}`, {
    model,
    phase: 'start'
  });
}

/**
 * Log AI API request (prompt sent)
 */
function logAiRequest(ticketId, model, promptPreview, totalPromptTokens = null) {
  return logActivity(ticketId, 'ai_request', `Sending request to ${model}`, {
    model,
    prompt_preview: truncate(promptPreview, MAX_PROMPT_LENGTH),
    prompt_tokens: totalPromptTokens
  });
}

/**
 * Log AI API response received
 */
function logAiResponse(ticketId, model, responsePreview, usage = {}) {
  return logActivity(ticketId, 'ai_response', `Received response from ${model}`, {
    model,
    response_preview: truncate(responsePreview, MAX_RESPONSE_LENGTH),
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
  });
}

/**
 * Log file created
 */
function logFileCreated(ticketId, filepath, linesOfCode = null) {
  return logActivity(ticketId, 'file_created', `Created file: ${filepath}`, {
    filepath,
    lines: linesOfCode
  });
}

/**
 * Log file modified
 */
function logFileModified(ticketId, filepath, linesChanged = null) {
  return logActivity(ticketId, 'file_modified', `Modified file: ${filepath}`, {
    filepath,
    lines_changed: linesChanged
  });
}

/**
 * Log git operation
 */
function logGitOperation(ticketId, operation, details = {}) {
  return logActivity(ticketId, 'git_operation', `Git: ${operation}`, {
    operation,
    ...details
  });
}

/**
 * Log PR created
 */
function logPrCreated(ticketId, prUrl, filesCount) {
  return logActivity(ticketId, 'pr_created', `Pull request created`, {
    pr_url: prUrl,
    files_count: filesCount
  });
}

/**
 * Log error
 */
function logError(ticketId, errorMessage, errorType = 'runtime') {
  return logActivity(ticketId, 'error', `Error: ${errorMessage}`, {
    error_type: errorType,
    error_message: errorMessage
  });
}

/**
 * Log code generation complete
 */
function logCodeGenerationComplete(ticketId, filesGenerated, durationMs) {
  return logActivity(ticketId, 'code_generation', `Code generation complete`, {
    phase: 'complete',
    files_generated: filesGenerated,
    duration_ms: durationMs
  });
}

module.exports = {
  logActivity,
  logTicketClaimed,
  logCodeGenerationStart,
  logAiRequest,
  logAiResponse,
  logFileCreated,
  logFileModified,
  logGitOperation,
  logPrCreated,
  logError,
  logCodeGenerationComplete
};
