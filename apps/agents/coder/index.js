#!/usr/bin/env node
/**
 * Swarm Pull-Based Agent v2 - With FORGE Persona + Retry Logic
 * 
 * Runs inside Firecracker VMs, pulls tickets from the API, generates code via Claude
 * using the FORGE persona, commits to GitHub, and creates PRs.
 * 
 * Key Features:
 *   - FORGE persona loaded as system prompt
 *   - Structured JSON output parsing
 *   - Acceptance criteria status reporting
 *   - Self-verification before commit
 *   - Internal retry loop with validation (NEW)
 */

const { execSync, spawn } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Explicitly load platform .env for reliable secret injection
require('dotenv').config({ path: '/opt/swarm-app/apps/platform/.env' });

// Agent Learning System for execution telemetry
let agentLearning = null;
try {
  agentLearning = require('/opt/swarm-app/apps/platform/lib/agent-learning.js');
} catch (err) {
  console.warn('Warning: Agent learning module not available:', err.message);
}

// Code Validator for retry logic
let codeValidator = null;
try {
  codeValidator = require('./lib/code-validator.js');
} catch (err) {
  console.warn('Warning: Code validator not available, retry validation disabled:', err.message);
}

// Configuration from environment
const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  agentId: process.env.AGENT_ID || os.hostname(),
  agentServiceKey: process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev',
  apiUrl: process.env.API_URL || 'http://10.0.0.1:8080',
  pollInterval: parseInt(process.env.POLL_INTERVAL || '10', 10) * 1000,
  workDir: process.env.WORK_DIR || '/tmp/agent-work',
  personaPath: process.env.PERSONA_PATH || '/opt/swarm-tickets/personas/forge.md',
  heartbeatInterval: 60000,
  claudeModel: 'claude-sonnet-4-20250514'
};

// Retry configuration for internal validation loop
const RETRY_CONFIG = {
  maxInternalAttempts: 3,
  validationTimeout: 30000,
  validationLevels: {
    minimal: ['syntax'],
    standard: ['syntax', 'lint'],
    strict: ['syntax', 'lint', 'typecheck']
  },
  defaultValidationLevel: 'standard'
};

// Model selection based on ticket complexity
const MODEL_BY_SCOPE = {
  small: 'claude-sonnet-4-20250514',
  medium: 'claude-sonnet-4-20250514',
  large: 'claude-opus-4-20250514'
};
const VALID_MODELS = new Set(Object.values(MODEL_BY_SCOPE));

// Load FORGE persona
let FORGE_PERSONA = '';
try {
  FORGE_PERSONA = fs.readFileSync(CONFIG.personaPath, 'utf8');
} catch (err) {
  console.error(`Warning: Could not load FORGE persona from ${CONFIG.personaPath}: ${err.message}`);
  FORGE_PERSONA = 'You are FORGE, an expert coding agent. Generate clean, well-tested code.';
}

function selectModel(ticket, projectSettings = {}) {
  if (projectSettings?.worker_model && VALID_MODELS.has(projectSettings.worker_model)) {
    log.info('Model selected', { source: 'project-override', model: projectSettings.worker_model });
    return projectSettings.worker_model;
  }
  if (ticket?.model) {
    log.info('Model selected', { source: 'ticket-override', model: ticket.model });
    return ticket.model;
  }
  const scope = ticket?.estimated_scope || 'medium';
  const model = MODEL_BY_SCOPE[scope] || CONFIG.claudeModel;
  log.info('Model selected', { source: 'scope', scope, model });
  return model;
}

// Structured JSON logger
const log = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data })),
  warn: (msg, data = {}) => console.warn(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data })),
  debug: (msg, data = {}) => process.env.DEBUG && console.log(JSON.stringify({ level: 'debug', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data }))
};

// HTTP request helper
function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function logActivity(ticketId, category, message, metadata = {}) {
  try {
    // Only log if ticketId is valid
    if (!ticketId) return;

    await httpRequest(`${CONFIG.apiUrl}/api/tickets/${ticketId}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': CONFIG.agentServiceKey
      }
    }, {
      agent_id: CONFIG.agentId,
      category,
      message,
      metadata
    });
  } catch (err) {
    // Silent fail for logging
    log.warn('Failed to log activity', { error: err.message });
  }
}


// API helpers
async function claimTicket(projectId = null) {
  const url = `${CONFIG.apiUrl}/claim`;
  const body = {
    agent_id: CONFIG.agentId,
    project_id: projectId,
    ticket_filter: 'ready'
  };

  const res = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, body);

  if (res.status === 200 && res.data?.ticket) {
    return { ticket: res.data.ticket, projectSettings: res.data.project_settings || {} };
  }
  if (res.status === 204) return null;

  throw new Error(`Claim failed: ${res.status} - ${JSON.stringify(res.data)}`);
}

async function updateTicketStatus(ticketId, status) {
  // Use POST /status (legacy agent endpoint)
  const res = await httpRequest(`${CONFIG.apiUrl}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Key': CONFIG.agentServiceKey
    }
  }, { ticket_id: ticketId, agent_id: CONFIG.agentId, state: status });

  if (res.status >= 400) {
    log.warn(`Failed to update status to ${status}`, { status: res.status, error: res.data });
  }
}

