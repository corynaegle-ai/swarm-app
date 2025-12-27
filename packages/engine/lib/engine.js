/**
 * Swarm Execution Engine
 * Main orchestration loop that connects VM spawning, agent registry,
 * workflow definitions, and ticket system into a functioning system.
 */
import pg from 'pg';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { VMPool } from './vm-pool.js';
import { ArtifactStore } from './artifact-store.js';
import { StepExecutor } from './executor.js';
import { WorkflowDispatcher } from './dispatcher.js';
import { verify, formatFeedbackForRetry, isVerifierHealthy, MAX_ATTEMPTS } from './verifier-client.js';

// Engine states
const ENGINE_STATE = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
};

const PID_FILE = '/var/run/swarm-engine.pid';
const LOG_DIR = '/var/log/swarm';

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {
    // Prepare for permission issues in dev
  }
}

/**
 * Log with timestamp
 */
function log(level, message, toFile = true) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;

  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }

  if (toFile) {
    try {
      const logFile = join(LOG_DIR, 'engine.log');
      writeFileSync(logFile, line + '\n', { flag: 'a' });
    } catch (e) {
      // Ignore file write errors
    }
  }
}

export class SwarmEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxConcurrentVMs: config.maxVMs || 10,
      pollIntervalMs: config.pollInterval || 5000,
      ticketTimeoutMs: config.ticketTimeout || 300000,   // 5 min default
      vmBootTimeoutMs: config.vmBootTimeout || 30000, // 30s
      backoffMultiplier: config.backoffMultiplier || 1.5,
      maxBackoffMs: config.maxBackoff || 60000,
      // Postgres config
      dbHost: process.env.PG_HOST || 'localhost',
      dbPort: process.env.PG_PORT || 5432,
      dbUser: process.env.PG_USER || 'swarm',
      dbPassword: process.env.PG_PASSWORD || 'swarm_dev_2024',
      dbName: process.env.PG_DATABASE || 'swarmdb',
      ...config
    };

    // State tracking
    this.state = ENGINE_STATE.STOPPED;
    this.currentBackoff = this.config.pollIntervalMs;
    this.activeExecutions = new Map();
    this.stats = {
      ticketsProcessed: 0,
      ticketsSucceeded: 0,
      ticketsFailed: 0,
      totalVmTime: 0,
      startedAt: null
    };

    // Components
    this.pool = null; // Postgres connection pool
    this.vmPool = null;
    this.artifactStore = null;

    // Control
    this.pollTimer = null;
    this.shuttingDown = false;
  }

  /**
   * Initialize engine components
   */
  async init() {
    log('INFO', 'Initializing Swarm Engine...');

    // Initialize Postgres Pool
    this.pool = new pg.Pool({
      host: this.config.dbHost,
      port: this.config.dbPort,
      user: this.config.dbUser,
      password: this.config.dbPassword,
      database: this.config.dbName,
      max: 10 // Connection pool size
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      log('INFO', 'Connected to PostgreSQL swarmdb');
      client.release();
    } catch (err) {
      log('ERROR', `Failed to connect to PostgreSQL: ${err.message}`);
      throw err;
    }

    // Initialize VM Pool
    this.vmPool = new VMPool({
      maxVMs: this.config.maxConcurrentVMs,
      vmTimeout: this.config.vmBootTimeoutMs
    });
    await this.vmPool.init();

    // Initialize Artifact Store (share the pool)
    this.artifactStore = new ArtifactStore({ pool: this.pool });
    this.artifactStore.init(); // Creates tables if needed

    // Ensure schema additions (if any extra needed by engine)
    await this.ensureSchema();

    log('INFO', 'Engine initialized');
    this.emit('init');
  }

  async ensureSchema() {
    // Ensure execution_artifacts table logic is covered by ArtifactStore
    // Ensure vm_assignments table logic is covered by ArtifactStore
    // ensure we have any other tables we need?
    // verify agent_definitions exists?
  }

  async start() {
    if (this.state === ENGINE_STATE.RUNNING) {
      log('WARN', 'Engine already running');
      return;
    }

    this.state = ENGINE_STATE.RUNNING;
    this.shuttingDown = false;
    this.stats.startedAt = new Date();

    try {
      writeFileSync(PID_FILE, process.pid.toString());
      log('INFO', `Engine started (PID ${process.pid})`);
    } catch (e) {
      log('WARN', `Could not write PID file: ${e.message}`);
    }

    this._setupSignalHandlers();
    await this._pollLoop();
  }

  async stop() {
    if (this.state !== ENGINE_STATE.RUNNING) return;

    log('INFO', 'Initiating graceful shutdown...');
    this.shuttingDown = true;
    this.state = ENGINE_STATE.STOPPING;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const shutdownTimeout = 60000;
    const start = Date.now();

    while (this.activeExecutions.size > 0 && (Date.now() - start) < shutdownTimeout) {
      log('INFO', `Waiting for ${this.activeExecutions.size} active executions...`);
      await new Promise(r => setTimeout(r, 2000));
    }

    if (this.activeExecutions.size > 0) {
      for (const [ticketId, exec] of this.activeExecutions) {
        await this._releaseExecution(ticketId, exec, 'Shutdown forced');
      }
    }

    this.state = ENGINE_STATE.STOPPED;
    await this.pool.end();
    log('INFO', 'Engine stopped');
  }

  _setupSignalHandlers() {
    const shutdown = async (signal) => {
      log('INFO', `Received ${signal}`);
      await this.stop();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async _pollLoop() {
    while (this.state === ENGINE_STATE.RUNNING && !this.shuttingDown) {
      try {
        const processed = await this._pollOnce();
        if (processed > 0) {
          this.currentBackoff = this.config.pollIntervalMs;
        } else {
          this.currentBackoff = Math.min(this.currentBackoff * 1.5, this.config.maxBackoffMs);
        }
      } catch (e) {
        log('ERROR', `Poll error: ${e.message}`);
        this.currentBackoff = this.config.maxBackoffMs;
      }

      if (this.state === ENGINE_STATE.RUNNING && !this.shuttingDown) {
        await new Promise(r => {
          this.pollTimer = setTimeout(r, this.currentBackoff);
        });
      }
    }
  }

  async _pollOnce() {
    const activeCount = this.activeExecutions.size;
    const available = this.config.maxConcurrentVMs - activeCount;

    if (available <= 0) return 0;

    // Get ready tickets
    // Postgres: use $1 for params
    const res = await this.pool.query(`
            SELECT * FROM tickets 
            WHERE state = 'ready' 
              AND assignee_id IS NOT NULL
              AND assignee_type = 'agent'
              AND vm_id IS NULL
            ORDER BY created_at ASC
            LIMIT $1
        `, [available]);

    const tickets = res.rows;

    if (tickets.length === 0) return 0;

    log('INFO', `Found ${tickets.length} ready tickets (capacity: ${available})`);

    let dispatched = 0;
    for (const ticket of tickets) {
      if (this.shuttingDown) break;
      try {
        await this.executeTicket(ticket);
        dispatched++;
      } catch (e) {
        log('ERROR', `Failed to dispatch ticket ${ticket.id}: ${e.message}`);
      }
    }
    return dispatched;
  }

  async executeTicket(ticket) {
    const ticketId = ticket.id.toString();
    log('INFO', `Dispatching ticket ${ticketId}: ${ticket.title}`);

    let inputs = {};
    try {
      inputs = ticket.inputs ? (typeof ticket.inputs === 'string' ? JSON.parse(ticket.inputs) : ticket.inputs) : {};
    } catch (e) {
      inputs = {};
    }

    const runId = randomUUID();
    const executor = new StepExecutor(runId, {
      pool: this.pool, // Pass pool
      useVm: true,
      vmTimeout: this.config.ticketTimeoutMs,
      skipStepLogging: true
    });

    // Use placeholder vmId = 0 initially
    const vmId = 0;

    // Claim ticket atomically
    // Postgres: UPDATE ... RETURNING id
    const claimRes = await this.pool.query(`
            UPDATE tickets 
            SET state = 'in_progress', vm_id = $1, started_at = NOW(), updated_at = NOW()
            WHERE id = $2 AND state = 'ready' AND vm_id IS NULL
            RETURNING id
        `, [vmId, ticketId]);

    if (claimRes.rowCount === 0) {
      log('WARN', `Ticket ${ticketId} already claimed`);
      return;
    }

    // Track assignment
    // Insert into vm_assignments
    await this.pool.query(`
            INSERT INTO vm_assignments (vm_id, ticket_id, assigned_at, status)
            VALUES ($1, $2, NOW(), 'running')
            ON CONFLICT (vm_id) DO UPDATE SET 
              ticket_id = EXCLUDED.ticket_id,
              assigned_at = NOW(),
              status = 'running'
        `, [vmId, ticketId]);

    this.activeExecutions.set(ticketId, {
      vmId,
      executor,
      startTime: Date.now(),
      runId
    });

    this._executeAsync(ticket, executor, vmId, inputs).catch(e => {
      log('ERROR', `Async execution error for ticket ${ticketId}: ${e.message}`);
    });
  }

  async _executeAsync(ticket, executor, vmId, inputs) {
    const ticketId = ticket.id.toString();
    const startTime = Date.now();
    let attemptNumber = (ticket.rejection_count || 0) + 1;
    let verificationFeedback = null;

    try {
      let result;
      let verificationResult = null;

      while (attemptNumber <= MAX_ATTEMPTS) {
        log('INFO', `Ticket ${ticketId} - Attempt ${attemptNumber}/${MAX_ATTEMPTS}`);

        if (ticket.execution_mode === 'workflow' && ticket.workflow_id) {
          const dispatcher = new WorkflowDispatcher({ useVm: true, pool: this.pool });
          try {
            const workflowInputs = { ...inputs, ticket, projectSettings: {} };
            if (verificationFeedback) workflowInputs.verification_feedback = verificationFeedback;

            const workflowResult = await dispatcher.runWorkflowForTicket(ticket.workflow_id, ticketId, workflowInputs);
            result = {
              status: workflowResult.status,
              runId: workflowResult.runId,
              outputs: workflowResult.results,
              error: workflowResult.error
            };
          } finally {
            // dispatcher.close() ?
          }
        } else if (ticket.assignee_type === 'agent' && ticket.assignee_id) {
          // Get agent from Postgres
          const agentRes = await this.pool.query(`
                        SELECT * FROM agent_definitions WHERE id = $1 OR name = $1
                     `, [ticket.assignee_id]);

          const agent = agentRes.rows[0];
          if (!agent) throw new Error(`Agent not found: ${ticket.assignee_id}`);

          const agentInputs = { ...inputs, ticket, projectSettings: {} };
          if (verificationFeedback) agentInputs.verification_feedback = verificationFeedback;

          result = await executor.executeStep({
            id: ticketId,
            agent: agent.name,
            agent_version: agent.version,
            inputs: agentInputs
          }, { trigger: inputs });
        } else {
          throw new Error('Ticket has no valid execution mode');
        }

        // Verification Phase
        if (ticket.branch_name) {
          await this.pool.query(`UPDATE tickets SET state = 'verifying', updated_at = NOW() WHERE id = $1`, [ticketId]);
          log('INFO', `Ticket ${ticketId} - Running verification...`);

          let acceptanceCriteria = null;
          if (ticket.acceptance_criteria) {
            try {
              acceptanceCriteria = (typeof ticket.acceptance_criteria === 'string')
                ? JSON.parse(ticket.acceptance_criteria)
                : ticket.acceptance_criteria;
            } catch (e) {
              log('WARN', `Could not parse acceptance_criteria: ${e.message}`);
            }
          }

          const repoUrl = inputs.repoUrl || ticket.repo_url || (inputs.projectSettings?.repoUrl);
          if (!repoUrl) {
            verificationResult = { status: 'skipped', ready_for_pr: true };
          } else {
            verificationResult = await verify({
              ticketId,
              branchName: ticket.branch_name,
              repoUrl,
              attempt: attemptNumber,
              acceptanceCriteria,
              phases: ['static', 'automated', 'sentinel']
            });
          }

          await this.pool.query(`
                        UPDATE tickets SET verification_status = $1, verification_evidence = $2, updated_at = NOW() WHERE id = $3
                     `, [verificationResult.status, JSON.stringify(verificationResult), ticketId]);

          if (verificationResult.status === 'passed' || verificationResult.ready_for_pr) {
            log('INFO', `Ticket ${ticketId} - Verification PASSED`);
            break;
          } else {
            log('WARN', `Ticket ${ticketId} - Verification FAILED`);
            verificationFeedback = formatFeedbackForRetry(verificationResult.feedback_for_agent);
            await this.pool.query(`UPDATE tickets SET rejection_count = rejection_count + 1, updated_at = NOW() WHERE id = $1`, [ticketId]);
            attemptNumber++;

            if (attemptNumber > MAX_ATTEMPTS) {
              const blockReason = `Verification failed ${MAX_ATTEMPTS} times.`;
              await this.pool.query(`
                                  UPDATE tickets SET state = 'blocked', vm_id = NULL, verification_status = 'failed', error = $1, updated_at = NOW() WHERE id = $2
                               `, [blockReason, ticketId]);

              this.artifactStore.storeArtifact({
                ticketId,
                type: 'verification_blocked',
                content: JSON.stringify(verificationResult)
              });
              return;
            }
          }
        } else {
          verificationResult = { status: 'skipped', ready_for_pr: false };
          break;
        }
      } // end while

      const duration = Date.now() - startTime;
      log('INFO', `Ticket ${ticketId} completed in ${duration}ms`);

      const outputJson = JSON.stringify({ ...result, verification: verificationResult });

      await this.pool.query(`
                UPDATE tickets SET state = 'done', vm_id = NULL, completed_at = NOW(), outputs = $1, updated_at = NOW() WHERE id = $2
             `, [outputJson, ticketId]);

      if (result?.stdout) this.artifactStore.storeArtifact({ ticketId, type: 'stdout', content: result.stdout });
      if (result?.stderr) this.artifactStore.storeArtifact({ ticketId, type: 'stderr', content: result.stderr });

    } catch (e) {
      const duration = Date.now() - startTime;
      log('ERROR', `Ticket ${ticketId} failed: ${e.message}`);

      await this.pool.query(`
                UPDATE tickets SET state = 'cancelled', vm_id = NULL, completed_at = NOW(), error = $1, updated_at = NOW() WHERE id = $2
            `, [e.message, ticketId]);

      this.artifactStore.storeArtifact({ ticketId, type: 'error', content: e.stack || e.message });
    } finally {
      await this._releaseExecution(ticketId, this.activeExecutions.get(ticketId));
    }
  }

  async _releaseExecution(ticketId, exec, reason = null) {
    if (!exec) return;
    try {
      await this.pool.query(`DELETE FROM vm_assignments WHERE vm_id = $1`, [exec.vmId]);
    } catch (e) {
      log('WARN', `Error releasing VM: ${e.message}`);
    }
    this.activeExecutions.delete(ticketId);
    if (reason) {
      await this.pool.query(`UPDATE tickets SET state = 'cancelled', error = $1 WHERE id = $2`, [reason, ticketId]);
    }
  }
}
