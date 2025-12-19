#!/usr/bin/env node
/**
 * FORGE Agent v3 - File-Mode Compatible
 * 
 * Supports two execution modes:
 *   1. FILE MODE: node main.js /tmp/input.json /tmp/output.json
 *   2. POLL MODE: node main.js [projectId]
 * 
 * File mode is used by the Swarm execution engine.
 * Poll mode is for standalone VM operation.
 */

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect execution mode
const args = process.argv.slice(2);
const FILE_MODE = args.length >= 2 && args[0].endsWith('.json') && args[1].endsWith('.json');
const INPUT_PATH = FILE_MODE ? args[0] : null;
const OUTPUT_PATH = FILE_MODE ? args[1] : null;

// Configuration
const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  agentId: process.env.AGENT_ID || os.hostname(),
  apiUrl: process.env.API_URL || 'http://10.0.0.1:8080',
  pollInterval: parseInt(process.env.POLL_INTERVAL || '10', 10) * 1000,
  workDir: process.env.WORK_DIR || '/tmp/agent-work',
  personaPath: process.env.PERSONA_PATH || '/opt/personas/forge.md',
  claudeModel: 'claude-sonnet-4-20250514'
};

// Model selection
const MODEL_BY_SCOPE = {
  small: 'claude-sonnet-4-20250514',
  medium: 'claude-sonnet-4-20250514',
  large: 'claude-opus-4-20250514'
};

// Load FORGE persona
let FORGE_PERSONA = '';
try {
  FORGE_PERSONA = fs.readFileSync(CONFIG.personaPath, 'utf8');
} catch (err) {
  FORGE_PERSONA = `You are FORGE, an expert autonomous coding agent.
Your job is to implement tickets by generating clean, tested code.
Always follow best practices, write tests, and create meaningful commits.`;
}

// Logger
const log = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data })),
  debug: (msg, data = {}) => process.env.DEBUG && console.log(JSON.stringify({ level: 'debug', ts: new Date().toISOString(), agent: CONFIG.agentId, msg, ...data }))
};

// HTTP helper
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
        } catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Claude API call
async function callClaude(messages, model = CONFIG.claudeModel) {
  const res = await httpRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.anthropicKey,
      'anthropic-version': '2023-06-01'
    }
  }, {
    model,
    max_tokens: 8192,
    system: FORGE_PERSONA,
    messages
  });
  if (res.status !== 200) throw new Error(`Claude API error: ${res.status} - ${JSON.stringify(res.data)}`);
  return res.data.content[0].text;
}

// Parse JSON from Claude response
function parseCodeResponse(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }
  try { return JSON.parse(text); } catch {}
  return { files: [], summary: 'Could not parse response', criteriaStatus: [] };
}

// Write files to repo
function writeFiles(repoDir, files) {
  const written = [];
  for (const file of files || []) {
    const filePath = path.join(repoDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content);
    written.push(file.path);
    log.info('File written', { path: file.path });
  }
  return written;
}

// Git operations
function cloneRepo(repoUrl, destDir) {
  const sshUrl = repoUrl.replace('https://github.com/', 'git@github.com:');
  execSync(`git clone --depth 1 ${sshUrl} ${destDir}`, { stdio: 'pipe' });
}

function createBranch(repoDir, branchName) {
  execSync(`git checkout -b ${branchName}`, { cwd: repoDir, stdio: 'pipe' });
}

function commitAndPush(repoDir, ticket, branchName, summary) {
  execSync('git add -A', { cwd: repoDir, stdio: 'pipe' });
  const commitMsg = `${ticket.id}: ${ticket.title}\n\n${summary}\n\n[automated by FORGE]`;
  execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: repoDir, stdio: 'pipe' });
  execSync(`git push -u origin ${branchName}`, { cwd: repoDir, stdio: 'pipe' });
}

async function createPullRequest(ticket, branchName, summary) {
  const [owner, repo] = ticket.repo_url.replace('https://github.com/', '').split('/');
  const body = `## ${ticket.title}\n\n${ticket.description}\n\n### Implementation\n${summary}\n\n### Acceptance Criteria\n${ticket.acceptance_criteria}\n\n---\n*Automated by FORGE Agent*`;
  
  const res = await httpRequest(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'FORGE-Agent/3.0'
    }
  }, {
    title: `${ticket.id}: ${ticket.title}`,
    body,
    head: branchName,
    base: 'main'
  });
  
  if (res.status !== 201) throw new Error(`GitHub PR creation failed: ${res.status}`);
  return res.data.html_url;
}

