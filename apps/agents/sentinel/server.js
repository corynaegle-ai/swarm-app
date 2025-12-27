/**
 * Swarm Verifier Service
 * Unified verification for Swarm worker agents
 * 
 * Phases:
 * - static: lint, syntax, type checks
 * - automated: acceptance criteria checks (file, http, test, pattern)
 * - sentinel: LLM code review (Phase 5, not implemented yet)
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const git = require('./lib/git');
const staticPhase = require('./lib/phases/static');
const automatedPhase = require('./lib/phases/automated');
const reporter = require('./lib/reporter');
const sentinelPhase = require("./lib/phases/sentinel");
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Ensure repos directory exists
if (!fs.existsSync(config.REPOS_BASE_PATH)) {
  fs.mkdirSync(config.REPOS_BASE_PATH, { recursive: true });
}

// Initialize database connection
let db;
try {
  db = new Database(config.DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  console.log("Database connected with WAL mode, busy_timeout=5000ms");
  initDb();
} catch (err) {
  console.error('Failed to connect to database:', err.message);
  console.log('Running without database persistence');
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_attempts (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      branch_name TEXT NOT NULL,
      commit_sha TEXT,
      status TEXT NOT NULL,
      failed_phase TEXT,
      duration_ms INTEGER,
      static_result TEXT,
      automated_result TEXT,
      sentinel_result TEXT,
      sentinel_decision TEXT,
      sentinel_score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_verify_ticket ON verification_attempts(ticket_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_verify_status ON verification_attempts(status)`);
  console.log('Database initialized');
}


// ============================================================================
// ROUTES
// ============================================================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'swarm-verifier',
    uptime_seconds: Math.floor(process.uptime())
  });
});

/**
 * Metrics endpoint
 */