async function sendHeartbeat(ticketId) {
  await httpRequest(`${CONFIG.apiUrl}/tickets/${ticketId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { agent_id: CONFIG.agentId });
}

async function completeTicket(ticketId, success, prUrl = null, error = null, criteriaStatus = null, filesChanged = [], branchName = null) {
  if (!success) {
    // If not successful, report failure to /fail endpoint to trigger retry logic
    const res = await httpRequest(`${CONFIG.apiUrl}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      ticket_id: ticketId,
      agent_id: CONFIG.agentId,
      error_message: error || 'Unknown error',
      should_retry: false // Let backend decide based on learning
    });

    if (res.status >= 400) {
      log.warn('Failed to report failure', { status: res.status, error: res.data });
    }
    return;
  }

  // Use legacy /complete endpoint which expects ticket_id in body
  const res = await httpRequest(`${CONFIG.apiUrl}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    ticket_id: ticketId,
    agent_id: CONFIG.agentId,
    success,
    pr_url: prUrl,
    branch_name: branchName,
    error,
    criteria_status: criteriaStatus,
    files_changed: filesChanged
  });

  if (res.status >= 400) {
    throw new Error(`Failed to complete ticket: ${res.status} - ${JSON.stringify(res.data)}`);
  }
}

// Claude API call with FORGE persona
async function generateCode(ticket, heartbeatFn, projectSettings = {}, existingFiles = {}) {
  const prompt = buildPrompt(ticket, existingFiles);  // existingFiles passed from processTicket

  const heartbeatTimer = setInterval(() => heartbeatFn(), CONFIG.heartbeatInterval);

  try {
    const res = await httpRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.anthropicKey,
        'anthropic-version': '2023-06-01'
      }
    }, {
      model: selectModel(ticket, projectSettings),
      max_tokens: 16000,
      system: FORGE_PERSONA,
      messages: [{ role: 'user', content: prompt }]
    });

    if (res.status !== 200) {
      throw new Error(`Claude API error: ${JSON.stringify(res.data)}`);
    }

    const usage = { inputTokens: res.data.usage?.input_tokens || 0, outputTokens: res.data.usage?.output_tokens || 0 };
    const content = res.data.content?.[0]?.text || '';
    const parsed = parseForgeResponse(content, ticket, existingFiles);
    return { ...parsed, usage };
  } finally {
    clearInterval(heartbeatTimer);
  }
}

// Generate code with retry context (validation errors from previous attempt)
async function generateCodeWithRetry(ticket, heartbeatFn, projectSettings, previousResult, validationErrors, existingFiles = {}) {
  const prompt = buildRetryPrompt(ticket, previousResult, validationErrors);

  const heartbeatTimer = setInterval(() => heartbeatFn(), CONFIG.heartbeatInterval);

  try {
    const res = await httpRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.anthropicKey,
        'anthropic-version': '2023-06-01'
      }
    }, {
      model: selectModel(ticket, projectSettings),
      max_tokens: 16000,
      system: FORGE_PERSONA,
      messages: [{ role: 'user', content: prompt }]
    });

    if (res.status !== 200) {
      throw new Error(`Claude API error: ${JSON.stringify(res.data)}`);
    }

    const usage = { inputTokens: res.data.usage?.input_tokens || 0, outputTokens: res.data.usage?.output_tokens || 0 };
    const content = res.data.content?.[0]?.text || '';
    const parsed = parseForgeResponse(content, ticket, existingFiles);
    return { ...parsed, usage };
  } finally {
    clearInterval(heartbeatTimer);
  }
}


// Format sentinel feedback for injection into forge agent prompt
function formatSentinelFeedback(ticket) {
  if (!ticket.sentinel_feedback) return '';

  let feedback = ticket.sentinel_feedback;
  let classification = null;

  try {
    // Check if it's a JSON string with structured data
    if (typeof feedback === 'string' && feedback.trim().startsWith('{')) {
      const parsed = JSON.parse(feedback);
      if (parsed.feedback) {
        feedback = parsed.feedback;
        classification = parsed.errorClassification;
      }
    }
  } catch (e) {
    // Use raw string if parse fails
  }

  let instructions = '';
  if (classification) {
    const { category } = classification;
    if (category === 'syntax') instructions = 'CRITICAL: The previous code had syntax errors. Validate syntax strictly.';
    if (category === 'verification') instructions = 'CRITICAL: The code failed verification. Review acceptance criteria and edge cases.';
    if (category === 'timeout') instructions = 'CRITICAL: The code timed out. Optimize performance and check for infinite loops.';
  }

  return `
## PREVIOUS SENTINEL FEEDBACK (MUST ADDRESS)
The previous implementation was rejected by the Sentinel.
${instructions ? `\n**Directives**: ${instructions}\n` : ''}
**Feedback**:
${feedback}

You must analyze this feedback and correct the issues in your new implementation.
`;
}

function buildPrompt(ticket, existingFiles = {}) {
  let criteria = [];
  if (ticket.acceptance_criteria) {
    if (typeof ticket.acceptance_criteria === 'string') {
      try { criteria = JSON.parse(ticket.acceptance_criteria); } catch { criteria = [ticket.acceptance_criteria]; }
    } else if (Array.isArray(ticket.acceptance_criteria)) {
      criteria = ticket.acceptance_criteria;
    }
  }

  let fileHints = [];
  if (ticket.files_hint || ticket.file_hints) {
    const hints = ticket.files_hint || ticket.file_hints;
    if (typeof hints === 'string') {
      try { fileHints = JSON.parse(hints); } catch { fileHints = [hints]; }
    } else if (Array.isArray(hints)) {
      fileHints = hints;
    }
  }

  const criteriaSection = criteria.length > 0
    ? criteria.map((c, i) => {
      if (typeof c === 'object' && c.id) {
        return `${i + 1}. [${c.id}] ${c.description}`;
      }
      return `${i + 1}. ${c}`;
    }).join('\n')
    : 'None specified - use your best judgment';

  // Parse files_to_create and files_to_modify from rag_context
  let filesToCreate = [];
  let filesToModify = [];

  if (ticket.rag_context) {
    try {
      const ctx = typeof ticket.rag_context === 'string'
        ? JSON.parse(ticket.rag_context)
        : ticket.rag_context;
      filesToCreate = ctx.files_to_create || [];
      filesToModify = ctx.files_to_modify || [];
    } catch (e) {
      log.warn('Failed to parse rag_context', { error: e.message });
    }
  }

  // Fallback to fileHints if no specific files
  if (filesToCreate.length === 0 && filesToModify.length === 0) {
    filesToCreate = fileHints;
  }

  // Build files section with CREATE vs MODIFY distinction
  let filesSection = '';

  if (filesToCreate.length > 0) {
    filesSection += '**Files to CREATE (new files):**\n';
    filesSection += filesToCreate.map(f => '- ' + f).join('\n');
    filesSection += '\n\n';
  }

  if (filesToModify.length > 0) {
    filesSection += '**Files to MODIFY (existing files - use surgical patches):**\n';
    filesSection += filesToModify.map(f => '- ' + f).join('\n');
    filesSection += '\n\n';

    // Include existing file contents for context
    filesSection += '**Current content of files to modify:**\n\n';
    for (const fp of filesToModify) {
      if (existingFiles[fp]) {
        filesSection += '<file path="' + fp + '">\n' + existingFiles[fp] + '\n</file>\n\n';
      }
    }
  }

  if (!filesSection) {
    filesSection = fileHints.length > 0 ? fileHints.join('\n') : 'Determine appropriate file structure';
  }

  const hasModifications = filesToModify.length > 0;

  return `## Implementation Task

### Ticket Information
**ID**: ${ticket.id}
**Title**: ${ticket.title}

### Description
${ticket.description || 'No description provided'}

### Acceptance Criteria (ALL MUST BE SATISFIED)
${criteriaSection}

### Expected Files/Locations
${filesSection}

### Repository Context
${ticket.repo_url ? `Repository: ${ticket.repo_url}` : 'Standalone implementation'}
${ticket.branch_name ? `Branch: ${ticket.branch_name}` : ''}

${formatSentinelFeedback(ticket)}

---

## Your Task

1. Implement code that satisfies ALL acceptance criteria
2. Follow your FORGE coding standards
3. Include appropriate error handling
4. For EACH acceptance criterion, report whether it is SATISFIED, PARTIALLY_SATISFIED, or BLOCKED

## Required Output Format

Respond with ONLY valid JSON in this exact format:

\`\`\`json
  {
    "root_cause_analysis": "Explanation of why the previous attempt failed and how this fix addresses it",
      "files": [
        {
          "path": "relative/path/to/file.js",
          "action": "create",  // Use "modify" with patches array for existing files
          "content": "// file contents here"
        }
      ],
        "tests": [
          {
            "path": "tests/file.test.js",
            "content": "// test contents"
          }
        ],
          "summary": "Brief description of implementation",
            "acceptance_criteria_status": [
              {
                "id": "AC-001",
                "criterion": "Description of the criterion",
                "status": "SATISFIED",
                "evidence": "Implemented in file.js:15-30"
              }
            ]
  }
  \`\`\`

### For MODIFYING existing files, use this format instead:
\`\`\`json
{
  "path": "existing/file.js",
  "action": "modify",
  "patches": [
    {
      "search": "exact text to find (include 2-5 lines of context for uniqueness)",
      "replace": "replacement text"
    }
  ]
}
\`\`\`

CRITICAL RULES:
- For files listed under "Files to MODIFY": Use action "modify" with patches array
- Each patch needs unique "search" text (include surrounding context)
- NEVER regenerate entire files - only output the specific patches needed
- For NEW files: Use action "create" with full content

IMPORTANT: 
- Response must be valid JSON only
- All code must be complete and functional
- Every acceptance criterion must have a status entry
- Status must be exactly: SATISFIED, PARTIALLY_SATISFIED, or BLOCKED`;
}

