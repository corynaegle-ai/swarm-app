#!/usr/bin/env node
/**
 * Worker Agent - FORGE Persona
 * Coding agent that executes tickets with expert-level code generation
 * 
 * Location: /opt/swarm-tickets/worker-agent/worker-agent.js
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const Database = require('better-sqlite3');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  PERSONA_PATH: '/opt/swarm-tickets/personas/forge.md',
  DB_PATH: '/opt/swarm-tickets/tickets.db',
  DEFAULT_MODEL: 'claude-sonnet-4-20250514',  // Sonnet 4 for speed
  MAX_TOKENS: 8192,
  API_HOST: process.env.API_HOST || '10.0.0.1',
  API_PORT: process.env.API_PORT || 8080,
  WORK_DIR: process.env.WORK_DIR || '/tmp/swarm-work',
  HEARTBEAT_INTERVAL: 30000  // 30 seconds
};

const API_BASE = `http://${CONFIG.API_HOST}:${CONFIG.API_PORT}`;

// ============================================================================
// DATABASE
// ============================================================================

let db;

function initDb() {
  db = new Database(CONFIG.DB_PATH);
}

// ============================================================================
// PERSONA & MODEL
// ============================================================================

let FORGE_PERSONA = null;

async function loadPersona() {
  if (!FORGE_PERSONA) {
    try {
      FORGE_PERSONA = await fs.readFile(CONFIG.PERSONA_PATH, 'utf8');
      console.log('[WorkerAgent] FORGE persona loaded');
    } catch (err) {
      console.error('[WorkerAgent] Failed to load persona:', err.message);
      FORGE_PERSONA = `You are FORGE, an expert software engineer with 20 years experience.
You write clean, well-documented, production-ready code.
Handle errors where they occur. Tests are documentation that can't lie.
Working code is the minimum bar, not the goal.`;
    }
  }
  return FORGE_PERSONA;
}

function getWorkerModel(projectId) {
  if (!projectId || !db) return CONFIG.DEFAULT_MODEL;
  try {
    const settings = db.prepare(
      'SELECT worker_model FROM project_settings WHERE project_id = ?'
    ).get(projectId);
    return settings?.worker_model || CONFIG.DEFAULT_MODEL;
  } catch {
    return CONFIG.DEFAULT_MODEL;
  }
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================

function buildCodingPrompt(ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const fileHints = JSON.parse(ticket.file_hints || '[]');
  
  return `
## Ticket: ${ticket.id}
## Title: ${ticket.title}

## Description
${ticket.description || 'No description provided'}

## Acceptance Criteria
${criteria.length > 0
  ? criteria.map((c, i) => `${i + 1}. [${c.id}] ${c.description}`).join('\n')
  : 'No specific criteria - use your judgment'}

## File Hints
${fileHints.length > 0 
  ? fileHints.join('\n') 
  : 'None specified - determine appropriate file structure'}

## Repository Context
- Repo: ${ticket.repo_url || 'N/A'}
- Branch: ${ticket.branch_name || 'N/A'}

## Instructions

1. **Understand**: Read the description and ALL acceptance criteria carefully
2. **Plan**: Identify modules, functions, and interfaces needed
3. **Implement**: Write clean, well-structured code following your standards
4. **Verify**: Ensure EVERY acceptance criterion is satisfied
5. **Report**: Include status for each criterion in your response

## Required Output Format (JSON only, no markdown):

{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "content": "// File content here...",
      "action": "create" | "modify" | "delete"
    }
  ],
  "criteria_status": [
    {
      "id": "AC-001",
      "status": "SATISFIED" | "PARTIALLY_SATISFIED" | "BLOCKED",
      "evidence": "How/where the criterion is satisfied in the code"
    }
  ],
  "summary": "Brief summary of what was implemented",
  "notes": "Any important notes for the reviewer"
}

Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.
`;
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

function execGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`Git command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

async function setupWorkspace(ticket) {
  const workDir = CONFIG.WORK_DIR;
  
  // Clean and create work directory
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  
  // Clone repo
  console.log(`[WorkerAgent] Cloning ${ticket.repo_url}...`);
  execGit(`git clone ${ticket.repo_url} .`, workDir);
  
  // Create/checkout branch
  const branch = ticket.branch_name || `ticket-${ticket.id}`;
  try {
    execGit(`git checkout ${branch}`, workDir);
  } catch {
    execGit(`git checkout -b ${branch}`, workDir);
  }
  
  console.log(`[WorkerAgent] Workspace ready on branch: ${branch}`);
  return { workDir, branch };
}

async function applyChanges(workDir, files) {
  for (const file of files) {
    const filePath = path.join(workDir, file.path);
    
    if (file.action === 'delete') {
      await fs.rm(filePath, { force: true });
      console.log(`[WorkerAgent] Deleted: ${file.path}`);
    } else {
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
      console.log(`[WorkerAgent] ${file.action === 'create' ? 'Created' : 'Modified'}: ${file.path}`);
    }
  }
}

async function commitAndPush(workDir, ticket, summary) {
  // Check for changes
  const status = execGit('git status --porcelain', workDir);
  if (!status) {
    throw new Error('No changes to commit');
  }
  
  // Stage all changes
  execGit('git add -A', workDir);
  
  // Commit
  const commitMsg = `[${ticket.id}] ${ticket.title}\n\n${summary}`;
  execGit(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, workDir);
  
  // Push
  const branch = ticket.branch_name || `ticket-${ticket.id}`;
  execGit(`git push -u origin ${branch}`, workDir);
  
  console.log(`[WorkerAgent] Pushed to branch: ${branch}`);
  return branch;
}


// ============================================================================
// CODE GENERATION
// ============================================================================

async function generateCode(ticket) {
  const persona = await loadPersona();
  const model = getWorkerModel(ticket.project_id);
  
  console.log(`[WorkerAgent] Generating code with model: ${model}`);
  
  const anthropic = new Anthropic();
  const prompt = buildCodingPrompt(ticket);
  
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: CONFIG.MAX_TOKENS,
    system: persona,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const content = response.content[0].text;
  
  // Parse response
  let result;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[WorkerAgent] Failed to parse response:', err.message);
    throw new Error('Failed to parse code generation response');
  }
  
  // Validate required fields
  if (!result.files || !Array.isArray(result.files)) {
    throw new Error('Invalid response: missing files array');
  }
  
  return result;
}

// ============================================================================
// SELF-VERIFICATION
// ============================================================================

function selfVerify(codeResult, ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const claimedStatus = codeResult.criteria_status || [];
  
  const verification = {
    passed: true,
    blockers: [],
    partial: [],
    satisfied: []
  };
  
  for (const criterion of criteria) {
    const status = claimedStatus.find(s => s.id === criterion.id);
    
    if (!status) {
      verification.passed = false;
      verification.blockers.push({
        id: criterion.id,
        reason: 'No status reported for criterion'
      });
    } else if (status.status === 'BLOCKED') {
      verification.passed = false;
      verification.blockers.push({
        id: criterion.id,
        reason: status.evidence || 'Marked as blocked'
      });
    } else if (status.status === 'PARTIALLY_SATISFIED') {
      verification.partial.push({
        id: criterion.id,
        evidence: status.evidence
      });
    } else {
      verification.satisfied.push({
        id: criterion.id,
        evidence: status.evidence
      });
    }
  }
  
  return verification;
}

// ============================================================================
// API HELPERS
// ============================================================================

async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(url, options);
  return response.json();
}

async function claimTicket(agentId, projectId = null) {
  const body = { agent_id: agentId };
  if (projectId) body.project_id = projectId;
  return apiRequest('/claim', 'POST', body);
}

async function completeTicket(ticketId, agentId, success, prUrl = null, error = null, criteriaStatus = null) {
  const body = {
    ticket_id: ticketId,
    agent_id: agentId,
    success,
    pr_url: prUrl,
    error_message: error,
    criteria_status: criteriaStatus
  };
  return apiRequest('/complete', 'POST', body);
}

async function heartbeat(ticketId, agentId, progress = 50) {
  return apiRequest('/heartbeat', 'POST', {
    ticket_id: ticketId,
    agent_id: agentId,
    progress
  });
}

// ============================================================================
// TICKET EXECUTION
// ============================================================================

async function executeTicket(ticket, agentId) {
  console.log(`[WorkerAgent] Executing ticket: ${ticket.id} - ${ticket.title}`);
  
  // Start heartbeat
  const heartbeatInterval = setInterval(() => {
    heartbeat(ticket.id, agentId).catch(() => {});
  }, CONFIG.HEARTBEAT_INTERVAL);
  
  try {
    // Setup workspace
    const { workDir, branch } = await setupWorkspace(ticket);
    
    // Generate code
    const codeResult = await generateCode(ticket);
    
    // Self-verify
    const verification = selfVerify(codeResult, ticket);
    
    if (!verification.passed && verification.blockers.length > 0) {
      const blockerMsg = verification.blockers.map(b => `${b.id}: ${b.reason}`).join('; ');
      throw new Error(`Blocked criteria: ${blockerMsg}`);
    }
    
    // Apply changes
    await applyChanges(workDir, codeResult.files);
    
    // Commit and push
    await commitAndPush(workDir, ticket, codeResult.summary || 'Code generated by FORGE');
    
    // Build PR URL
    const repoPath = ticket.repo_url.replace(/.*:/, '').replace(/\.git$/, '');
    const prUrl = `https://github.com/${repoPath}/compare/${branch}?expand=1`;
    
    // Complete ticket
    clearInterval(heartbeatInterval);
    await completeTicket(
      ticket.id, 
      agentId, 
      true, 
      prUrl, 
      null,
      JSON.stringify(codeResult.criteria_status || [])
    );
    
    console.log(`[WorkerAgent] Ticket ${ticket.id} completed successfully`);
    return { success: true, prUrl, verification };
    
  } catch (err) {
    clearInterval(heartbeatInterval);
    console.error(`[WorkerAgent] Ticket ${ticket.id} failed:`, err.message);
    await completeTicket(ticket.id, agentId, false, null, err.message, null);
    return { success: false, error: err.message };
  }
}


// ============================================================================
// DAEMON MODE (Poll for work)
// ============================================================================

async function runDaemon(agentId, projectId = null) {
  console.log(`[WorkerAgent] Daemon starting (agent: ${agentId}, API: ${API_BASE})`);
  
  // Verify API connectivity
  try {
    await apiRequest('/health');
    console.log('[WorkerAgent] API connection verified');
  } catch (err) {
    console.error('[WorkerAgent] Cannot reach API:', err.message);
    process.exit(1);
  }
  
  let idleStart = Date.now();
  let consecutiveEmpty = 0;
  const IDLE_TIMEOUT = 300000;  // 5 minutes
  
  while (true) {
    try {
      // Claim work
      const response = await claimTicket(agentId, projectId);
      
      if (response.status === 'claimed') {
        idleStart = Date.now();
        consecutiveEmpty = 0;
        
        await executeTicket(response.ticket, agentId);
        
        // Small delay between tasks
        await sleep(2000);
      } else if (response.status === 'no_work') {
        consecutiveEmpty++;
        
        // Check idle timeout
        const idleTime = Date.now() - idleStart;
        if (idleTime >= IDLE_TIMEOUT) {
          console.log(`[WorkerAgent] Idle timeout (${idleTime}ms), shutting down`);
          break;
        }
        
        // Exponential backoff: 5s, 10s, 20s, max 60s
        const waitTime = Math.min(5000 * Math.pow(2, Math.min(consecutiveEmpty, 3)), 60000);
        console.log(`[WorkerAgent] No work, waiting ${waitTime}ms (idle: ${idleTime}ms)`);
        await sleep(waitTime);
      } else {
        console.error('[WorkerAgent] Unexpected response:', response);
        await sleep(10000);
      }
    } catch (err) {
      console.error('[WorkerAgent] Error in main loop:', err.message);
      await sleep(10000);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// SINGLE TICKET MODE
// ============================================================================

async function runSingleTicket(ticketId, agentId) {
  initDb();
  
  // Get ticket from database
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }
  
  const result = await executeTicket(ticket, agentId);
  return result;
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Worker Agent (FORGE) - Usage:

  Daemon mode (poll for work):
    worker-agent.js --daemon [--agent-id <id>] [--project <project_id>]

  Single ticket mode:
    worker-agent.js --ticket <ticket_id> [--agent-id <id>]

  Options:
    --agent-id    Agent identifier (default: hostname-pid)
    --project     Filter for specific project
    --daemon      Run in daemon mode (poll for work)
    --ticket      Execute a specific ticket
`);
    process.exit(0);
  }
  
  // Parse arguments
  let mode = 'daemon';
  let agentId = `agent-${process.pid}`;
  let projectId = null;
  let ticketId = null;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--daemon':
        mode = 'daemon';
        break;
      case '--ticket':
        mode = 'single';
        ticketId = args[++i];
        break;
      case '--agent-id':
        agentId = args[++i];
        break;
      case '--project':
        projectId = args[++i];
        break;
    }
  }
  
  // Run
  try {
    if (mode === 'single') {
      if (!ticketId) {
        console.error('Error: --ticket requires a ticket ID');
        process.exit(1);
      }
      const result = await runSingleTicket(ticketId, agentId);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    } else {
      await runDaemon(agentId, projectId);
    }
  } catch (err) {
    console.error('[WorkerAgent] Fatal error:', err.message);
    process.exit(1);
  }
}

// Export for module use
module.exports = { executeTicket, generateCode, loadPersona, initDb };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
