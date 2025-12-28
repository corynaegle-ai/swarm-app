#!/usr/bin/env node
/**
 * Review Agent - SENTINEL Persona
 * Automated code review agent for Swarm Worker PRs
 * 
 * Location: /opt/swarm-tickets/review-agent/review-agent.js
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const Database = require('better-sqlite3');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  PERSONA_PATH: '/opt/swarm-tickets/personas/sentinel.md',
  DB_PATH: '/opt/swarm-tickets/tickets.db',
  DEFAULT_MODEL: 'claude-opus-4-5-20251101',  // Opus 4.5 for thorough review
  MAX_TOKENS: 8192,
  API_HOST: process.env.API_HOST || '10.0.0.1',
  API_PORT: process.env.API_PORT || 8080
};

const API_BASE = `http://${CONFIG.API_HOST}:${CONFIG.API_PORT}`;

// Human assignment reason constants
const HUMAN_ASSIGNMENT_REASONS = {
  MAX_ATTEMPTS_EXCEEDED: 'Maximum review attempts (3) exceeded without passing review',
  CRITICAL_SECURITY: 'Critical security vulnerability detected - requires human verification',
  LOW_SCORE: 'Review score below 30 indicates fundamental design issues',
  AGENT_ERROR: 'Worker agent encountered unrecoverable error',
  MANUAL_OVERRIDE: 'Human review explicitly requested',
  DESIGN_REVIEW_NEEDED: 'Architectural changes require human approval'
};

// ============================================================================
// DATABASE
// ============================================================================

let db;

function initDb() {
  db = new Database(CONFIG.DB_PATH);
  
  // Ensure review tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      pr_number INTEGER,
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
    
    CREATE TABLE IF NOT EXISTS project_settings (
      project_id TEXT PRIMARY KEY,
      review_model TEXT,
      review_strictness TEXT,
      max_review_attempts INTEGER,
      auto_merge_on_approve INTEGER DEFAULT 0,
      worker_model TEXT,
      worker_max_tokens INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  
  // Ensure default admin
  const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!admin) {
    db.prepare(`INSERT OR IGNORE INTO users (id, email, name, role, is_human)
      VALUES ('admin', 'admin@swarmstack.net', 'System Admin', 'admin', 1)`).run();
  }
}

function generateId() {
  return `REV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// ============================================================================
// PERSONA & MODEL
// ============================================================================

let SENTINEL_PERSONA = null;

async function loadPersona() {
  if (!SENTINEL_PERSONA) {
    try {
      SENTINEL_PERSONA = await fs.readFile(CONFIG.PERSONA_PATH, 'utf8');
      console.log('[ReviewAgent] SENTINEL persona loaded');
    } catch (err) {
      console.error('[ReviewAgent] Failed to load persona:', err.message);
      SENTINEL_PERSONA = `You are SENTINEL, an expert code reviewer with 25 years experience.
Security is paramount. Code must be readable and maintainable.
If acceptance criteria are not met, the code is not done - period.`;
    }
  }
  return SENTINEL_PERSONA;
}

function getReviewModel(projectId) {
  if (!projectId) return CONFIG.DEFAULT_MODEL;
  const settings = db.prepare(
    'SELECT review_model FROM project_settings WHERE project_id = ?'
  ).get(projectId);
  return settings?.review_model || CONFIG.DEFAULT_MODEL;
}


// ============================================================================
// PROMPT BUILDER
// ============================================================================

function buildReviewPrompt(prDiff, ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const workerStatus = JSON.parse(ticket.criteria_status || '[]');
  const fileHints = JSON.parse(ticket.file_hints || '[]');
  
  return `
## Code Review Request

### Ticket: ${ticket.id} - ${ticket.title}

### Description
${ticket.description || 'No description provided'}

### Acceptance Criteria (ALL MUST BE SATISFIED)
${criteria.length > 0 
  ? criteria.map((c, i) => `${i + 1}. [${c.id}] ${c.description}`).join('\n')
  : 'No acceptance criteria specified'}

### Worker Agent's Claimed Status
${workerStatus.length > 0
  ? workerStatus.map(s => `- [${s.id}] ${s.status}: ${s.evidence || 'No evidence'}`).join('\n')
  : 'No status report from worker'}

### Expected Files
${fileHints.length > 0 ? fileHints.join('\n') : 'None specified'}

### Code Diff
\`\`\`diff
${prDiff}
\`\`\`

## Review Instructions

### Step 1: Verify Each Acceptance Criterion
For EACH criterion: examine if code ACTUALLY satisfies it, compare to worker's claim.
Mark as VERIFIED, PARTIALLY_MET, or NOT_MET.

### Step 2: Standard Code Review
- Security vulnerabilities
- Error handling
- Code quality and readability
- Performance concerns

### Step 3: Decision
**CRITICAL**: If ANY criterion is NOT_MET, decision CANNOT be APPROVE.

## Required Output (JSON only, no markdown):

{
  "decision": "APPROVE" | "REQUEST_CHANGES" | "REJECT",
  "score": 0-100,
  "summary": "Brief overall assessment",
  "acceptance_criteria_verification": [
    {
      "id": "AC-001",
      "criterion": "description",
      "worker_claimed": "SATISFIED",
      "actual_status": "VERIFIED" | "PARTIALLY_MET" | "NOT_MET",
      "evidence": "where found",
      "discrepancy": null | "description of discrepancy"
    }
  ],
  "issues": [
    {
      "severity": "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION",
      "category": "security" | "error_handling" | "logic" | "quality" | "performance",
      "file": "path/to/file.js",
      "line": 42,
      "description": "What's wrong",
      "suggestion": "How to fix"
    }
  ],
  "tests_required": [],
  "blocking_issues_count": 0,
  "approval_blockers": []
}

Respond ONLY with valid JSON. No markdown, no explanation.
`;
}

// ============================================================================
// CRITERIA VERIFICATION
// ============================================================================

function verifyAcceptanceCriteria(review, ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const verification = review.acceptance_criteria_verification || [];
  
  const results = {
    total: criteria.length,
    verified: 0,
    partial: 0,
    not_met: 0,
    failed_ids: [],
    all_met: true
  };
  
  for (const criterion of criteria) {
    const v = verification.find(x => x.id === criterion.id);
    
    if (!v) {
      results.not_met++;
      results.failed_ids.push(criterion.id);
      results.all_met = false;
    } else if (v.actual_status === 'VERIFIED') {
      results.verified++;
    } else if (v.actual_status === 'PARTIALLY_MET') {
      results.partial++;
      results.failed_ids.push(criterion.id);
      results.all_met = false;
    } else {
      results.not_met++;
      results.failed_ids.push(criterion.id);
      results.all_met = false;
    }
  }
  
  return results;
}

function enforceDecisionRules(review, criteriaResults) {
  // Cannot approve if any criteria not met
  if (!criteriaResults.all_met && review.decision === 'APPROVE') {
    console.warn('[ReviewAgent] Override: APPROVE→REQUEST_CHANGES (criteria not met)');
    review.decision = 'REQUEST_CHANGES';
    review.approval_blockers = review.approval_blockers || [];
    review.approval_blockers.push(
      `${criteriaResults.failed_ids.length} criteria not satisfied: ${criteriaResults.failed_ids.join(', ')}`
    );
  }
  return review;
}


// ============================================================================
// HUMAN ASSIGNMENT
// ============================================================================

async function getDefaultAdmin() {
  const admin = db.prepare(
    'SELECT * FROM users WHERE role = ? AND is_human = 1 LIMIT 1'
  ).get('admin');
  
  if (!admin) {
    throw new Error('No admin user configured');
  }
  return admin;
}

async function assignToHuman(ticket, review, reason) {
  const admin = await getDefaultAdmin();
  
  // Update ticket
  db.prepare(`
    UPDATE tickets SET
      status = 'human_review',
      assigned_to = ?,
      assigned_type = 'human',
      human_required = 1,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(admin.id, ticket.id);
  
  console.log(`[ReviewAgent] Ticket ${ticket.id} assigned to human: ${reason}`);
  
  return { assigned_to: admin.id, reason };
}

// ============================================================================
// REVISION TICKET CREATION
// ============================================================================

function buildRevisionDescription(originalTicket, review) {
  const issues = review.issues || [];
  const blockers = review.approval_blockers || [];
  
  return `
## Revision Required

**Original Ticket**: ${originalTicket.id}
**Review Score**: ${review.score}/100
**Decision**: ${review.decision}

### Summary
${review.summary}

### Issues to Fix
${issues.filter(i => i.severity !== 'SUGGESTION').map(i => 
  `- [${i.severity}] ${i.file}:${i.line} - ${i.description}`
).join('\n') || 'None specified'}

### Blocking Issues
${blockers.map(b => `- ${b}`).join('\n') || 'None'}

### Original Description
${originalTicket.description}
`.trim();
}

async function createRevisionTicket(ticket, review) {
  const revisionNumber = (ticket.review_attempts || 0) + 1;
  const revisionId = `${ticket.id}-REV${revisionNumber}`;
  
  const revisionTicket = {
    id: revisionId,
    title: `[REVISION ${revisionNumber}] ${ticket.title}`,
    description: buildRevisionDescription(ticket, review),
    type: 'revision',
    parent_ticket_id: ticket.id,
    priority: Math.min((ticket.priority || 3) + 1, 5),
    status: 'pending',
    assigned_type: 'agent',
    human_required: 0,
    review_attempts: 0,
    acceptance_criteria: ticket.acceptance_criteria,
    file_hints: ticket.file_hints,
    repo_url: ticket.repo_url,
    branch_name: ticket.branch_name,
    project_id: ticket.project_id
  };
  
  // Insert revision ticket
  db.prepare(`
    INSERT INTO tickets (id, title, description, type, parent_ticket_id, priority, 
      status, assigned_type, human_required, review_attempts, acceptance_criteria,
      file_hints, repo_url, branch_name, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    revisionTicket.id, revisionTicket.title, revisionTicket.description,
    revisionTicket.type, revisionTicket.parent_ticket_id, revisionTicket.priority,
    revisionTicket.status, revisionTicket.assigned_type, revisionTicket.human_required,
    revisionTicket.review_attempts, revisionTicket.acceptance_criteria,
    revisionTicket.file_hints, revisionTicket.repo_url, revisionTicket.branch_name,
    revisionTicket.project_id
  );
  
  // Update original ticket
  db.prepare(`
    UPDATE tickets SET
      status = 'revision_pending',
      review_attempts = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(revisionNumber, ticket.id);
  
  console.log(`[ReviewAgent] Created revision ticket: ${revisionId}`);
  return revisionTicket;
}

// ============================================================================
// REVIEW HANDLING
// ============================================================================

async function handleFailedReview(ticket, review) {
  const maxAttempts = ticket.max_review_attempts || 3;
  const currentAttempts = (ticket.review_attempts || 0) + 1;
  
  // Check max attempts
  if (currentAttempts > maxAttempts) {
    return await assignToHuman(ticket, review, HUMAN_ASSIGNMENT_REASONS.MAX_ATTEMPTS_EXCEEDED);
  }
  
  // Check critical security
  const issues = review.issues || [];
  const hasCriticalSecurity = issues.some(i => 
    i.severity === 'CRITICAL' && i.category === 'security'
  );
  if (hasCriticalSecurity) {
    return await assignToHuman(ticket, review, HUMAN_ASSIGNMENT_REASONS.CRITICAL_SECURITY);
  }
  
  // Check low score
  if (review.score < 30) {
    return await assignToHuman(ticket, review, HUMAN_ASSIGNMENT_REASONS.LOW_SCORE);
  }
  
  // Create revision ticket
  return await createRevisionTicket(ticket, review);
}


// ============================================================================
// SAVE REVIEW
// ============================================================================

function saveReview(ticketId, review, criteriaResults) {
  const reviewId = generateId();
  
  db.prepare(`
    INSERT INTO reviews (id, ticket_id, pr_number, decision, score, summary,
      issues_json, criteria_verification, criteria_met, criteria_total, criteria_failed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reviewId,
    ticketId,
    review.pr_number || null,
    review.decision,
    review.score,
    review.summary,
    JSON.stringify(review.issues || []),
    JSON.stringify(review.acceptance_criteria_verification || []),
    criteriaResults.verified,
    criteriaResults.total,
    JSON.stringify(criteriaResults.failed_ids)
  );
  
  return reviewId;
}

// ============================================================================
// MAIN REVIEW FUNCTION
// ============================================================================

async function reviewPR(ticketId, prDiff) {
  console.log(`[ReviewAgent] Starting review for ticket: ${ticketId}`);
  
  // Get ticket
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }
  
  // Load persona
  const persona = await loadPersona();
  const model = getReviewModel(ticket.project_id);
  
  console.log(`[ReviewAgent] Using model: ${model}`);
  
  // Call Claude API
  const anthropic = new Anthropic();
  const prompt = buildReviewPrompt(prDiff, ticket);
  
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: CONFIG.MAX_TOKENS,
    system: persona,
    messages: [{ role: 'user', content: prompt }]
  });
  
  // Parse response
  const content = response.content[0].text;
  let review;
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    review = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[ReviewAgent] Failed to parse review:', err.message);
    review = {
      decision: 'REQUEST_CHANGES',
      score: 0,
      summary: 'Failed to parse review response',
      issues: [],
      acceptance_criteria_verification: [],
      approval_blockers: ['Review parsing failed - requires manual review']
    };
  }
  
  // Verify criteria
  const criteriaResults = verifyAcceptanceCriteria(review, ticket);
  
  // Enforce decision rules
  review = enforceDecisionRules(review, criteriaResults);
  
  // Save review
  const reviewId = saveReview(ticketId, review, criteriaResults);
  console.log(`[ReviewAgent] Review saved: ${reviewId}`);
  
  // Handle result
  if (review.decision === 'APPROVE') {
    // Update ticket status
    db.prepare(`
      UPDATE tickets SET status = 'approved', review_status = 'approved',
        review_score = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(review.score, ticketId);
    
    console.log(`[ReviewAgent] Ticket ${ticketId} APPROVED (score: ${review.score})`);
    return { status: 'approved', review, reviewId };
  } else {
    // Handle failed review
    const result = await handleFailedReview(ticket, review);
    return { status: review.decision.toLowerCase(), review, reviewId, ...result };
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: review-agent.js <ticket_id> <diff_file>');
    console.log('       review-agent.js --ticket <ticket_id> --diff <diff_file>');
    process.exit(1);
  }
  
  let ticketId, diffFile;
  
  if (args[0] === '--ticket') {
    ticketId = args[1];
    diffFile = args[3];
  } else {
    ticketId = args[0];
    diffFile = args[1];
  }
  
  // Initialize
  initDb();
  
  // Read diff
  let prDiff;
  if (diffFile === '-') {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    prDiff = Buffer.concat(chunks).toString('utf8');
  } else {
    prDiff = await fs.readFile(diffFile, 'utf8');
  }
  
  // Run review
  try {
    const result = await reviewPR(ticketId, prDiff);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'approved' ? 0 : 1);
  } catch (err) {
    console.error('[ReviewAgent] Error:', err.message);
    process.exit(2);
  }
}

// Export for module use
module.exports = { reviewPR, initDb };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