// Build retry prompt with validation errors
function buildRetryPrompt(ticket, previousResult, validationErrors, existingFiles = {}) {
  const basePrompt = buildPrompt(ticket, existingFiles);

  const errorContext = codeValidator
    ? codeValidator.formatErrorsForPrompt(validationErrors)
    : validationErrors.map(e => `- ${e.file}:${e.line}: ${e.message}`).join('\n');

  return `## RETRY CONTEXT - PREVIOUS ATTEMPT FAILED VALIDATION

Your previous code generation attempt had the following errors that must be fixed:

${errorContext}

## CRITICAL INSTRUCTION FOR RETRY

If any errors above mention "PATCH FAILED", it means your surgical patches could not be applied (likely due to mismatched search text).
**DO NOT ATTEMPT TO PATCH THESE FILES AGAIN.**
Instead, you MUST regenerate the **FULL CONTENT** of those specific files and use \`action: "create"\` to overwrite them completely.
This is the only way to fix the state.

## Instructions for Retry

1. Carefully review each error above
2. Understand the root cause of each error
3. Generate corrected code that fixes ALL listed errors
4. Do NOT introduce new errors while fixing existing ones
5. Ensure the code still satisfies all acceptance criteria

---

${basePrompt}`;
}


function parseForgeResponse(content, ticket, existingFiles = {}) {
  let jsonStr = content;

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('Response missing files array');
    }

    const files = parsed.files.map(f => {
      let fileContent = f.content || f.code || f.body || f.source || '';

      // If content is empty but patches exist, try to construct content from existing file
      if (!fileContent && f.patches && Array.isArray(f.patches) && existingFiles[f.path]) {
        try {
          let currentContent = existingFiles[f.path];
          for (const patch of f.patches) {
            if (patch.search && patch.replace !== undefined && currentContent.includes(patch.search)) {
              currentContent = currentContent.replace(patch.search, patch.replace);
            }
          }
          fileContent = currentContent;
        } catch (err) {
          log.warn('Failed to apply patches for preview', { path: f.path, error: err.message });
        }
      }

      return {
        path: f.path,
        content: fileContent,
        action: f.action || 'create',
        patches: f.patches // Pass through patches for the writer
      };
    });

    if (parsed.tests && Array.isArray(parsed.tests)) {
      for (const test of parsed.tests) {
        files.push({ path: test.path, content: test.content, action: 'create' });
      }
    }

    return {
      files,
      summary: parsed.summary || 'Implementation complete',
      criteriaStatus: parsed.acceptance_criteria_status || [],
      rootCauseAnalysis: parsed.root_cause_analysis
    };
  } catch (err) {
    log.error('Failed to parse JSON response, falling back to file extraction', { error: err.message });
    return {
      files: parseFilesFromContent(content),
      summary: 'Fallback extraction',
      criteriaStatus: []
    };
  }
}

