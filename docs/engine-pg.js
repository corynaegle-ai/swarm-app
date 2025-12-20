/**
 * Swarm Execution Engine (PostgreSQL Version)
 * Main orchestration loop that polls tickets and dispatches to VMs
 * 
 * Architecture:
 *   Engine (this) → Dispatcher → Executor → VM
 *   
 * Responsibilities:
 *   - Poll PostgreSQL for ready tickets
 *   - Dispatch execution to VMs via StepExecutor
 *   - Collect results and update ticket status
 *   - Manage concurrency limits
 *   - Handle graceful shutdown
 * 
 * Migration: 2024-12-18 - Converted from SQLite to PostgreSQL
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import Database from 'better-sqlite3';
import { StepExecutor } from './executor.js';
import { WorkflowDispatcher } from './dispatcher.js';
import { verify, formatFeedbackForRetry, MAX_ATTEMPTS, isVerifierHealthy } from './verifier-client.js';
import { execSync } from 'child_process';

const { Pool } = pg;

// Database paths - Registry remains SQLite, Tickets migrated to PostgreSQL
const REGISTRY_DB = '/opt/swarm-registry/registry.db';
const PID_FILE = '/var/run/swarm-engine.pid';
const LOG_DIR = '/var/log/swarm';

// PostgreSQL connection config
const PG_CONFIG = {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'swarmdb',
    user: process.env.PG_USER || 'swarm',
    password: process.env.PG_PASSWORD || 'swarm_dev_2024',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log with timestamp to stdout and optionally to file
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

export class SwarmEngine {
    constructor(config = {}) {
        this.maxConcurrentVMs = config.maxVMs || 10;
        this.pollIntervalMs = config.pollInterval || 5000;
        this.ticketTimeoutMs = config.ticketTimeout || 300000; // 5 min default
        this.backoffMaxMs = config.backoffMax || 30000;
        
        // PostgreSQL pool for tickets
        this.pgPool = new Pool(PG_CONFIG);
        this.pgPool.on('connect', () => log('DEBUG', 'PostgreSQL client connected'));
        this.pgPool.on('error', (err) => log('ERROR', `PostgreSQL pool error: ${err.message}`));
        
        // SQLite for registry (remains unchanged)
        this.registryDb = new Database(REGISTRY_DB);
        this.registryDb.pragma("journal_mode = WAL");
        this.registryDb.pragma("busy_timeout = 5000");
        
        // Runtime state
        this.running = false;
        this.shuttingDown = false;
        this.activeExecutions = new Map(); // ticketId → { vmId, startTime, executor }
        this.pollTimer = null;
        this.currentBackoff = this.pollIntervalMs;
        
        // Prepare SQLite statements for registry
        this._prepareRegistryStatements();
        
        log('INFO', `SwarmEngine initialized (maxVMs=${this.maxConcurrentVMs}, poll=${this.pollIntervalMs}ms)`);
    }
    
    /**
     * Prepare SQLite statements for registry (VM tracking, artifacts)
     */
    _prepareRegistryStatements() {
        this.registryStmts = {
            // VM assignment tracking
            assignVm: this.registryDb.prepare(`
                INSERT OR REPLACE INTO vm_assignments (vm_id, ticket_id, assigned_at, status, heartbeat_at)
                VALUES (?, ?, CURRENT_TIMESTAMP, 'running', CURRENT_TIMESTAMP)
            `),
            
            releaseVm: this.registryDb.prepare(`
                DELETE FROM vm_assignments WHERE vm_id = ?
            `),
            
            // Artifact storage
            storeArtifact: this.registryDb.prepare(`
                INSERT INTO execution_artifacts (id, ticket_id, artifact_type, content, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `),
            
            // Get agent by ID
            getAgent: this.registryDb.prepare(`
                SELECT * FROM agents WHERE id = ? OR name = ?
            `)
        };
    }

    // ============ PostgreSQL Query Methods ============
    
    /**
     * Get ready tickets from PostgreSQL
     */
    async getReadyTickets(limit) {
        const result = await this.pgPool.query(`
            SELECT * FROM tickets 
            WHERE state = 'ready' 
              AND assignee_id IS NOT NULL
              AND assignee_type = 'agent'
              AND vm_id IS NULL
            ORDER BY created_at ASC
            LIMIT $1
        `, [limit]);
        return result.rows;
    }
    
    /**
     * Claim ticket atomically
     */
    async claimTicket(vmId, ticketId) {
        const result = await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'in_progress', vm_id = $1, started_at = NOW(), updated_at = NOW()
            WHERE id = $2 AND state = 'ready' AND vm_id IS NULL
        `, [vmId, ticketId]);
        return result.rowCount;
    }
    
    /**
     * Complete ticket
     */
    async completeTicket(outputs, ticketId) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'done', vm_id = NULL, completed_at = NOW(), 
                outputs = $1, updated_at = NOW()
            WHERE id = $2
        `, [outputs, ticketId]);
    }
    
    /**
     * Fail ticket
     */
    async failTicket(error, ticketId) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'cancelled', vm_id = NULL, completed_at = NOW(),
                error = $1, rejection_count = COALESCE(rejection_count, 0) + 1, updated_at = NOW()
            WHERE id = $2
        `, [error, ticketId]);
    }
    
    /**
     * Release ticket back to ready
     */
    async releaseTicket(ticketId) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'ready', vm_id = NULL, started_at = NULL, updated_at = NOW()
            WHERE id = $1
        `, [ticketId]);
    }
    
    /**
     * Set ticket to in_review (after PR created)
     * Also assigns sentinel-agent for the review/completion phase
     */
    async setInReview(prUrl, evidence, ticketId) {
        await this.pgPool.query(`
            UPDATE tickets
            SET state = 'in_review', pr_url = $1, verification_status = 'passed',
                assignee_id = 'sentinel-agent', assignee_type = 'agent',
                updated_at = NOW()
            WHERE id = $2
        `, [prUrl, ticketId]);
    }
    
    /**
     * Set ticket to needs_review
     */
    async setNeedsReview(evidence, ticketId) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'needs_review', verification_status = 'failed',
                updated_at = NOW()
            WHERE id = $1
        `, [ticketId]);
    }
    
    /**
     * Set ticket to verifying state
     */
    async setVerifying(ticketId) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'verifying', updated_at = NOW()
            WHERE id = $1
        `, [ticketId]);
    }
    
    /**
     * Update ticket branch name
     */
    async updateBranch(branchName, ticketId) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET branch_name = $1, updated_at = NOW()
            WHERE id = $2
        `, [branchName, ticketId]);
    }
    
    /**
     * Get ticket by ID
     */
    async getTicket(ticketId) {
        const result = await this.pgPool.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
        return result.rows[0] || null;
    }
    
    /**
     * Get project by ID
     */
    async getProject(projectId) {
        const result = await this.pgPool.query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
        return result.rows[0] || null;
    }
    
    /**
     * Count active tickets
     */
    async countActive() {
        const result = await this.pgPool.query(`
            SELECT COUNT(*) as count FROM tickets WHERE state = 'in_progress'
        `);
        return parseInt(result.rows[0]?.count || 0);
    }

    // ============ Engine Lifecycle ============
    
    /**
     * Start the engine main loop
     */
    async start() {
        if (this.running) {
            log('WARN', 'Engine already running');
            return;
        }
        
        // Test PostgreSQL connection
        try {
            await this.pgPool.query('SELECT NOW()');
            log('INFO', 'PostgreSQL connection verified');
        } catch (e) {
            log('ERROR', `PostgreSQL connection failed: ${e.message}`);
            throw e;
        }
        
        this.running = true;
        this.shuttingDown = false;
        
        // Write PID file
        try {
            writeFileSync(PID_FILE, process.pid.toString());
            log('INFO', `Engine started (PID ${process.pid})`);
        } catch (e) {
            log('WARN', `Could not write PID file: ${e.message}`);
        }
        
        // Setup signal handlers
        this._setupSignalHandlers();
        
        // Start polling loop
        await this._pollLoop();
    }
    
    /**
     * Stop the engine gracefully
     */
    async stop() {
        if (!this.running) {
            log('WARN', 'Engine not running');
            return;
        }
        
        log('INFO', 'Initiating graceful shutdown...');
        this.shuttingDown = true;
        
        // Stop accepting new work
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        
        // Wait for active executions to complete (with timeout)
        const shutdownTimeout = 60000; // 1 minute
        const startTime = Date.now();
        
        while (this.activeExecutions.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
            log('INFO', `Waiting for ${this.activeExecutions.size} active executions...`);
            await new Promise(r => setTimeout(r, 2000));
        }
        
        if (this.activeExecutions.size > 0) {
            log('WARN', `Force stopping ${this.activeExecutions.size} executions`);
            for (const [ticketId, exec] of this.activeExecutions) {
                await this._releaseExecution(ticketId, exec, 'Shutdown forced');
            }
        }
        
        // Cleanup
        this.running = false;
        this.registryDb.close();
        await this.pgPool.end();
        
        // Remove PID file
        try {
            if (existsSync(PID_FILE)) {
                require('fs').unlinkSync(PID_FILE);
            }
        } catch (e) {
            // Ignore
        }
        
        log('INFO', 'Engine stopped');
    }
    
    /**
     * Setup signal handlers for graceful shutdown
     */
    _setupSignalHandlers() {
        const shutdown = async (signal) => {
            log('INFO', `Received ${signal}`);
            await this.stop();
            process.exit(0);
        };
        
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    
    /**
     * Main polling loop
     */
    async _pollLoop() {
        while (this.running && !this.shuttingDown) {
            try {
                const processed = await this._pollOnce();
                
                // Adaptive backoff
                if (processed > 0) {
                    this.currentBackoff = this.pollIntervalMs;
                } else {
                    this.currentBackoff = Math.min(this.currentBackoff * 1.5, this.backoffMaxMs);
                }
                
            } catch (e) {
                log('ERROR', `Poll error: ${e.message}`);
                this.currentBackoff = this.backoffMaxMs;
            }
            
            // Wait before next poll
            if (this.running && !this.shuttingDown) {
                await new Promise(r => {
                    this.pollTimer = setTimeout(r, this.currentBackoff);
                });
            }
        }
    }
    
    /**
     * Single poll iteration
     * @returns {number} Number of tickets dispatched
     */
    async _pollOnce() {
        // Check capacity
        const activeCount = this.activeExecutions.size;
        const available = this.maxConcurrentVMs - activeCount;
        
        if (available <= 0) {
            return 0;
        }
        
        // Get ready tickets from PostgreSQL
        const tickets = await this.getReadyTickets(available);
        
        if (tickets.length === 0) {
            return 0;
        }
        
        log('INFO', `Found ${tickets.length} ready tickets (capacity: ${available})`);
        
        // Dispatch each ticket
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
    
    /**
     * Execute a single ticket
     */
    async executeTicket(ticket) {
        const ticketId = ticket.id.toString();
        log('INFO', `Dispatching ticket ${ticketId}: ${ticket.title}`);
        
        // Parse inputs
        let inputs = {};
        try {
            inputs = ticket.inputs ? JSON.parse(ticket.inputs) : {};
        } catch (e) {
            inputs = {};
        }
        
        // Create executor
        const runId = randomUUID();
        const executor = new StepExecutor(runId, { 
            db: this.registryDb, 
            useVm: true,
            vmTimeout: this.ticketTimeoutMs,
            skipStepLogging: true  // Single agent execution, no multi-step logging needed
        });
        
        // NOTE: VM acquisition handled by executor.runAgentInVm()
        // Using placeholder vmId=0 for tracking
        const vmId = 0;
        
        // Claim ticket atomically
        const claimed = await this.claimTicket(vmId, ticketId);
        if (claimed === 0) {
            // Race condition - another process claimed it
            log('WARN', `Ticket ${ticketId} already claimed`);
            return;
        }
        
        // Track assignment in registry (SQLite)
        this.registryStmts.assignVm.run(vmId, ticketId);
        this.activeExecutions.set(ticketId, { 
            vmId, 
            executor, 
            startTime: Date.now(),
            runId 
        });
        
        // Execute asynchronously (don't block polling)
        this._executeAsync(ticket, executor, vmId, inputs).catch(e => {
            log('ERROR', `Async execution error for ticket ${ticketId}: ${e.message}`);
        });
    }
    
    /**
     * Async ticket execution (runs in background)
     */
    async _executeAsync(ticket, executor, vmId, inputs) {
        const ticketId = ticket.id.toString();
        const startTime = Date.now();
        
        try {
            let result;
            
            // Branch based on execution_mode
            if (ticket.execution_mode === 'workflow' && ticket.workflow_id) {
                // Workflow execution - use WorkflowDispatcher
                log('INFO', `Executing ticket ${ticketId} as workflow (workflow_id: ${ticket.workflow_id})`);
                
                const dispatcher = new WorkflowDispatcher({ useVm: true });
                try {
                    const workflowResult = await dispatcher.runWorkflowForTicket(
                        ticket.workflow_id,
                        ticketId,
                        {
                            ...inputs,
                            ticket: ticket,
                            projectSettings: {}
                        }
                    );
                    
                    result = {
                        status: workflowResult.status,
                        runId: workflowResult.runId,
                        outputs: workflowResult.results,
                        error: workflowResult.error
                    };
                } finally {
                    dispatcher.close();
                }
                
            } else if (ticket.assignee_type === 'agent' && ticket.assignee_id) {
                // Single agent execution
                const agent = this.registryStmts.getAgent.get(ticket.assignee_id, ticket.assignee_id);
                if (!agent) {
                    throw new Error(`Agent not found: ${ticket.assignee_id}`);
                }
                
                result = await executor.executeStep({
                    id: ticketId,
                    agent: agent.name,
                    agent_version: agent.version,
                    inputs: {
                        ...inputs,
                        ticket: ticket,
                        projectSettings: {}
                    }
                }, { trigger: inputs });
            } else {
                throw new Error('Ticket has no valid execution mode (needs workflow_id or agent assignment)');
            }
            
            // Success - but don't complete yet, verify first
            const duration = Date.now() - startTime;
            log('INFO', `Ticket ${ticketId} agent execution completed in ${duration}ms`);
            
            // Store artifacts first (before verification)
            if (result?.stdout) {
                this.registryStmts.storeArtifact.run(randomUUID(), ticketId, 'stdout', result.stdout);
            }
            if (result?.stderr) {
                this.registryStmts.storeArtifact.run(randomUUID(), ticketId, 'stderr', result.stderr);
            }
            
            // GAP #3: Post-code generation verification
            const branchName = ticket.branch_name || `swarm/${ticketId}`;
            const project = await this.getProject(ticket.project_id);
            const repoUrl = project?.repo_url;
            
            if (!repoUrl) {
                log('WARN', `No repo_url for project ${ticket.project_id}, skipping verification`);
                const outputJson = JSON.stringify(result || {});
                await this.completeTicket(outputJson, ticketId);
            } else {
                // Run verification flow
                await this._postCodeGeneration(ticketId, branchName, repoUrl, ticket, result);
            }
            
        } catch (e) {
            const duration = Date.now() - startTime;
            log('ERROR', `Ticket ${ticketId} failed after ${duration}ms: ${e.message}`);
            
            await this.failTicket(e.message, ticketId);
            this.registryStmts.storeArtifact.run(randomUUID(), ticketId, 'error', e.stack || e.message);
            
        } finally {
            // Cleanup
            await this._releaseExecution(ticketId, this.activeExecutions.get(ticketId));
        }
    }
    
    /**
     * Release VM and cleanup execution tracking
     */
    async _releaseExecution(ticketId, exec, reason = null) {
        if (!exec) return;
        
        try {
            await exec.executor.releaseVm(exec.vmId);
            this.registryStmts.releaseVm.run(exec.vmId);
        } catch (e) {
            log('WARN', `Error releasing VM ${exec.vmId}: ${e.message}`);
        }
        
        this.activeExecutions.delete(ticketId);
        
        if (reason) {
            await this.failTicket(reason, ticketId);
        }
    }

    /**
     * GAP #3: Post-code generation verification and PR creation
     */
    async _postCodeGeneration(ticketId, branchName, repoUrl, ticket, result, attempt = 1) {
        log('INFO', `Starting verification for ${ticketId} (attempt ${attempt}/${MAX_ATTEMPTS})`);
        
        // Update to verifying state
        await this.setVerifying(ticketId);
        
        // Update branch name if not set
        if (!ticket.branch_name) {
            await this.updateBranch(branchName, ticketId);
        }
        
        try {
            // Call verifier service
            const verifyResult = await verify({
                ticketId,
                branchName,
                repoUrl,
                attempt,
                acceptanceCriteria: ticket.acceptance_criteria,
                phases: ['static', 'automated', 'sentinel']
            });
            
            log('INFO', `Verification result for ${ticketId}: ${verifyResult.status}`);
            
            if (verifyResult.status === 'passed' || verifyResult.ready_for_pr) {
                // Verification passed - create PR
                const prUrl = await this._createPR(ticketId, branchName, repoUrl, ticket);
                const evidence = JSON.stringify(verifyResult);
                await this.setInReview(prUrl, evidence, ticketId);
                log('INFO', `PR created for ${ticketId}: ${prUrl}`);
                
            } else if (attempt < MAX_ATTEMPTS) {
                // Verification failed but can retry
                log('WARN', `Verification failed for ${ticketId}, marking for review`);
                const feedback = formatFeedbackForRetry(verifyResult.feedback_for_agent);
                
                // Store feedback for agent context on retry
                this.registryStmts.storeArtifact.run(
                    randomUUID(), 
                    ticketId, 
                    `verification_feedback_attempt_${attempt}`, 
                    feedback
                );
                
                // Mark as needs_review
                const evidence = JSON.stringify(verifyResult);
                await this.setNeedsReview(evidence, ticketId);
                
            } else {
                // Max retries exceeded
                log('ERROR', `Max verification attempts exceeded for ${ticketId}`);
                const evidence = JSON.stringify(verifyResult);
                await this.setNeedsReview(evidence, ticketId);
            }
            
        } catch (e) {
            log('ERROR', `Verification error for ${ticketId}: ${e.message}`);
            // On verification error, complete normally but log
            const outputJson = JSON.stringify(result || {});
            await this.completeTicket(outputJson, ticketId);
        }
    }
    
    /**
     * Create PR using GitHub CLI
     */
    async _createPR(ticketId, branchName, repoUrl, ticket) {
        try {
            // Parse repo owner/name from URL
            const match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
            if (!match) {
                throw new Error(`Cannot parse repo URL: ${repoUrl}`);
            }
            const [, owner, repo] = match;
            
            // Use GitHub CLI to create PR
            const title = `feat(${ticketId}): ${ticket.title || 'Automated changes'}`;
            const body = `## Automated PR from Swarm\n\n**Ticket**: ${ticketId}\n**Description**: ${ticket.description || 'No description'}\n\n### Acceptance Criteria\n${ticket.acceptance_criteria || 'None specified'}\n\n---\n*Generated by Swarm Engine*`;

            const ghToken = readFileSync('/root/.github_token', 'utf8').trim();
            
            const cmd = `gh pr create --repo ${owner}/${repo} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base main --head ${branchName}`;
            
            const prResult = execSync(cmd, {
                env: { ...process.env, GH_TOKEN: ghToken },
                encoding: 'utf8',
                timeout: 30000
            }).trim();
            
            return prResult; // Returns PR URL
            
        } catch (e) {
            log('ERROR', `Failed to create PR for ${ticketId}: ${e.message}`);
            return `https://github.com/error-creating-pr/${ticketId}`;
        }
    }


    /**
     * Get engine status
     */
    async getStatus() {
        const activeCount = this.activeExecutions.size;
        const pendingTickets = await this.getReadyTickets(100);
        
        return {
            running: this.running,
            shuttingDown: this.shuttingDown,
            activeExecutions: activeCount,
            pendingTickets: pendingTickets.length,
            maxVMs: this.maxConcurrentVMs,
            availableSlots: this.maxConcurrentVMs - activeCount,
            uptime: process.uptime(),
            pid: process.pid
        };
    }
    
    /**
     * Run a single ticket by ID (for testing/debugging)
     */
    async runTicket(ticketId, options = {}) {
        const ticket = await this.getTicket(ticketId);
        if (!ticket) {
            throw new Error(`Ticket not found: ${ticketId}`);
        }
        
        if (ticket.state !== 'ready') {
            throw new Error(`Ticket ${ticketId} is not ready (state: ${ticket.state})`);
        }
        
        await this.executeTicket(ticket);
        
        // Wait for completion if requested
        if (options.wait) {
            const timeout = options.timeout || 300000;
            const start = Date.now();
            
            while (this.activeExecutions.has(ticketId.toString())) {
                if (Date.now() - start > timeout) {
                    throw new Error('Execution timeout');
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            
            return await this.getTicket(ticketId);
        }
    }
}

export default SwarmEngine;

// ============ Auto-start when run directly ============
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

// Always auto-start the engine
const engine = new SwarmEngine({
    maxVMs: 3,           // Conservative start
    pollInterval: 5000   // 5 second polling
});

engine.start().catch(err => {
    console.error('Engine failed to start:', err);
    process.exit(1);
});
