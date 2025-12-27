/**
 * Swarm Workflow Dispatcher
 * Orchestrates complete workflow runs by executing steps in order
 * Handles step dependencies, parallel execution, and error handling
 * Refactored for PostgreSQL
 */

import { randomUUID } from 'crypto';
import { StepExecutor } from './executor.js';
import { resolveVariables, buildContext } from './variable-resolver.js';

export class WorkflowDispatcher {
    constructor(options = {}) {
        this.pool = options.pool; // Use shared Postgres pool
        this.useVm = options.useVm !== false;
        this.maxParallel = options.maxParallel || 5;
    }

    /**
     * Run a workflow by name
     */
    async runWorkflow(workflowName, triggerData = {}) {
        const runId = randomUUID();
        const startTime = Date.now();
        const now = new Date().toISOString();

        console.log(`\n🚀 Starting workflow: ${workflowName}`);
        console.log(`   Run ID: ${runId}\n`);

        const client = await this.pool.connect();

        try {
            // Load workflow from registry
            const res = await client.query(`
                SELECT * FROM workflows WHERE (id = $1 OR name = $2) AND enabled = true
                ORDER BY created_at DESC LIMIT 1
            `, [workflowName, workflowName]);
            const workflow = res.rows[0];

            if (!workflow) {
                throw new Error(`Workflow not found or disabled: ${workflowName}`);
            }

            const steps = typeof workflow.steps === 'string' ? JSON.parse(workflow.steps || '[]') : workflow.steps || [];
            const workflowVariables = typeof workflow.variables === 'string' ? JSON.parse(workflow.variables || '{}') : workflow.variables || {};

            // Create run record
            await client.query(`
                INSERT INTO workflow_runs 
                (id, workflow_id, workflow_version, status, trigger_type, trigger_data, started_at)
                VALUES ($1, $2, $3, 'running', $4, $5, $6)
            `, [runId, workflow.id, workflow.version, workflow.trigger_type || 'manual',
                JSON.stringify(triggerData), now]);

            // Initialize execution context
            const context = buildContext({
                trigger: triggerData,
                variables: resolveVariables(workflowVariables, { trigger: triggerData }),
                steps: {},
                config: {},
                run: { id: runId, workflow: workflowName, startedAt: now }
            });

            // Create executor
            const executor = new StepExecutor(runId, { pool: this.pool, useVm: this.useVm });

            let finalStatus = 'completed';
            let errorMessage = null;
            let errorStep = null;
            const stepResults = {};

            try {
                // Execute steps in order (respecting dependencies)
                const executed = new Set();
                const pending = [...steps];

                while (pending.length > 0) {
                    // Find steps that are ready to execute (dependencies satisfied)
                    const ready = pending.filter(step => {
                        if (!step.depends_on || step.depends_on.length === 0) return true;
                        return step.depends_on.every(dep => executed.has(dep));
                    });

                    if (ready.length === 0 && pending.length > 0) {
                        throw new Error(`Circular dependency detected. Pending: ${pending.map(s => s.id).join(', ')}`);
                    }

                    // Execute ready steps (could parallelize here)
                    for (const step of ready) {
                        try {
                            // Update current step in run record
                            await client.query('UPDATE workflow_runs SET current_step = $1 WHERE id = $2', [step.id, runId]);

                            const result = await executor.executeStep(step, context);

                            // Store result in context for subsequent steps
                            stepResults[step.id] = result;
                            context.steps[step.id] = {
                                status: result.status,
                                outputs: result.outputs
                            };

                            executed.add(step.id);

                        } catch (stepError) {
                            // Check error handling strategy
                            const onError = step.on_error || workflow.on_error;

                            if (onError === 'continue') {
                                console.log(`  ⚠️  Step ${step.id} failed but continuing: ${stepError.message}`);
                                stepResults[step.id] = { status: 'failed', error: stepError.message };
                                context.steps[step.id] = { status: 'failed', error: stepError.message };
                                executed.add(step.id);
                            } else {
                                throw stepError;
                            }
                        }

                        // Remove from pending
                        const idx = pending.findIndex(s => s.id === step.id);
                        if (idx !== -1) pending.splice(idx, 1);
                    }
                }

                // Run on_success handlers
                if (workflow.on_success) {
                    const handlers = typeof workflow.on_success === 'string' ? JSON.parse(workflow.on_success) : workflow.on_success; // Handle both types
                    await this.runHandlers(handlers, context, 'success');
                }

            } catch (error) {
                finalStatus = 'failed';
                errorMessage = error.message;
                errorStep = context.run?.currentStep || null;

                console.log(`\n❌ Workflow failed: ${error.message}`);

                // Run on_error handlers
                if (workflow.on_error) {
                    const handlers = typeof workflow.on_error === 'string' ? JSON.parse(workflow.on_error) : workflow.on_error;
                    context.error = { message: error.message, step: errorStep };
                    await this.runHandlers(handlers, context, 'error');
                }
            }

            // Calculate totals
            const totalTime = Date.now() - startTime;
            const completedAt = new Date().toISOString();

            // Update run record
            await client.query(`
                UPDATE workflow_runs 
                SET status = $1, step_results = $2, completed_at = $3, 
                    error = $4, error_step = $5, total_vm_time_ms = $6
                WHERE id = $7
            `, [finalStatus, JSON.stringify(stepResults), completedAt,
                errorMessage, errorStep, totalTime, runId]);

            console.log(`\n${finalStatus === 'completed' ? '✅' : '❌'} Workflow ${finalStatus} in ${totalTime}ms`);

            return {
                runId,
                workflowId: workflow.id,
                workflowName: workflow.name,
                status: finalStatus,
                results: stepResults,
                error: errorMessage,
                errorStep,
                totalTimeMs: totalTime,
                completedAt
            };
        } finally {
            client.release();
        }
    }