function parseFilesFromContent(content) {
  const files = [];
  const regex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END FILE===/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    files.push({ path: match[1].trim(), content: match[2].trim(), action: 'create' });
  }
  return files;
}

// Git operations
function execGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`Git command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

async function cloneAndBranch(ticket) {
  const repoDir = path.join(CONFIG.workDir, `repo-${ticket.id}`);

  if (fs.existsSync(repoDir)) {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
  fs.mkdirSync(repoDir, { recursive: true });

  let repoUrl = ticket.repo_url;
  if (repoUrl.startsWith('git@')) {
    const sshMatch = repoUrl.match(/git@([^:]+):(.+)/);
    if (sshMatch) {
      repoUrl = `https://${sshMatch[1]}/${sshMatch[2]}`;
    }
  }
  repoUrl = repoUrl.replace('https://', `https://${CONFIG.githubToken}@`);
  execGit(`git clone ${repoUrl} .`, repoDir);
  // We can't easily access ticket ID here without passing it, but logActivity expects it.
  // Assuming callers might log higher level git ops.
  // Actually, let's update cloneAndBranch signature to accept ticket ID for logging if needed, 
  // but it's already passed as 'ticket' object.
  // The 'ticket' object is passed!
  await logActivity(ticket.id, 'git_operation', 'Cloned repository', { repo: ticket.repo_url });

  const branchName = ticket.branch_name || `forge/${ticket.id}-${Date.now()}`;

  if (ticket.branch_name) {
    try {
      execGit(`git fetch origin ${branchName}`, repoDir);
      execGit(`git checkout ${branchName}`, repoDir);
      log.info('Checked out existing branch', { branch: branchName });
    } catch (e) {
      log.warn('Failed to checkout existing branch, creating new', { branch: branchName, error: e.message });
      execGit(`git checkout -b ${branchName}`, repoDir);
    }
  } else {
    execGit(`git checkout -b ${branchName}`, repoDir);
  }

  await logActivity(ticket.id, 'git_operation', 'Checked out branch', { branch: branchName });

  return { repoDir, branchName };
}


