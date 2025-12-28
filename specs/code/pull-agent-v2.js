#!/usr/bin/env node
/**
 * Swarm Pull-Based Agent v2 - With FORGE Persona
 * 
 * Runs inside Firecracker VMs, pulls tickets from the API, generates code via Claude
 * using the FORGE persona, commits to GitHub, and creates PRs.
 * 
 * Key Changes from v1:
 *   - FORGE persona loaded as system prompt
 *   - Structured JSON output parsing
 *   - Acceptance criteria status reporting
 *   - Self-verification before commit
 */

const { execSync, spawn } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration from environment
const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  agentId: process.env.AGENT_ID || os.hostname(),
  apiUrl: process.env.API_URL || 'http://10.0.0.1:8080',
  pollInterval: parseInt(process.env.POLL_INTERVAL || '10', 10) * 1000,
  workDir: process.env.WORK_DIR || '/tmp/agent-work',
  personaPath: process.env.PERSONA_PATH || '/opt/swarm-tickets/personas/forge.md',
  heartbeatInterval: 60000,
  claudeModel: 'claude-sonnet-4-20250514'
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

// API helpers
async function claimTicket(projectId = null) {
  const url = projectId 
    ? `${CONFIG.apiUrl}/claim?agent_id=${CONFIG.agentId}&project_id=${projectId}`
    : `${CONFIG.apiUrl}/claim?agent_id=${CONFIG.agentId}`;
    
  const res = await httpRequest(url, { method: 'POST' });
  
  if (res.status === 200 && res.data?.ticket) {
    return { ticket: res.data.ticket, projectSettings: res.data.project_settings || {} };
  }
  if (res.status === 204) return null;
  
  throw new Error(`Claim failed: ${res.status} - ${JSON.stringify(res.data)}`);
}

async function sendHeartbeat(ticketId) {
  await httpRequest(`${CONFIG.apiUrl}/tickets/${ticketId}/heartbeat`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { agent_id: CONFIG.agentId });
}

async function completeTicket(ticketId, success, prUrl = null, error = null, criteriaStatus = null, filesChanged = []) {
  await httpRequest(`${CONFIG.apiUrl}/tickets/${ticketId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    agent_id: CONFIG.agentId,
    success,
    pr_url: prUrl,
    error,
    criteria_status: criteriaStatus,
    files_changed: filesChanged
  });
}

// Claude API call with FORGE persona
async function generateCode(ticket, heartbeatFn, projectSettings = {}) {
  const prompt = buildPrompt(ticket);
  
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
      system: FORGE_PERSONA,  // FORGE persona as system prompt
      messages: [{ role: 'user', content: prompt }]
    });
    
    if (res.status !== 200) {
      throw new Error(`Claude API error: ${JSON.stringify(res.data)}`);
    }
    
    const content = res.data.content?.[0]?.text || '';
    return parseForgeResponse(content, ticket);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

function buildPrompt(ticket) {
  // Parse acceptance criteria
  let criteria = [];
  if (ticket.acceptance_criteria) {
    if (typeof ticket.acceptance_criteria === 'string') {
      try { criteria = JSON.parse(ticket.acceptance_criteria); } catch { criteria = [ticket.acceptance_criteria]; }
    } else if (Array.isArray(ticket.acceptance_criteria)) {
      criteria = ticket.acceptance_criteria;
    }
  }
  
  // Parse file hints
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

  const filesSection = fileHints.length > 0
    ? fileHints.join('\n')
    : 'Determine appropriate file structure';

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
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create",
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

IMPORTANT: 
- Response must be valid JSON only
- All code must be complete and functional
- Every acceptance criterion must have a status entry
- Status must be exactly: SATISFIED, PARTIALLY_SATISFIED, or BLOCKED`;
}

function parseForgeResponse(content, ticket) {
  // Try to extract JSON from the response
  let jsonStr = content;
  
  // Handle markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Validate structure
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('Response missing files array');
    }
    
    // Extract files for writing
    const files = parsed.files.map(f => ({
      path: f.path,
      content: f.content,
      action: f.action || 'create'
    }));
    
    // Add test files if present
    if (parsed.tests && Array.isArray(parsed.tests)) {
      for (const test of parsed.tests) {
        files.push({
          path: test.path,
          content: test.content,
          action: 'create'
        });
      }
    }
    
    // Store criteria status for reporting
    const criteriaStatus = parsed.acceptance_criteria_status || [];
    
    return {
      files,
      summary: parsed.summary || 'Implementation complete',
      criteriaStatus
    };
  } catch (err) {
    log.error('Failed to parse JSON response, falling back to file extraction', { error: err.message });
    
    // Fallback: Try to extract files using the old format
    return {
      files: parseFilesFromContent(content),
      summary: 'Fallback extraction',
      criteriaStatus: []
    };
  }
}

// Fallback parser for old format
function parseFilesFromContent(content) {
  const files = [];
  const regex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END FILE===/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2].trim(),
      action: 'create'
    });
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
  
  const branchName = ticket.branch_name || `ticket-${ticket.id}`;
  execGit(`git checkout -b ${branchName}`, repoDir);
  
  return { repoDir, branchName };
}