    /**
     * Run workflow event handlers (on_success, on_error)
     */
    async runHandlers(handlers, context, eventType) {
        if (!Array.isArray(handlers)) return;

        for (const handler of handlers) {
            if (handler.notify) {
                const { type, message } = handler.notify;
                const resolvedMsg = resolveVariables(message, context);

                switch (type) {
                    case 'log':
                        console.log(`[${eventType.toUpperCase()}] ${resolvedMsg}`);
                        break;
                    case 'webhook':
                        // TODO: Implement webhook notification
                        break;
                    default:
                        console.log(`[${eventType}] ${resolvedMsg}`);
                }
            }
        }
    }

    /**
     * Get workflow run status
     */
    async getRunStatus(runId) {
        const res = await this.pool.query('SELECT * FROM workflow_runs WHERE id = $1', [runId]);
        return res.rows[0];
    }

    /**
     * List recent runs for a workflow
     */
    async listRuns(workflowName, limit = 10) {
        if (workflowName) {
            const res = await this.pool.query(`
                SELECT r.*, w.name as workflow_name
                FROM workflow_runs r
                JOIN workflows w ON r.workflow_id = w.id
                WHERE w.name = $1
                ORDER BY r.started_at DESC
                LIMIT $2
            `, [workflowName, limit]);
            return res.rows;
        }
        const res = await this.pool.query(`
            SELECT r.*, w.name as workflow_name
            FROM workflow_runs r
            JOIN workflows w ON r.workflow_id = w.id
            ORDER BY r.started_at DESC
            LIMIT $1
        `, [limit]);
        return res.rows;
    }