// Fetch existing file content for surgical modifications
function fetchExistingFileContent(repoDir, filePath, maxLines = 300) {
  const fullPath = path.join(repoDir, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  if (lines.length > maxLines) {
    const headLines = lines.slice(0, Math.floor(maxLines / 2));
    const tailLines = lines.slice(-Math.floor(maxLines / 2));
    return headLines.join('\n') +
      '\n\n... [' + (lines.length - maxLines) + ' lines truncated] ...\n\n' +
      tailLines.join('\n');
  }

  return content;
}

function writeFiles(repoDir, files) {
  const written = [];

  for (const file of files) {
    const filePath = path.join(repoDir, file.path);
    const fileDir = path.dirname(filePath);

    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    if (file.action === 'modify' && file.patches && Array.isArray(file.patches)) {
      // SURGICAL MODIFICATION: Apply patches
      if (!fs.existsSync(filePath)) {
        log.error('Cannot modify non-existent file', { path: file.path });
        continue;
      }

      let fileContent = fs.readFileSync(filePath, 'utf8');
      let patchesApplied = 0;

      for (const patch of file.patches) {
        if (!patch.search || patch.replace === undefined) {
          log.warn('Invalid patch format', { path: file.path });
          continue;
        }

        // 1. Try Exact Match
        if (fileContent.includes(patch.search)) {
          fileContent = fileContent.replace(patch.search, patch.replace);
          patchesApplied++;
          continue;
        }

        // 2. Try Fuzzy Match (Whitespace Normalization)
        const normalize = (str) => str.replace(/\s+/g, ' ').trim();
        const normContent = normalize(fileContent);
        const normSearch = normalize(patch.search);

        if (normContent.includes(normSearch)) {
          log.info('Patch used fuzzy match', { path: file.path });
          // Strategy: Regex escape the search string, replace \s+ with \s+, and try regex match
          const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const sourceRegexPattern = patch.search.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
          const sourceRegex = new RegExp(sourceRegexPattern);

          if (sourceRegex.test(fileContent)) {
            fileContent = fileContent.replace(sourceRegex, patch.replace);
            patchesApplied++;
            continue;
          }
        }

        log.warn('Patch search text not found', {
          path: file.path,
          searchPreview: patch.search.substring(0, 50) + '...'
        });
      }

      if (patchesApplied > 0) {
        fs.writeFileSync(filePath, fileContent);
        written.push(file.path);
        log.info('Applied patches to file', {
          path: file.path,
          patchesApplied,
          totalPatches: file.patches.length
        });
      } else {
        log.error('No patches applied to file', { path: file.path });
      }

    } else {
      // CREATE: Write entire file content
      fs.writeFileSync(filePath, file.content);
      written.push(file.path);
      log.info('Wrote file', { path: file.path, bytes: file.content.length });
    }
  }

  return { written, failed: [] }; // Legacy compat if needed, but we'll use object return
}

// Rewritten writeFiles to support detailed error reporting
function writeFilesDetailed(repoDir, files) {
  const written = [];
  const failed = [];

  for (const file of files) {
    const filePath = path.join(repoDir, file.path);
    const fileDir = path.dirname(filePath);

    try {
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      if (file.action === 'modify' && file.patches && Array.isArray(file.patches)) {
        // SURGICAL MODIFICATION: Apply patches
        if (!fs.existsSync(filePath)) {
          log.error('Cannot modify non-existent file', { path: file.path });
          failed.push({ path: file.path, error: 'File does not exist' });
          continue;
        }

        let fileContent = fs.readFileSync(filePath, 'utf8');
        let patchesApplied = 0;
        let patchErrors = [];

        for (const patch of file.patches) {
          if (!patch.search || patch.replace === undefined) {
            patchErrors.push('Invalid patch format');
            continue;
          }

          // 1. Try Exact Match
          if (fileContent.includes(patch.search)) {
            fileContent = fileContent.replace(patch.search, patch.replace);
            patchesApplied++;
            continue;
          }

          // 2. Try Fuzzy Match (Whitespace Normalization)
          const normalize = (str) => str.replace(/\s+/g, ' ').trim();
          const normContent = normalize(fileContent);
          const normSearch = normalize(patch.search);

          if (normContent.includes(normSearch)) {
            log.info('Patch used fuzzy match', { path: file.path });
            // Strategy: Regex escape the search string, replace \s+ with \s+, and try regex match
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sourceRegexPattern = patch.search.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
            const sourceRegex = new RegExp(sourceRegexPattern);

            if (sourceRegex.test(fileContent)) {
              fileContent = fileContent.replace(sourceRegex, patch.replace);
              patchesApplied++;
              continue;
            }
          }

          patchErrors.push(`Patch search text not found: "${patch.search.substring(0, 50)}..."`);
          log.warn('Patch search text not found', {
            path: file.path,
            searchPreview: patch.search.substring(0, 50) + '...'
          });
        }

        if (patchesApplied === file.patches.length) {
          fs.writeFileSync(filePath, fileContent);
          written.push(file.path);
          log.info('Applied patches to file', {
            path: file.path,
            patchesApplied,
            totalPatches: file.patches.length
          });
        } else {
          // If ANY patch failed, we mark the whole file as failed to trigger rewrite
          // But if SOME applied, we might have partial state. Ideally we assume atomic per file.
          // For now, we only write if we can apply them cleanly or if we want to support partials?
          // Rule: If patches failed, do NOT write partials. Keep file clean.
          // REVISION: The original code wrote if `patchesApplied > 0`.
          // But for fallback to work reliably, we should fail hard if not ALL applied?
          // Actually, if we fail to apply one patch, the code might be broken.
          // Let's stick to: If any errors, treat as failure for that file.
          if (patchErrors.length > 0) {
            log.warn('Partial patch failure - failing file write to trigger rewrite', { path: file.path, errors: patchErrors });
            failed.push({ path: file.path, error: patchErrors.join('; ') });
          } else {
            // Should verify patchesApplied > 0 or files.patches was empty?
            // If patches array empty, nothing happens.
            if (file.patches.length > 0) {
              // This path should be covered by patchesApplied === file.patches.length
            }
          }
        }

      } else {
        // CREATE: Write entire file content
        fs.writeFileSync(filePath, file.content);
        written.push(file.path);
        log.info('Wrote file', { path: file.path, bytes: file.content ? file.content.length : 0 });
      }
    } catch (err) {
      log.error('File write failed', { path: file.path, error: err.message });
      failed.push({ path: file.path, error: err.message });
    }
  }

  return { written, failed };
}

// Wrapper to maintain backward compatibility during transition if needed
function writeFiles(repoDir, files) {
  const result = writeFilesDetailed(repoDir, files);
  return result.written;
}

// We can't log individual file ops here easily without ticket ID.
// Will log bulk op in processTicket.

async function commitAndPush(repoDir, ticket, branchName, summary) {
  // Ensure git identity is set for this repo
  try {
    execGit('git config user.name "Swarm Forge Agent"', repoDir);
    execGit('git config user.email "forge@swarmstack.net"', repoDir);
  } catch (err) {
    log.warn('Failed to set git identity', { error: err.message });
  }

  execGit('git add -A', repoDir);

  // Check if there are changes to commit
  try {
    const status = execGit('git status --porcelain', repoDir);
    if (!status || status.trim() === '') {
      log.warn('No changes to commit');
      return null; // Skip commit but proceed to push (branches need to exist though)
    }
  } catch (e) {
    log.warn('Failed to check git status', { error: e.message });
  }

  const message = `${ticket.id}: ${ticket.title}\n\n${summary}\n\nGenerated by Swarm Agent ${CONFIG.agentId} (FORGE)`;
  try {
    execGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoDir);
  } catch (err) {
    if (err.message.includes('nothing to commit')) {
      log.warn('Nothing to commit (caught in try/catch)');
      return null;
    }
    throw err;
  }

  execGit(`git push -u origin ${branchName}`, repoDir);

  const commitHash = execGit('git rev-parse --short HEAD', repoDir);
  log.info('Pushed commit', { commit: commitHash, branch: branchName });
  // Unable to log activity here without ticket object or ID passed explicitly, 
  // but 'ticket' IS passed.
  await logActivity(ticket.id, 'git_operation', 'Committed and pushed code', { commit: commitHash, branch: branchName });
  return commitHash;
}