function writeFiles(repoDir, files) {
  const written = [];
  for (const file of files) {
    const filePath = path.join(repoDir, file.path);
    const fileDir = path.dirname(filePath);
    
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, file.content);
    written.push(file.path);
    log.info('Wrote file', { path: file.path, bytes: file.content.length });
  }
  return written;
}

function commitAndPush(repoDir, ticket, branchName, summary) {
  execGit('git add -A', repoDir);
  
  const message = `${ticket.id}: ${ticket.title}\n\n${summary}\n\nGenerated by Swarm Agent ${CONFIG.agentId} (FORGE)`;
  execGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoDir);
  execGit(`git push -u origin ${branchName}`, repoDir);
  
  const commitHash = execGit('git rev-parse --short HEAD', repoDir);
  log.info('Pushed commit', { commit: commitHash, branch: branchName });
  return commitHash;
}

async function createPullRequest(ticket, branchName, summary, criteriaStatus) {
  let match = ticket.repo_url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) {
    match = ticket.repo_url.match(/github\.com:([^\/]+)\/([^\/\.]+)/);
  }
  if (!match) throw new Error(`Invalid repo URL: ${ticket.repo_url}`);
  
  const [, owner, repo] = match;
  
  // Build PR body with criteria status
  let criteriaSection = '';
  if (criteriaStatus && criteriaStatus.length > 0) {
    criteriaSection = '\n\n## Acceptance Criteria Status\n\n' + 
      criteriaStatus.map(c => {
        const emoji = c.status === 'SATISFIED' ? '✅' : c.status === 'PARTIALLY_SATISFIED' ? '⚠️' : '❌';
        return `${emoji} **${c.id || 'Criterion'}**: ${c.criterion || 'N/A'}\n   - Status: ${c.status}\n   - Evidence: ${c.evidence || 'N/A'}`;
      }).join('\n\n');
  }
  
  const body = `## Ticket\n${ticket.id}\n\n## Description\n${ticket.description || 'Auto-generated'}\n\n## Summary\n${summary}${criteriaSection}\n\n---\n*Generated by Swarm Agent ${CONFIG.agentId} using FORGE persona*`;
  
  const res = await httpRequest(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `token ${CONFIG.githubToken}`,
      'User-Agent': 'Swarm-Agent-FORGE'
    }
  }, {
    title: `${ticket.id}: ${ticket.title}`,
    head: branchName,
    base: 'main',
    body
  });
  
  if (res.status === 201) {
    return res.data.html_url;
  }
  throw new Error(`PR creation failed: ${JSON.stringify(res.data)}`);
}

// Main ticket processing
async function processTicket(ticket, projectSettings = {}) {
  log.info('Processing ticket', { ticketId: ticket.id, title: ticket.title });
  
  let repoDir = null;
  
  try {
    // 1. Clone and branch
    const { repoDir: dir, branchName } = await cloneAndBranch(ticket);
    repoDir = dir;
    log.info('Cloned repo', { branch: branchName });
    
    // 2. Generate code with FORGE persona
    const heartbeatFn = () => sendHeartbeat(ticket.id).catch(e => log.error('Heartbeat failed', { error: e.message }));
    const result = await generateCode(ticket, heartbeatFn, projectSettings);
    
    if (!result.files || result.files.length === 0) {
      throw new Error('No files generated by FORGE');
    }
    log.info('Generated files', { count: result.files.length, files: result.files.map(f => f.path) });
    
    // 3. Check for BLOCKED criteria
    const blockedCriteria = result.criteriaStatus.filter(c => c.status === 'BLOCKED');
    if (blockedCriteria.length > 0) {
      log.error('BLOCKED criteria detected', { blocked: blockedCriteria });
      throw new Error(`Implementation blocked: ${blockedCriteria.map(c => c.criterion).join(', ')}`);
    }
    
    // 4. Write files
    const filesWritten = writeFiles(repoDir, result.files);
    
    // 5. Commit and push
    commitAndPush(repoDir, ticket, branchName, result.summary);
    
    // 6. Create PR
    const prUrl = await createPullRequest(ticket, branchName, result.summary, result.criteriaStatus);
    log.info('Created PR', { url: prUrl });
    
    // 7. Complete ticket with criteria status
    await completeTicket(ticket.id, true, prUrl, null, result.criteriaStatus, filesWritten);
    log.info('Ticket completed successfully', { ticketId: ticket.id, prUrl });
    
    return true;
  } catch (err) {
    log.error('Ticket processing failed', { ticketId: ticket.id, error: err.message, stack: err.stack });
    
    try {
      await completeTicket(ticket.id, false, null, err.message);
    } catch (completeErr) {
      log.error('Failed to mark ticket as failed', { error: completeErr.message });
    }
    
    return false;
  } finally {
    if (repoDir && fs.existsSync(repoDir)) {
      try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch {}
    }
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
    personaLoaded: FORGE_PERSONA.length > 100
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
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch(err => {
  log.error('Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
