/**
 * Agent Learning System - Logging Infrastructure
 * Phase 1: Execution logging and error classification
 * 
 * Location: /opt/swarm-app/apps/platform/lib/agent-learning.js
 * Updated: 2025-12-17 - Migrated to PostgreSQL
 */

const crypto = require('crypto');
const { execute } = require('../db');

// Generate unique execution ID
function generateExecutionId() {
  return crypto.randomUUID();
}

/**
 * Error Classification Patterns
 */
const ERROR_PATTERNS = {
  verification: [
    /REQUEST_CHANGES/i, /Verification failed/i, /Sentinel check failed/i,
    /Tests failed/i, /Linting failed/i
  ],
  security: [
    /SECURITY VULNERABILITY/i, /Hardcoded/i, /exposed password/i,
    /critical security risk/i, /security flaw/i
  ],
  syntax: [
    /SyntaxError/i, /Unexpected token/i, /Invalid JSON/i,
    /Parsing error/i, /malformed/i, /invalid syntax/i
  ],
  logic: [
    /undefined is not a function/i, /cannot read propert/i,
    /is not defined/i, /type error/i, /assertion failed/i
  ],
  runtime: [
    /ENOENT/i, /EACCES/i, /EPERM/i, /out of memory/i,
    /stack overflow/i, /maximum call stack/i
  ],
  api: [
    /rate limit/i, /429/, /401.*unauthorized/i, /403.*forbidden/i,
    /api.*error/i, /network error/i, /ECONNREFUSED/i, /ETIMEDOUT/i
  ],
  context: [
    /token limit/i, /context.*too long/i, /max.*tokens/i
  ],
  timeout: [
    /timeout/i, /timed out/i, /deadline exceeded/i
  ]
};

/**
 * Retry Strategy Configuration
 * Defines max retries and backoff strategy for each error category
 */
const RETRY_STRATEGIES = {
  api: {
    maxRetries: 7,
    backoffType: 'exponential',
    baseDelayMs: 1000
  },
  timeout: {
    maxRetries: 5,
    backoffType: 'exponential',
    baseDelayMs: 2000
  },
  runtime: {
    maxRetries: 3,
    backoffType: 'linear',
    baseDelayMs: 5000
  },
  logic: {
    maxRetries: 2,
    backoffType: 'linear',
    baseDelayMs: 3000
  },
  syntax: {
    maxRetries: 0,
    backoffType: 'none',
    baseDelayMs: 0
  },
  context: {
    maxRetries: 1,
    backoffType: 'linear',
    baseDelayMs: 5000
  },
  manual_review: {
    maxRetries: 0,
    backoffType: 'none',
    baseDelayMs: 0
  },
  security: {
    maxRetries: 3,
    backoffType: 'linear',
    baseDelayMs: 5000
  },
  verification: {
    maxRetries: 3,
    backoffType: 'linear',
    baseDelayMs: 5000
  }
};

/**
 * Classify an error message into a category
 */
function classifyError(errorMessage, context = {}) {
  if (!errorMessage) {
    return { category: 'manual_review', subcategory: 'empty_error', confidence: 0 };
  }

  const msg = String(errorMessage);

  for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(msg)) {
        const subcategory = extractSubcategory(msg, category);
        return { category, subcategory, confidence: 0.8 };
      }
    }
  }

  // Check for HTTP status codes
  const httpMatch = msg.match(/\b([45]\d{2})\b/);
  if (httpMatch) {
    const code = parseInt(httpMatch[1]);
    if (code >= 400 && code < 500) {
      return { category: 'api', subcategory: `http_${code}`, confidence: 0.9 };
    }
    if (code >= 500) {
      return { category: 'api', subcategory: 'server_error', confidence: 0.9 };
    }
  }

  return { category: 'manual_review', subcategory: 'unclassified', confidence: 0.3 };
}

function extractSubcategory(msg, category) {
  const patterns = {
    syntax: { json: /json/i, bracket: /bracket/i, token: /token/i },
    logic: { undefined: /undefined/i, null: /null/i, type: /type/i },
    runtime: { file: /ENOENT|file/i, permission: /EACCES|EPERM/i },
    api: { auth: /401|403|auth/i, rate: /429|rate/i, network: /network/i },
    context: { tokens: /token/i },
    timeout: { execution: /execution/i },
    security: { secrets: /Hardcoded|password|secret/i, vuln: /VULNERABILITY/i },
    verification: { sentinel: /Sentinel|REQUEST_CHANGES/i, tests: /Test/i, lint: /Lint/i }
  };

  const catPatterns = patterns[category] || {};
  if (!catPatterns) return 'general'; // Safety check

  for (const [sub, pattern] of Object.entries(catPatterns)) {
    if (pattern && pattern.test && pattern.test(msg)) return sub;
  }
  return 'general';
}