async function createPullRequest(ticket, branchName, summary, criteriaStatus) {
  let match = ticket.repo_url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) {
    match = ticket.repo_url.match(/github\.com:([^\/]+)\/([^\/\.]+)/);
  }
  if (!match) throw new Error(`Invalid repo URL: ${ticket.repo_url}`);

  const [, owner, repo] = match;

  let criteriaSection = '';
  if (criteriaStatus && criteriaStatus.length > 0) {
    criteriaSection = '\n\n## Acceptance Criteria Status\n\n' +
      criteriaStatus.map(c => {
        const emoji = c.status === 'SATISFIED' ? '✅' : c.status === 'PARTIALLY_SATISFIED' ? '⚠️' : '❌';
        return `${emoji} **${c.id || 'Criterion'}**: ${c.criterion || 'N/A'}\n   - Status: ${c.status}\n   - Evidence: ${c.evidence || 'N/A'}`;
      }).join('\n\n');
  }

  const body = `## Ticket\n${ticket.id}\n\n## Description\n${ticket.description || 'Auto-generated'}\n\n## Summary\n${summary}${criteriaSection}\n\n---\n*Generated by Swarm Agent ${CONFIG.agentId} using FORGE persona*`;

  // Try to determine the best head reference
  // GitHub API behavior varies for forks vs same-repo
  const headOptions = [`${owner}:${branchName}`, branchName];
  let lastError = null;

  for (const headRef of headOptions) {
    log.info('Creating PR attempt', { owner, repo, head: headRef, base: 'main' });

    const res = await httpRequest(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${CONFIG.githubToken}`,
        'User-Agent': 'Swarm-Agent-FORGE'
      }
    }, {
      title: `${ticket.id}: ${ticket.title}`,
      head: headRef,
      base: 'main',
      body
    });

    if (res.status === 201) {
      await logActivity(ticket.id, 'pr_created', 'Created Pull Request', { pr_url: res.data.html_url });
      return res.data.html_url;
    }

    // If it's a validation error on 'head', we might try the other format
    lastError = res.data;
    if (res.status !== 422) break; // Don't retry for non-validation errors (e.g. 401, 403)
  }

  log.error('PR creation failed final', { error: lastError });
  throw new Error(`PR creation failed: ${JSON.stringify(lastError)}`);
}

// Emit progress event (for dashboard visibility)
function emitProgress(ticketId, data) {
  log.debug('Progress event', { ticketId, ...data });
}

// Main ticket processing with retry logic
async function processTicket(ticket, projectSettings = {}) {
  log.info('Processing ticket', { ticketId: ticket.id, title: ticket.title });
  await logActivity(ticket.id, 'ticket_claimed', `Claimed by ${CONFIG.agentId}`, { agent_id: CONFIG.agentId });

  // Explicitly set to in_progress (as claim only sets assigned)
  await updateTicketStatus(ticket.id, 'in_progress');

  let repoDir = null;
  let branchName = null;

  const executionStart = Date.now();
  const startedAt = new Date().toISOString();
  let inputTokens = 0, outputTokens = 0;
  const model = selectModel(ticket, projectSettings);
  const attemptHistory = [];

  try {
    // SETUP PHASE - Run once before retry loop
    const cloneResult = await cloneAndBranch(ticket);
    repoDir = cloneResult.repoDir;
    branchName = cloneResult.branchName;
    log.info('Cloned repo', { branch: branchName });

    // Fetch existing file content for files_to_modify
    const existingFiles = {};
    if (ticket.rag_context) {
      try {
        const ctx = typeof ticket.rag_context === 'string'
          ? JSON.parse(ticket.rag_context)
          : ticket.rag_context;
        const filesToModify = ctx.files_to_modify || [];
        for (const filePath of filesToModify) {
          const fileContent = fetchExistingFileContent(repoDir, filePath);
          if (fileContent) {
            existingFiles[filePath] = fileContent;
            log.info('Fetched existing file for modification', { path: filePath, lines: fileContent.split('\n').length });
          } else {
            log.warn('File to modify not found', { path: filePath });
          }
        }
      } catch (e) {
        log.warn('Failed to fetch existing files', { error: e.message });
      }
    }

    // RETRY LOOP
    const maxAttempts = RETRY_CONFIG.maxInternalAttempts;
    let lastResult = null;
    let lastValidationErrors = [];
    let currentAttempt = 0;

    while (currentAttempt < maxAttempts) {
      currentAttempt++;
      const attemptStart = Date.now();

      log.info('Starting generation attempt', { ticketId: ticket.id, attempt: currentAttempt, maxAttempts });
      emitProgress(ticket.id, { type: 'forge_attempt', attempt: currentAttempt, maxAttempts, status: currentAttempt === 1 ? 'generating' : 'retrying' });

      try {
        const heartbeatFn = () => sendHeartbeat(ticket.id).catch(e => log.error('Heartbeat failed', { error: e.message }));

        let result;
        await logActivity(ticket.id, 'code_generation', `Starting generation attempt ${currentAttempt}`, { attempt: currentAttempt, model });

        if (currentAttempt === 1) {
          result = await generateCode(ticket, heartbeatFn, projectSettings, existingFiles);
        } else {
          result = await generateCodeWithRetry(ticket, heartbeatFn, projectSettings, lastResult, lastValidationErrors, existingFiles);
        }

        // Create a summary of generated code for the log
        const generatedCodePreview = result.files
          .map(f => `// File: ${f.path}\n${f.content}`)
          .join('\n\n');

        await logActivity(ticket.id, 'code_generation', `Generation complete`, {
          files_generated: result.files.length,
          duration_ms: Date.now() - attemptStart,
          generated_code: generatedCodePreview // Inject code for dashboard display
        });

        inputTokens += result.usage?.inputTokens || 0;
        outputTokens += result.usage?.outputTokens || 0;
        lastResult = result;

        if (!result.files || result.files.length === 0) {
          throw new Error('No files generated by FORGE');
        }
        log.info('Generated files', { count: result.files.length, files: result.files.map(f => f.path) });

        // Check for BLOCKED criteria (non-retryable)
        const blockedCriteria = result.criteriaStatus?.filter(c => c.status === 'BLOCKED') || [];
        if (blockedCriteria.length > 0) {
          log.error('BLOCKED criteria detected', { blocked: blockedCriteria });
          throw new Error(`Implementation blocked: ${blockedCriteria.map(c => c.criterion).join(', ')}`);
        }

        // Reset git state before writing (clean any previous attempt)
        if (currentAttempt > 1) {
          try {
            execSync('git checkout -- .', { cwd: repoDir, stdio: 'pipe' });
            execSync('git clean -fd', { cwd: repoDir, stdio: 'pipe' });
          } catch (gitErr) {
            log.warn('Git reset failed', { error: gitErr.message });
          }
        }

        const writeResult = writeFilesDetailed(repoDir, result.files);
        const filesWritten = writeResult.written;

        // CHECK FOR PATCH FAILURES (Smart Fallback)
        if (writeResult.failed.length > 0) {
          log.warn('Write/Patch failures detected - triggering fallback retry', { failedFiles: writeResult.failed });

          const patchErrors = writeResult.failed.map(f => ({
            file: f.path,
            line: 1,
            message: `PATCH FAILED: ${f.error}. Critical error. STOP using 'modify' patches for this file. You MUST rewrite the ENTIRE file using action: "create" with the full content.`
          }));

          // Inject these as validation errors
          attemptHistory.push({
            attempt: currentAttempt,
            durationMs: Date.now() - attemptStart,
            errors: patchErrors,
            tokens: { input: result.usage?.inputTokens, output: result.usage?.outputTokens },
            type: 'patch_failure'
          });

          lastValidationErrors = patchErrors;
          emitProgress(ticket.id, { type: 'forge_attempt', attempt: currentAttempt, maxAttempts, status: 'failed', errorCount: patchErrors.length, message: 'Patch failed, retrying with rewrite' });

          if (currentAttempt < maxAttempts) {
            continue; // Retry immediately
          }
          // If max attempts reached, we fall through to normal error handling or validation check
        }
        emitProgress(ticket.id, { type: 'forge_attempt', attempt: currentAttempt, maxAttempts, status: 'validating' });

        // VALIDATION PHASE
        if (codeValidator) {
          const validationLevel = projectSettings?.validationLevel || RETRY_CONFIG.defaultValidationLevel;
          log.info('Running validation', { level: validationLevel, attempt: currentAttempt });

          const validation = await codeValidator.validateAll(repoDir, result.files, validationLevel);
          attemptHistory.push({
            attempt: currentAttempt,
            durationMs: Date.now() - attemptStart,
            errors: validation.errors,
            tokens: { input: result.usage?.inputTokens, output: result.usage?.outputTokens }
          });

          if (!validation.passed) {
            log.warn('Validation failed', { attempt: currentAttempt, errorCount: validation.errors.length, errors: validation.errors.slice(0, 5) });
            lastValidationErrors = validation.errors;
            emitProgress(ticket.id, { type: 'forge_attempt', attempt: currentAttempt, maxAttempts, status: 'failed', errorCount: validation.errors.length });

            if (currentAttempt < maxAttempts) continue;
            throw new Error(`Validation failed after ${maxAttempts} attempts: ` + validation.errors.slice(0, 3).map(e => `${e.file}:${e.line}: ${e.message}`).join('; '));
          }
          log.info('Validation passed', { attempt: currentAttempt });
        } else {
          attemptHistory.push({ attempt: currentAttempt, durationMs: Date.now() - attemptStart, errors: [], tokens: { input: result.usage?.inputTokens, output: result.usage?.outputTokens } });
        }

        emitProgress(ticket.id, { type: 'forge_attempt', attempt: currentAttempt, maxAttempts, status: 'passed' });

        // 4. Commit and Push
        const commitHash = await commitAndPush(repoDir, ticket, branchName, result.summary);

        if (!commitHash) {
          throw new Error('No changes were made to the codebase (empty commit). Check if patches were applied correctly.');
        }

        // 5. Create PR
        const prUrl = await createPullRequest(ticket, branchName, result.summary, result.criteriaStatus);
        log.info('Created PR', { url: prUrl });

        await completeTicket(ticket.id, true, prUrl, null, result.criteriaStatus, filesWritten, branchName);
        log.info('Ticket completed successfully', { ticketId: ticket.id, prUrl, attempts: currentAttempt });

        if (agentLearning) {
          try {
            agentLearning.logExecution({ taskId: ticket.id, agentId: CONFIG.agentId, model, inputTokens, outputTokens, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - executionStart, outcome: 'success', prUrl, filesChanged: filesWritten, criteriaStatus: result.criteriaStatus, attempts: currentAttempt, attemptHistory });
          } catch (logErr) { log.warn('Failed to log execution', { error: logErr.message }); }
        }

        return { success: true, prUrl, filesWritten, attempts: currentAttempt, attemptHistory };

      } catch (attemptErr) {
        const isApiError = attemptErr.message?.includes('API error');
        const isNetworkError = attemptErr.message?.includes('ECONNREFUSED') || attemptErr.message?.includes('ETIMEDOUT');
        const isBlockedError = attemptErr.message?.includes('blocked');

        if (isApiError || isNetworkError || isBlockedError) throw attemptErr;

        attemptHistory.push({ attempt: currentAttempt, durationMs: Date.now() - attemptStart, errors: [{ type: 'exception', message: attemptErr.message }], tokens: { input: lastResult?.usage?.inputTokens, output: lastResult?.usage?.outputTokens } });

        if (currentAttempt < maxAttempts && !isBlockedError) {
          log.warn('Attempt failed, will retry', { attempt: currentAttempt, error: attemptErr.message });
          lastValidationErrors = [{ type: 'exception', file: 'unknown', line: 1, message: attemptErr.message }];
          continue;
        }
        throw attemptErr;
      }
    }
    throw new Error('Retry loop exited unexpectedly');

  } catch (err) {
    log.error('Ticket processing failed', { ticketId: ticket.id, error: err.message, attempts: attemptHistory.length, stack: err.stack });
    const errorType = err.message?.includes('Validation failed') ? 'validation_exhausted' : err.message?.includes('API error') ? 'api_error' : err.message?.includes('git') || err.message?.includes('push') ? 'git_error' : 'unknown';

    if (agentLearning) {
      try { agentLearning.logExecutionWithError({ taskId: ticket.id, agentId: CONFIG.agentId, model, inputTokens, outputTokens, startedAt, durationMs: Date.now() - executionStart, outcome: 'failure', errorMessage: err.message, errorType, attempts: attemptHistory.length, attemptHistory }); } catch (logErr) { log.warn('Failed to log execution error', { error: logErr.message }); }
    }

    try { await completeTicket(ticket.id, false, null, err.message, null, []); } catch (completeErr) { log.error('Failed to complete ticket', { error: completeErr.message }); }
    if (repoDir && fs.existsSync(repoDir)) { try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { } }

    return { success: false, error: err.message, errorType, validationErrors: attemptHistory.flatMap(a => a.errors || []), attempts: attemptHistory.length, attemptHistory };
  }
}


