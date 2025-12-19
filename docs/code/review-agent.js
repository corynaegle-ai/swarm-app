#!/usr/bin/env node
/**
 * Swarm Review Agent - SENTINEL Persona
 * 
 * Automated code review agent that enforces strict quality standards.
 * Acts as the quality gate between code generation and merge.
 * 
 * Key Features:
 *   - SENTINEL persona for hardcore code review
 *   - Acceptance criteria validation
 *   - Human escalation after max attempts
 *   - Revision ticket creation
 * 
 * Environment Variables:
 *   ANTHROPIC_API_KEY - Claude API key
 *   GITHUB_TOKEN - GitHub personal access token (for PR diff fetching)
 *   API_URL - Ticket API URL (defaults to http://localhost:8080)
 *   PORT - Review agent port (default: 8081)
 *   PERSONA_PATH - Path to SENTINEL persona (default: /opt/swarm-tickets/personas/sentinel.md)
 *   DB_PATH - SQLite database path (default: /opt/swarm-tickets/data/swarm.db)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  apiUrl: process.env.API_URL || 'http://localhost:8080',
  port: parseInt(process.env.PORT || '8081', 10),
  personaPath: process.env.PERSONA_PATH || '/opt/swarm-tickets/personas/sentinel.md',
  dbPath: process.env.DB_PATH || '/opt/swarm-tickets/data/swarm.db',
  defaultModel: 'claude-opus-4-5-20251101',  // Opus 4.5 for thorough review
  maxReviewAttempts: 3
};

// Load SENTINEL persona
let SENTINEL_PERSONA = '';
try {
  SENTINEL_PERSONA = fs.readFileSync(CONFIG.personaPath, 'utf8');
} catch (err) {
  console.error(`Warning: Could not load SENTINEL persona: ${err.message}`);
  SENTINEL_PERSONA = 'You are SENTINEL, a hardcore code reviewer with 25 years experience. Be thorough and strict.';
}

// Logging
const log = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), service: 'review-agent', msg, ...data })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), service: 'review-agent', msg, ...data })),
  debug: (msg, data = {}) => process.env.DEBUG && console.log(JSON.stringify({ level: 'debug', ts: new Date().toISOString(), service: 'review-agent', msg, ...data }))
};

// Generate unique IDs
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

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
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null, raw: data });
        } catch {
          resolve({ status: res.statusCode, data, raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }
    req.end();
  });
}

// Database operations (using sqlite3)
let db = null;
async function initDb() {
  const sqlite3 = require('better-sqlite3');
  db = sqlite3(CONFIG.dbPath);
  
  // Create reviews table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      pr_number INTEGER,
      pr_url TEXT,
      decision TEXT NOT NULL,
      score INTEGER,
      summary TEXT,
      issues_json TEXT,
      criteria_verification TEXT,
      criteria_met INTEGER,
      criteria_total INTEGER,
      criteria_failed TEXT,
      reviewer_type TEXT DEFAULT 'agent',
      reviewer_id TEXT,
      model_used TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      is_human INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_reviews_ticket ON reviews(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_decision ON reviews(decision);
  `);
  
  // Ensure admin user exists
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get('admin');
  if (!admin) {
    db.prepare(`INSERT INTO users (id, email, name, role, is_human) VALUES (?, ?, ?, ?, ?)`)
      .run('admin', 'admin@swarmstack.net', 'System Admin', 'admin', 1);
  }
  
  log.info('Database initialized', { path: CONFIG.dbPath });
}

// Fetch PR diff from GitHub
async function fetchPRDiff(prUrl) {
  // Parse PR URL: https://github.com/owner/repo/pull/123
  const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`Invalid PR URL: ${prUrl}`);
  
  const [, owner, repo, prNumber] = match;
  
  const res = await httpRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3.diff',
        'Authorization': `token ${CONFIG.githubToken}`,
        'User-Agent': 'Swarm-Review-Agent'
      }
    }
  );
  
  if (res.status !== 200) {
    throw new Error(`Failed to fetch PR diff: ${res.status}`);
  }
  
  return { diff: res.raw, prNumber: parseInt(prNumber, 10), owner, repo };
}

// Get ticket from API
async function getTicket(ticketId) {
  const res = await httpRequest(`${CONFIG.apiUrl}/tickets/${ticketId}`);
  if (res.status !== 200) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }
  return res.data;
}

// Get project settings
async function getProjectSettings(projectId) {
  if (!projectId) return {};
  try {
    const res = await httpRequest(`${CONFIG.apiUrl}/projects/${projectId}/settings`);
    return res.status === 200 ? res.data : {};
  } catch {
    return {};
  }
}

// Select review model
function selectModel(projectSettings) {
  if (projectSettings?.review_model) {
    return projectSettings.review_model;
  }
  return CONFIG.defaultModel;
}

// Build review prompt for SENTINEL
function buildReviewPrompt(diff, ticket, workerCriteriaStatus) {
  let criteria = [];
  if (ticket.acceptance_criteria) {
    if (typeof ticket.acceptance_criteria === 'string') {
      try { criteria = JSON.parse(ticket.acceptance_criteria); } catch { criteria = [ticket.acceptance_criteria]; }
    } else if (Array.isArray(ticket.acceptance_criteria)) {
      criteria = ticket.acceptance_criteria;
    }
  }
  
  const criteriaSection = criteria.length > 0 
    ? criteria.map((c, i) => {
        if (typeof c === 'object' && c.id) {
          return `${i + 1}. [${c.id}] ${c.description}`;
        }
        return `${i + 1}. ${c}`;
      }).join('\n')
    : 'No explicit criteria - review for general quality';
  
  const workerStatusSection = workerCriteriaStatus && workerCriteriaStatus.length > 0
    ? workerCriteriaStatus.map(s => `- [${s.id || 'N/A'}] ${s.status}: ${s.evidence || 'No evidence'}`).join('\n')
    : 'No worker status reported';

  return `## Code Review Request

### Ticket: ${ticket.id} - ${ticket.title}

### Description
${ticket.description || 'No description provided'}

### Acceptance Criteria (ALL MUST BE SATISFIED)
${criteriaSection}

### Worker Agent's Claimed Status
${workerStatusSection}

### Code Diff
\`\`\`diff
${diff.substring(0, 50000)}
\`\`\`
${diff.length > 50000 ? '\n[DIFF TRUNCATED - Full diff exceeds 50KB]' : ''}

## Review Instructions

### Step 1: Verify Each Acceptance Criterion
For EACH criterion listed above:
1. Examine the code to determine if it ACTUALLY satisfies the criterion
2. Compare against worker's claimed status - are they accurate?
3. Mark as VERIFIED, PARTIALLY_MET, or NOT_MET

### Step 2: Standard Code Review
Apply your SENTINEL review checklist:
- Security vulnerabilities (SQL injection, XSS, auth bypass, etc.)
- Error handling (try/catch, edge cases, validation)
- Code quality and readability
- Performance concerns
- Test coverage (if tests exist)

### Step 3: Determine Decision

**CRITICAL RULE**: If ANY acceptance criterion is NOT_MET, decision CANNOT be APPROVE.

| Criteria Status | Allowed Decisions |
|-----------------|-------------------|
| All VERIFIED | APPROVE (if code quality passes) |
| Any PARTIALLY_MET | REQUEST_CHANGES only |
| Any NOT_MET | REQUEST_CHANGES or REJECT |

## Required Output Format

You MUST respond with ONLY valid JSON in this exact format:

\`\`\`json
{
  "decision": "APPROVE | REQUEST_CHANGES | REJECT",
  "score": 0-100,
  "summary": "Brief overall assessment",
  
  "acceptance_criteria_verification": [
    {
      "id": "AC-001",
      "criterion": "User can register with email",
      "worker_claimed": "SATISFIED",
      "actual_status": "VERIFIED | PARTIALLY_MET | NOT_MET",
      "evidence": "Found in userService.js:15-40",
      "discrepancy": null
    }
  ],
  
  "issues": [
    {
      "severity": "CRITICAL | MAJOR | MINOR | SUGGESTION",
      "category": "security | error_handling | logic | quality | performance | testing",
      "file": "path/to/file.js",
      "line": 42,
      "description": "What's wrong",
      "suggestion": "How to fix"
    }
  ],
  
  "tests_required": ["List of tests that should be added"],
  "blocking_issues_count": 0,
  "approval_blockers": ["List of things that MUST be fixed before approval"]
}
\`\`\`

Remember: You are SENTINEL. Acceptance criteria are non-negotiable. 
If a criterion is not met, the code is not done - period.`;
}