/**
 * Log an agent execution (async PostgreSQL)
 */
async function logExecution({
  taskId,
  agentId,
  tenantId = null,
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  startedAt,
  completedAt = null,
  durationMs = null,
  outcome,
  errorMessage = null,
  errorCategory = null,
  prUrl = null,
  filesChanged = [],
  criteriaStatus = []
}) {
  try {
    const result = await execute(`
      INSERT INTO agent_executions (
        task_id, agent_id, tenant_id, model,
        input_tokens, output_tokens,
        started_at, completed_at, duration_ms,
        outcome, error_message, error_category,
        pr_url, files_changed, criteria_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      taskId, agentId, tenantId, model,
      inputTokens, outputTokens,
      startedAt, completedAt, durationMs,
      outcome, errorMessage, errorCategory,
      prUrl, JSON.stringify(filesChanged), JSON.stringify(criteriaStatus)
    ]);


    return { executionId, rowId: executionId };
  } catch (err) {
    console.error('[agent-learning] Failed to log execution:', err.message);
    return { executionId: null, rowId: null, error: err.message };
  }
}


/**
 * Record a structured error for an execution (async PostgreSQL)
 */
async function recordExecutionError(executionId, error, classification = null, tenantId = null) {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : null;
    const { category, subcategory } = classification || classifyError(errorMessage);

    const result = await execute(`
      INSERT INTO execution_errors (
        execution_id, tenant_id, category, subcategory,
        error_message, error_stack
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [executionId, tenantId, category, subcategory, errorMessage, errorStack]);

    return { errorId: result.rows[0]?.id };
  } catch (err) {
    console.error('[agent-learning] Failed to record error:', err.message);
    return { errorId: null, error: err.message };
  }
}


/**
 * Combined logging with auto error recording (async)
 */
async function logExecutionWithError(params) {
  const { executionId, rowId, error } = await logExecution(params);

  if (!error && params.outcome === 'failure' && params.errorMessage) {
    const classification = classifyError(params.errorMessage);
    await recordExecutionError(rowId, params.errorMessage, classification, params.tenantId);
  }

  return { executionId, rowId };
}

/**
 * Get retry strategy for an error category
 * @param {string} errorCategory - The error category (api, timeout, runtime, etc.)
 * @returns {object} Retry strategy configuration
 */
function getRetryStrategy(errorCategory) {
  return RETRY_STRATEGIES[errorCategory] || RETRY_STRATEGIES.manual_review;
}

/**
 * Calculate backoff delay for a retry attempt
 * @param {string} errorCategory - The error category
 * @param {number} attemptNumber - Current attempt number (1-based)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(errorCategory, attemptNumber) {
  const strategy = getRetryStrategy(errorCategory);

  if (strategy.backoffType === 'none') {
    return 0;
  }

  if (strategy.backoffType === 'exponential') {
    // Exponential: baseDelay * 2^(attempt - 1)
    return strategy.baseDelayMs * Math.pow(2, attemptNumber - 1);
  }

  if (strategy.backoffType === 'linear') {
    // Linear: baseDelay * attempt
    return strategy.baseDelayMs * attemptNumber;
  }

  return strategy.baseDelayMs;
}

/**
 * Determine if a ticket should be retried based on error classification and attempt count
 * @param {string} errorMessage - The error message to classify
 * @param {number} currentAttempts - Number of attempts so far
 * @returns {object} { shouldRetry: boolean, strategy: object, nextDelay: number }
 */
function shouldRetryTicket(errorMessage, currentAttempts = 0) {
  const classification = classifyError(errorMessage);
  const strategy = getRetryStrategy(classification.category);
  const shouldRetry = currentAttempts < strategy.maxRetries;
  const nextDelay = shouldRetry ? calculateBackoffDelay(classification.category, currentAttempts + 1) : 0;

  return {
    shouldRetry,
    strategy,
    classification,
    nextDelay,
    attemptsRemaining: Math.max(0, strategy.maxRetries - currentAttempts)
  };
}

// Exports
module.exports = {
  logExecution,
  recordExecutionError,
  logExecutionWithError,
  classifyError,
  generateExecutionId,
  getRetryStrategy,
  calculateBackoffDelay,
  shouldRetryTicket,
  ERROR_PATTERNS,
  RETRY_STRATEGIES
};