// Main ticket processing
async function processTicket(ticket, projectSettings = {}) {
  const model = projectSettings?.worker_model || MODEL_BY_SCOPE[ticket.estimated_scope] || CONFIG.claudeModel;
  const branchName = `forge/${ticket.id}-${Date.now()}`;
  let repoDir = null;
  
  try {
    log.info('Processing ticket', { id: ticket.id, title: ticket.title, model });
    
    // Clone repo
    repoDir = path.join(CONFIG.workDir, `repo-${ticket.id}-${Date.now()}`);
    cloneRepo(ticket.repo_url, repoDir);
    createBranch(repoDir, branchName);
    
    // Build prompt
    const prompt = `Implement this ticket:

TICKET: ${ticket.id}
TITLE: ${ticket.title}
DESCRIPTION: ${ticket.description}
ACCEPTANCE CRITERIA: ${ticket.acceptance_criteria}
FILES HINT: ${ticket.files_hint || 'Not specified'}

Respond with JSON:
\`\`\`json
{
  "files": [{"path": "relative/path", "content": "file content"}],
  "summary": "Brief summary of changes",
  "criteriaStatus": [{"criterion": "...", "status": "PASS|FAIL|BLOCKED", "evidence": "..."}]
}
\`\`\``;
    
    // Call Claude
    const response = await callClaude([{ role: 'user', content: prompt }], model);
    const result = parseCodeResponse(response);
    
    if (!result.files || result.files.length === 0) {
      throw new Error('No files generated');
    }
    
    // Write, commit, push, PR
    const filesWritten = writeFiles(repoDir, result.files);
    commitAndPush(repoDir, ticket, branchName, result.summary || 'Implementation');
    const prUrl = await createPullRequest(ticket, branchName, result.summary || 'Implementation');
    
    log.info('Ticket completed', { id: ticket.id, prUrl, files: filesWritten.length });
    
    return {
      success: true,
      prUrl,
      filesWritten,
      summary: result.summary,
      criteriaStatus: result.criteriaStatus
    };
    
  } catch (err) {
    log.error('Ticket failed', { id: ticket.id, error: err.message });
    return {
      success: false,
      error: err.message
    };
  } finally {
    if (repoDir && fs.existsSync(repoDir)) {
      try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch {}
    }
  }
}

// API functions for poll mode
async function claimTicket(projectId = null) {
  const url = `${CONFIG.apiUrl}/api/tickets/claim?agent_id=${CONFIG.agentId}${projectId ? `&project_id=${projectId}` : ''}`;
  const res = await httpRequest(url, { method: 'POST' });
  if (res.status === 200 && res.data?.ticket) return res.data;
  return null;
}

async function completeTicket(ticketId, success, prUrl, error) {
  await httpRequest(`${CONFIG.apiUrl}/api/tickets/${ticketId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { success, pr_url: prUrl, error });
}

// ==================== MAIN ====================

async function main() {
  // Validate environment
  if (!CONFIG.anthropicKey) {
    log.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }
  if (!CONFIG.githubToken) {
    log.error('GITHUB_TOKEN not set');
    process.exit(1);
  }
  
  fs.mkdirSync(CONFIG.workDir, { recursive: true });
  
  // FILE MODE: Execute single ticket from input.json, write to output.json
  if (FILE_MODE) {
    log.info('Starting in FILE MODE', { input: INPUT_PATH, output: OUTPUT_PATH });
    
    try {
      const input = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
      const ticket = input.ticket || input;
      const projectSettings = input.projectSettings || {};
      
      const result = await processTicket(ticket, projectSettings);
      
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
      log.info('Output written', { path: OUTPUT_PATH, success: result.success });
      
      process.exit(result.success ? 0 : 1);
      
    } catch (err) {
      log.error('File mode failed', { error: err.message });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ success: false, error: err.message }));
      process.exit(1);
    }
  }
  
  // POLL MODE: Continuously pull tickets from API
  log.info('Starting in POLL MODE', { apiUrl: CONFIG.apiUrl });
  
  const projectId = args[0] || null;
  let running = true;
  
  const shutdown = (sig) => { log.info('Shutdown', { signal: sig }); running = false; };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  while (running) {
    try {
      const claimResult = await claimTicket(projectId);
      if (claimResult) {
        const { ticket, projectSettings } = claimResult;
        const result = await processTicket(ticket, projectSettings);
        await completeTicket(ticket.id, result.success, result.prUrl, result.error);
      } else {
        await new Promise(r => setTimeout(r, CONFIG.pollInterval));
      }
    } catch (err) {
      log.error('Poll loop error', { error: err.message });
      await new Promise(r => setTimeout(r, CONFIG.pollInterval));
    }
  }
}

main().catch(err => {
  log.error('Fatal', { error: err.message });
  process.exit(1);
});