app.get('/metrics', (req, res) => {
  if (!db) {
    return res.json({ error: 'Database not available', metrics: null });
  }

  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration_ms
      FROM verification_attempts
      WHERE created_at > datetime('now', '-24 hours')
    `).get();

    const phaseStats = db.prepare(`
      SELECT 
        failed_phase,
        COUNT(*) as count
      FROM verification_attempts
      WHERE status = 'failed' AND created_at > datetime('now', '-24 hours')
      GROUP BY failed_phase
    `).all();

    res.json({
      verifications_total: stats.total || 0,
      verifications_passed: stats.passed || 0,
      verifications_failed: stats.failed || 0,
      pass_rate: stats.total ? (stats.passed / stats.total).toFixed(3) : 0,
      avg_duration_ms: Math.round(stats.avg_duration_ms || 0),
      failures_by_phase: phaseStats.reduce((acc, p) => {
        acc[p.failed_phase || 'unknown'] = p.count;
        return acc;
      }, {})
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * Main verification endpoint
 * POST /verify
 */
app.post('/verify', async (req, res) => {
  const startTime = Date.now();
  const { ticket_id, branch_name, repo_url, phases, attempt, acceptance_criteria: reqCriteria } = req.body;

  // Validate required fields
  if (!ticket_id || !branch_name || !repo_url) {
    return res.status(400).json({
      error: 'Missing required fields: ticket_id, branch_name, repo_url'
    });
  }

  // Default phases if not specified
  const phasesToRun = phases || ['static', 'automated'];
  const attemptNum = attempt || 1;
  const agentId = config.AGENT_ID;

  console.log(`[${ticket_id}] Starting verification (attempt ${attemptNum})`);
  logActivity(ticket_id, 'verification_started', `Started verification (Attempt ${attemptNum})`, { branch: branch_name, phases: phasesToRun });

  console.log(`[${ticket_id}] Branch: ${branch_name}`);
  console.log(`[${ticket_id}] Phases: ${phasesToRun.join(', ')}`);

  const result = {
    ticket_id,
    status: 'pending',
    phases_completed: [],
    duration_ms: 0,
    results: {},
    ready_for_pr: false,
    feedback_for_agent: []
  };

  let repoPath = null;

  try {
    // Clone/update repository
    console.log(`[${ticket_id}] Cloning repository...`);
    repoPath = await git.cloneOrUpdate(repo_url, ticket_id, branch_name);
    console.log(`[${ticket_id}] Repository ready at ${repoPath}`);

    // Get commit SHA
    const commitSha = await git.getCurrentCommit(repoPath);
    result.commit_sha = commitSha;


    // Fetch acceptance criteria from ticket API (or use provided criteria)
    let acceptanceCriteria = reqCriteria || null;
    if (!acceptanceCriteria) {
      try {
        const ticketRes = await fetch(`${config.TICKET_API_URL}/api/tickets/${ticket_id}`);
        if (ticketRes.ok) {
          const ticket = await ticketRes.json();
          acceptanceCriteria = ticket.acceptance_criteria;
        }
      } catch (err) {
        console.log(`[${ticket_id}] Could not fetch ticket: ${err.message}`);
      }
    }

    // PHASE 0: Static Analysis
    if (phasesToRun.includes('static')) {
      console.log(`[${ticket_id}] Running static phase...`);
      const staticResult = await staticPhase.run(repoPath, ticket_id);
      result.results.static = staticResult;

      if (staticResult.status === 'failed') {
        result.status = 'failed';
        result.failed_phase = 'static';
        result.feedback_for_agent = reporter.formatFeedback(staticResult.checks);
        result.duration_ms = Date.now() - startTime;

        logVerification(db, ticket_id, attemptNum, branch_name, commitSha, result);
        logActivity(ticket_id, 'verification_failed', 'Static analysis failed', { phase: 'static', errors: staticResult.checks.filter(c => !c.passed).length });
        return res.json(result);
      }

      result.phases_completed.push('static');
      logActivity(ticket_id, 'verification_phase', 'Static analysis passed', { phase: 'static' });
      console.log(`[${ticket_id}] Static phase passed`);
    }

    // PHASE 1: Automated Checks
    if (phasesToRun.includes('automated')) {
      console.log(`[${ticket_id}] Running automated phase...`);
      const automatedResult = await automatedPhase.run(
        repoPath,
        ticket_id,
        acceptanceCriteria
      );
      result.results.automated = automatedResult;


      if (automatedResult.status === 'failed') {
        result.status = 'failed';
        result.failed_phase = 'automated';
        result.feedback_for_agent = reporter.formatFeedback(automatedResult.checks);
        result.duration_ms = Date.now() - startTime;

        logVerification(db, ticket_id, attemptNum, branch_name, commitSha, result);
        logActivity(ticket_id, 'verification_failed', 'Automated checks failed', { phase: 'automated', errors: automatedResult.checks.filter(c => !c.passed).length });
        return res.json(result);
      }

      result.phases_completed.push('automated');
      logActivity(ticket_id, 'verification_phase', 'Automated checks passed', { phase: 'automated' });
      console.log(`[${ticket_id}] Automated phase passed`);
    }

    // PHASE 2: SENTINEL LLM Review
    if (phasesToRun.includes('sentinel')) {
      console.log(`[${ticket_id}] Running SENTINEL phase...`);
      const sentinelResult = await sentinelPhase.run(
        repoPath,
        ticket_id,
        'main',  // base branch
        acceptanceCriteria
      );
      result.results.sentinel = sentinelResult;

      if (sentinelResult.status === 'failed') {
        result.status = 'failed';
        result.failed_phase = 'sentinel';
        result.sentinel_decision = sentinelResult.decision;
        result.sentinel_score = sentinelResult.score;

        // Build feedback from sentinel issues
        const sentinelFeedback = [];
        for (const issue of sentinelResult.issues?.critical || []) {
          sentinelFeedback.push(`CRITICAL [${issue.file}:${issue.line}]: ${issue.issue}`);
        }
        for (const issue of sentinelResult.issues?.major || []) {
          sentinelFeedback.push(`MAJOR [${issue.file}:${issue.line}]: ${issue.issue}`);
        }
        result.feedback_for_agent = [...result.feedback_for_agent, ...sentinelFeedback];
        result.duration_ms = Date.now() - startTime;

        logVerification(db, ticket_id, attemptNum, branch_name, commitSha, result);
        logActivity(ticket_id, 'verification_failed', 'Sentinel AI review failed', {
          phase: 'sentinel',
          decision: sentinelResult.decision,
          score: sentinelResult.score
        });
        return res.json(result);
      }

      result.phases_completed.push('sentinel');
      result.sentinel_decision = sentinelResult.decision;
      result.sentinel_score = sentinelResult.score;
      logActivity(ticket_id, 'verification_phase', `Sentinel review passed (${sentinelResult.score}/100)`, { phase: 'sentinel', decision: sentinelResult.decision });
      console.log(`[${ticket_id}] SENTINEL phase: ${sentinelResult.decision} (${sentinelResult.score}/100)`);
    }

    // All phases passed
    result.status = 'passed';
    result.ready_for_pr = true;
    result.duration_ms = Date.now() - startTime;

    logVerification(db, ticket_id, attemptNum, branch_name, commitSha, result);
    logActivity(ticket_id, 'verification_passed', 'All verification phases passed', { duration_ms: result.duration_ms });

    console.log(`[${ticket_id}] ✅ Verification passed in ${result.duration_ms}ms`);
    res.json(result);

  } catch (err) {
    console.error(`[${ticket_id}] Verification error:`, err);
    result.status = 'error';
    result.error = err.message;
    result.duration_ms = Date.now() - startTime;

    logVerification(db, ticket_id, attemptNum, branch_name, null, result);
    logActivity(ticket_id, 'verification_error', `Verification process error: ${err.message}`, { error: err.message });
    res.status(500).json(result);
  }
});


/**
 * Get verification history for a ticket
 */
app.get('/verify/:ticket_id/history', (req, res) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { ticket_id } = req.params;

  try {
    const attempts = db.prepare(`
      SELECT 
        attempt_number as attempt,
        created_at as timestamp,
        status,
        failed_phase,
        duration_ms,
        commit_sha
      FROM verification_attempts
      WHERE ticket_id = ?
      ORDER BY attempt_number ASC
    `).all(ticket_id);

    res.json({
      ticket_id,
      attempts,
      total_attempts: attempts.length,
      final_status: attempts.length > 0 ? attempts[attempts.length - 1].status : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Log verification attempt to database
 */
function logVerification(db, ticketId, attempt, branch, commitSha, result) {
  if (!db) return;

  try {
    const id = `${ticketId}-${attempt}-${Date.now()}`;
    db.prepare(`
      INSERT INTO verification_attempts 
      (id, ticket_id, attempt_number, branch_name, commit_sha, status, failed_phase, duration_ms, static_result, automated_result, sentinel_result, sentinel_decision, sentinel_score, feedback_for_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      ticketId,
      attempt,
      branch,
      commitSha,
      result.status,
      result.failed_phase || null,
      result.duration_ms,
      JSON.stringify(result.results?.static || null),
      JSON.stringify(result.results?.automated || null),
      JSON.stringify(result.results?.sentinel || null),
      result.sentinel_decision || null,
      result.sentinel_score || null,
      result.feedback_for_agent && result.feedback_for_agent.length > 0
        ? JSON.stringify(result.feedback_for_agent)
        : null
    );
  } catch (err) {
    console.error('Failed to log verification:', err.message);
  }
}

/**
 * Log activity to Platform API
 */
async function logActivity(ticketId, category, message, metadata = {}) {
  try {
    const response = await fetch(`${config.TICKET_API_URL}/api/tickets/${ticketId}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': config.AGENT_SERVICE_KEY
      },
      body: JSON.stringify({
        agent_id: config.AGENT_ID,
        category,
        message,
        metadata
      })
    });

    if (!response.ok) {
      console.warn(`Failed to log activity: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.warn(`Failed to log activity: ${err.message}`);
  }
}

// ============================================================================
// START SERVER
// ============================================================================

app.listen(config.PORT, () => {
  console.log(`Swarm Verifier running on port ${config.PORT}`);
  console.log(`Repos directory: ${config.REPOS_BASE_PATH}`);
  console.log(`Database: ${config.DB_PATH}`);
});