    /**
     * Run a workflow linked to a ticket
     */
    async runWorkflowForTicket(workflowName, ticketId, triggerData = {}) {
        const runId = randomUUID();
        const startTime = Date.now();
        const now = new Date().toISOString();

        console.log(`\n🚀 Starting workflow: ${workflowName} (ticket: ${ticketId})`);
        console.log(`   Run ID: ${runId}\n`);

        const client = await this.pool.connect();

        try {
            // Load workflow from registry
            const res = await client.query(`
                SELECT * FROM workflows WHERE (id = $1 OR name = $2) AND enabled = true
                ORDER BY created_at DESC LIMIT 1
            `, [workflowName, workflowName]);
            const workflow = res.rows[0];

            if (!workflow) {
                throw new Error(`Workflow not found or disabled: ${workflowName}`);
            }

            const steps = typeof workflow.steps === 'string' ? JSON.parse(workflow.steps || '[]') : workflow.steps || [];
            const workflowVariables = typeof workflow.variables === 'string' ? JSON.parse(workflow.variables || '{}') : workflow.variables || {};

            // Create run record WITH ticket_id link
            await client.query(`
                INSERT INTO workflow_runs 
                (id, workflow_id, workflow_version, status, trigger_type, trigger_data, started_at, ticket_id)
                VALUES ($1, $2, $3, 'running', $4, $5, $6, $7)
            `, [runId, workflow.id, workflow.version, workflow.trigger_type || 'ticket',
                JSON.stringify(triggerData), now, ticketId]);

            // Initialize execution context
            const context = buildContext({
                trigger: triggerData,
                variables: resolveVariables(workflowVariables, { trigger: triggerData }),
                steps: {},
                config: {},
                run: { id: runId, workflow: workflowName, ticketId, startedAt: now }
            });

            // Create executor (skipStepLogging=false to log to step_executions)
            const executor = new StepExecutor(runId, { pool: this.pool, useVm: this.useVm });

            let finalStatus = 'completed';
            let errorMessage = null;
            let errorStep = null;
            const stepResults = {};

            try {
                // Execute steps in order (respecting dependencies)
                const executed = new Set();
                const pending = [...steps];

                while (pending.length > 0) {
                    // Find steps that are ready to execute (dependencies satisfied)
                    const ready = pending.filter(step => {
                        if (!step.depends_on || step.depends_on.length === 0) return true;
                        return step.depends_on.every(dep => executed.has(dep));
                    });

                    if (ready.length === 0 && pending.length > 0) {
                        throw new Error(`Circular dependency detected. Pending: ${pending.map(s => s.id).join(', ')}`);
                    }

                    // Execute ready steps
                    for (const step of ready) {
                        try {
                            await client.query('UPDATE workflow_runs SET current_step = $1 WHERE id = $2', [step.id, runId]);

                            const result = await executor.executeStep(step, context);

                            stepResults[step.id] = result;
                            context.steps[step.id] = {
                                status: result.status,
                                outputs: result.outputs
                            };

                            executed.add(step.id);

                        } catch (stepError) {
                            const onError = step.on_error || workflow.on_error;

                            if (onError === 'continue') {
                                console.log(`  ⚠️  Step ${step.id} failed but continuing: ${stepError.message}`);
                                stepResults[step.id] = { status: 'failed', error: stepError.message };
                                context.steps[step.id] = { status: 'failed', error: stepError.message };
                                executed.add(step.id);
                            } else {
                                throw stepError;
                            }
                        }

                        const idx = pending.findIndex(s => s.id === step.id);
                        if (idx !== -1) pending.splice(idx, 1);
                    }
                }

            } catch (error) {
                finalStatus = 'failed';
                errorMessage = error.message;
                errorStep = context.run?.currentStep || null;
                console.log(`\n❌ Workflow failed: ${error.message}`);
            }

            // Calculate totals
            const totalTime = Date.now() - startTime;
            const completedAt = new Date().toISOString();

            // Update run record
            await client.query(`
                UPDATE workflow_runs 
                SET status = $1, step_results = $2, completed_at = $3, 
                    error = $4, error_step = $5, total_vm_time_ms = $6
                WHERE id = $7
            `, [finalStatus, JSON.stringify(stepResults), completedAt,
                errorMessage, errorStep, totalTime, runId]);

            console.log(`\n${finalStatus === 'completed' ? '✅' : '❌'} Workflow ${finalStatus} in ${totalTime}ms`);

            return {
                runId,
                workflowId: workflow.id,
                workflowName: workflow.name,
                ticketId,
                status: finalStatus,
                results: stepResults,
                error: errorMessage,
                errorStep,
                totalTimeMs: totalTime,
                completedAt
            };
        } finally {
            client.release();
        }
    }
}
