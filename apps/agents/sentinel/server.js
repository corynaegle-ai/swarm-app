/**
 * Swarm Verifier Service
 * Unified verification for Swarm worker agents
 * 
 * Phases:
 * - static: lint, syntax, type checks
 * - automated: acceptance criteria checks (file, http, test, pattern)
 * - sentinel: LLM code review (Phase 5, not implemented yet)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
let config;
try {
  config = require('./config');
} catch (e) {
  console.warn('Failed to load ./config, using defaults:', e.message);
  config = {
    PORT: 3006,
    REPOS_BASE_PATH: '/tmp/swarm-sentinel-repos',
    // DB_PATH removed, using PG credentials instead
    AGENT_ID: 'sentinel-agent-01',
    TICKET_API_URL: 'http://localhost:3002',
    AGENT_SERVICE_KEY: 'agent-internal-key-dev',
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    PG_HOST: process.env.PG_HOST || 'localhost',
    PG_PORT: process.env.PG_PORT || 5432,
    PG_USER: process.env.PG_USER || 'swarm',
    PG_PASSWORD: process.env.PG_PASSWORD || 'swarm_dev_2024',
    PG_DB: process.env.PG_DB || 'swarmdb'
  };
}
const git = require('./lib/git');
const staticPhase = require('./lib/phases/static');
const automatedPhase = require('./lib/phases/automated');
const reporter = require('./lib/reporter');
const sentinelPhase = require("./lib/phases/sentinel");
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
const pool = new Pool({
  host: config.PG_HOST,
  port: config.PG_PORT,
  user: config.PG_USER,
  password: config.PG_PASSWORD,
  database: config.PG_DB,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function initDb() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS verification_attempts (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          attempt_number INTEGER NOT NULL,
          branch_name TEXT NOT NULL,
          commit_sha TEXT,
          status TEXT NOT NULL,
          failed_phase TEXT,
          duration_ms INTEGER,
          static_result JSONB,
          automated_result JSONB,
          sentinel_result JSONB,
          sentinel_decision TEXT,
          sentinel_score INTEGER,
          feedback_for_agent JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_verify_ticket ON verification_attempts(ticket_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_verify_status ON verification_attempts(status)`);
      console.log('Database initialized (PostgreSQL)');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
  }
}

// Start DB init
initDb();


// ============================================================================
// ROUTES
// ============================================================================

/**
 * Health check
 */
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'healthy',
    service: 'swarm-verifier',
    database: dbStatus,
    uptime_seconds: Math.floor(process.uptime())
  });
});

/**
 * Metrics endpoint
 */
app.get('/metrics', async (req, res) => {
  try {
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration_ms
      FROM verification_attempts
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const stats = statsRes.rows[0];

    const phaseStatsRes = await pool.query(`
      SELECT 
        failed_phase,
        COUNT(*) as count
      FROM verification_attempts
      WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY failed_phase
    `);

    // Postgres returns counts as strings sometimes, convert to number
    const total = parseInt(stats.total || 0);
    const passed = parseInt(stats.passed || 0);
    const failed = parseInt(stats.failed || 0);

    res.json({
      verifications_total: total,
      verifications_passed: passed,
      verifications_failed: failed,
      pass_rate: total ? (passed / total).toFixed(3) : 0,
      avg_duration_ms: Math.round(stats.avg_duration_ms || 0),
      failures_by_phase: phaseStatsRes.rows.reduce((acc, p) => {
        acc[p.failed_phase || 'unknown'] = parseInt(p.count);
        return acc;
      }, {})
    });
  } catch (err) {
    console.error('Metrics error:', err);
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
  let commitSha = null;

  try {
    // Clone/update repository
    console.log(`[${ticket_id}] Cloning repository...`);
    repoPath = await git.cloneOrUpdate(repo_url, ticket_id, branch_name);
    console.log(`[${ticket_id}] Repository ready at ${repoPath}`);

    // Get commit SHA
    commitSha = await git.getCurrentCommit(repoPath);
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

        await logVerification(pool, ticket_id, attemptNum, branch_name, commitSha, result);
        logActivity(ticket_id, 'verification_failed', 'Static analysis failed', {
          phase: 'static',
          errors: staticResult.checks.filter(c => !c.passed).length,
          status: 'failure',
          feedback_for_agent: result.feedback_for_agent
        });
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

        await logVerification(pool, ticket_id, attemptNum, branch_name, commitSha, result);
        logActivity(ticket_id, 'verification_failed', 'Automated checks failed', {
          phase: 'automated',
          errors: automatedResult.checks.filter(c => !c.passed).length,
          status: 'failure',
          feedback_for_agent: result.feedback_for_agent
        });
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

        await logVerification(pool, ticket_id, attemptNum, branch_name, commitSha, result);
        logActivity(ticket_id, 'verification_failed', 'Sentinel AI review failed', {
          phase: 'sentinel',
          decision: sentinelResult.decision,
          score: sentinelResult.score,
          status: 'failure',
          feedback_for_agent: result.feedback_for_agent
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

    await logVerification(pool, ticket_id, attemptNum, branch_name, commitSha, result);
    logActivity(ticket_id, 'verification_passed', 'All verification phases passed', {
      duration_ms: result.duration_ms,
      status: 'success'
    });

    console.log(`[${ticket_id}] ✅ Verification passed in ${result.duration_ms}ms`);
    res.json(result);

  } catch (err) {
    console.error(`[${ticket_id}] Verification error:`, err);
    result.status = 'error';
    result.error = err.message;
    result.duration_ms = Date.now() - startTime;

    await logVerification(pool, ticket_id, attemptNum, branch_name, commitSha || null, result);
    logActivity(ticket_id, 'verification_error', `Verification process error: ${err.message}`, {
      error: err.message,
      status: 'error'
    });
    res.status(500).json(result);
  }
});


/**
 * Get verification history for a ticket
 */
app.get('/verify/:ticket_id/history', async (req, res) => {
  const { ticket_id } = req.params;

  try {
    const attemptsRes = await pool.query(`
      SELECT 
        attempt_number as attempt,
        created_at as timestamp,
        status,
        failed_phase,
        duration_ms,
        commit_sha
      FROM verification_attempts
      WHERE ticket_id = $1
      ORDER BY attempt_number ASC
    `, [ticket_id]);

    const attempts = attemptsRes.rows;

    res.json({
      ticket_id,
      attempts,
      total_attempts: attempts.length,
      final_status: attempts.length > 0 ? attempts[attempts.length - 1].status : null
    });
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Log verification attempt to database
 */
async function logVerification(pool, ticketId, attempt, branch, commitSha, result) {
  try {
    const id = `${ticketId}-${attempt}-${Date.now()}`;
    await pool.query(`
      INSERT INTO verification_attempts 
      (id, ticket_id, attempt_number, branch_name, commit_sha, status, failed_phase, duration_ms, static_result, automated_result, sentinel_result, sentinel_decision, sentinel_score, feedback_for_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
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
    ]);
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
  // Removed DB_PATH log
});
