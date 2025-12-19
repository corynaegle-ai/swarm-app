/**
 * Claude API Client Service
 * Wraps Anthropic SDK with project-specific configuration
 * 
 * Phase 4 of HITL Implementation
 */

const Anthropic = require('@anthropic-ai/sdk');

// Load API key from environment or secrets file
function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  
  // Try loading from secrets file
  try {
    const fs = require('fs');
    const secretsPath = '/opt/swarm-platform/secrets.env';
    const content = fs.readFileSync(secretsPath, 'utf8');
    const match = content.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch (err) {
    console.error('Failed to load API key from secrets:', err.message);
  }
  
  throw new Error('ANTHROPIC_API_KEY not configured');
}

// Singleton client instance
let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: getApiKey()
    });
  }
  return client;
}


/**
 * Send a message to Claude with conversation history
 * @param {object} options - Request options
 * @param {string} options.system - System prompt
 * @param {array} options.messages - Message history [{role, content}]
 * @param {string} options.model - Model to use (default: claude-sonnet-4-20250514)
 * @param {number} options.maxTokens - Max response tokens (default: 4096)
 * @returns {Promise<object>} Response with content and usage
 */
async function chat({ system, messages, model = 'claude-sonnet-4-20250514', maxTokens = 4096 }) {
  const anthropic = getClient();
  
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages
    });

    return {
      success: true,
      content: response.content[0].text,
      usage: response.usage,
      stopReason: response.stop_reason
    };
  } catch (error) {
    console.error('Claude API error:', error.message);
    return {
      success: false,
      error: error.message,
      code: error.status || 'API_ERROR'
    };
  }
}

/**
 * Parse JSON from Claude response, handling markdown code blocks
 * @param {string} text - Response text
 * @returns {object|null} Parsed JSON or null
 */
function parseJsonResponse(text) {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = {
  getClient,
  chat,
  parseJsonResponse
};