// Main loop
let running = true;

async function main() {
  if (!CONFIG.anthropicKey) {
    log.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }
  if (!CONFIG.githubToken) {
    log.error('GITHUB_TOKEN not set');
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG.workDir)) {
    fs.mkdirSync(CONFIG.workDir, { recursive: true });
  }

  log.info('Agent starting', {
    agentId: CONFIG.agentId,
    apiUrl: CONFIG.apiUrl,
    pollInterval: CONFIG.pollInterval,
    personaLoaded: FORGE_PERSONA.length > 100,
    retryEnabled: !!codeValidator,
    maxRetries: RETRY_CONFIG.maxInternalAttempts
  });

  const projectId = process.argv[2] || null;
  if (projectId) {
    log.info('Filtering to project', { projectId });
  }

  while (running) {
    try {
      const claimResult = await claimTicket(projectId);

      if (claimResult) {
        const { ticket, projectSettings } = claimResult;
        await processTicket(ticket, projectSettings);
        continue;
      } else {
        log.debug('No work available, sleeping', { interval: CONFIG.pollInterval });
        await new Promise(r => setTimeout(r, CONFIG.pollInterval));
      }
    } catch (err) {
      log.error('Main loop error', { error: err.message });
      await new Promise(r => setTimeout(r, CONFIG.pollInterval));
    }
  }

  log.info('Agent shutdown complete');
}

function shutdown(signal) {
  log.info('Shutdown signal received', { signal });
  running = false;
  if (agentLearning) { try { agentLearning.close(); } catch { } }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch(err => {
  log.error('Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
