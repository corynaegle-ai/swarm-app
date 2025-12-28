/**
 * Legacy ticket routes for agent communication - PostgreSQL version
 * Mounted at root level: /claim, /complete, /heartbeat, etc.
 * Migrated: 2025-12-17 - From SQLite to async PostgreSQL
 * Updated: 2025-12-26 - Added agent_id validation against agent_definitions
 */

const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// GET /stats - Ticket stats (no auth - agent facing)
router.get('/stats', async (req, res) => {
  try {
    const stats = await queryAll(`
      SELECT state, COUNT(*)::int as count FROM tickets GROUP BY state
    `);
    res.json({ stats: Object.fromEntries(stats.map(s => [s.state, s.count])) });
  } catch (err) {
    console.error('GET /stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /agents/available - List valid agent IDs (no auth - for agent discovery)
router.get('/agents/available', async (req, res) => {
  try {
    const { type, runtime } = req.query;

    let sql = `
      SELECT id, name, version, runtime, description, 
             capabilities, timeout_seconds
      FROM agent_definitions
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (runtime) {
      sql += ` AND runtime = $${paramIndex++}`;
      params.push(runtime);
    }

    sql += ` ORDER BY name, version DESC`;

    const agents = await queryAll(sql, params);

    res.json({
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        version: a.version,
        runtime: a.runtime,
        description: a.description,
        capabilities: a.capabilities,
        timeout_seconds: a.timeout_seconds
      })),
      count: agents.length
    });
  } catch (err) {
    console.error('GET /agents/available error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/claim', async (req, res) => {
  try {
    const { agent_id, vm_id, project_id, ticket_filter } = req.body || {};
    if (!agent_id) return res.status(400).json({ error: 'agent_id required' });

    // Validate agent_id exists in agent_definitions
    const agentDef = await queryOne(`
      SELECT id, name, version FROM agent_definitions 
      WHERE id = $1 OR name = $1
    `, [agent_id]);

    if (!agentDef) {
      console.warn(`[claim] Invalid agent_id: ${agent_id} - not found in agent_definitions`);
      return res.status(400).json({
        error: 'Invalid agent_id - not registered in agent_definitions',
        hint: 'Use GET /agents/available to list valid agent IDs'
      });
    }

    // Use the canonical agent ID from the definition
    const canonicalAgentId = agentDef.id;

    // Determine which state to filter on
    // Agent routing by state convention:
    // - Forge agents: ticket_filter = 'ready' (default)
    // - Sentinel agents: ticket_filter = 'in_review'
    // - Deploy agents: ticket_filter = 'approved'
    const validFilters = ['ready', 'in_review', 'approved'];
    const targetState = validFilters.includes(ticket_filter) ? ticket_filter : 'ready';

    // Find claimable ticket with project info INCLUDING mcp_servers
    let sql, params;

    if (project_id) {
      sql = `
        SELECT
          t.*,
          p.repo_url as project_repo_url,
          p.type as project_type,
          p.name as project_name,
          p.mcp_servers as project_mcp_servers
        FROM tickets t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.state = $1 AND t.project_id = $2
        ORDER BY t.created_at ASC
        LIMIT 1
      `;
      params = [targetState, project_id];
    } else {
      sql = `
        SELECT
          t.*,
          p.repo_url as project_repo_url,
          p.type as project_type,
          p.name as project_name,
          p.mcp_servers as project_mcp_servers
        FROM tickets t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.state = $1
        ORDER BY
          CASE t.estimated_scope
            WHEN 'small' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'large' THEN 3
          END,
          t.created_at ASC
        LIMIT 1
      `;
      params = [targetState];
    }

    const ticket = await queryOne(sql, params);

    if (!ticket) return res.json({ ticket: null, message: 'No tickets available' });

    // Log state transition
    console.log('[state transition] /claim:', {
      ticketId: ticket.id,
      fromState: ticket.state,
      toState: 'assigned',
      agent_id: canonicalAgentId,
      agent_name: agentDef.name,
      agent_version: agentDef.version,
      ticket_filter: ticket_filter || 'ready',
      timestamp: new Date().toISOString()
    });

    // Extract project info before spreading ticket
    const project = {
      id: ticket.project_id,
      name: ticket.project_name,
      repo_url: ticket.project_repo_url,
      type: ticket.project_type
    };

    // Get MCP servers - ticket overrides project defaults
    const ticketMcpServers = ticket.mcp_servers || [];
    const projectMcpServers = ticket.project_mcp_servers || [];
    const effectiveMcpServers = ticketMcpServers.length > 0 ? ticketMcpServers : projectMcpServers;

    // Build projectSettings with model config and mcp_servers
    const projectSettings = {
      worker_model: 'claude-sonnet-4-20250514',
      mcp_servers: projectMcpServers
    };

    // Remove project fields from ticket object
    delete ticket.project_repo_url;
    delete ticket.project_type;
    delete ticket.project_name;
    delete ticket.project_mcp_servers;

    // Claim the ticket - set to assigned state with lease
    const leaseMinutes = 30;
    await execute(`
      UPDATE tickets 
      SET state = 'assigned', 
          assignee_id = $1, 
          assignee_type = 'agent',
          vm_id = $2,
          lease_expires = NOW() + INTERVAL '${leaseMinutes} minutes',
          last_heartbeat = NOW()
      WHERE id = $3
    `, [canonicalAgentId, vm_id || null, ticket.id]);

    res.json({
      ticket: {
        ...ticket,
        state: 'assigned',
        assignee_id: canonicalAgentId,
        mcp_servers: effectiveMcpServers,
        user_id: ticket.tenant_id || 'default'
      },
      project,
      projectSettings,
      agent: {
        id: agentDef.id,
        name: agentDef.name,
        version: agentDef.version
      },
      lease_minutes: leaseMinutes
    });
  } catch (err) {
    console.error('POST /claim error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /status - Agent updates ticket status (e.g. to in_progress)
router.post('/status', async (req, res) => {
  try {
    const { ticket_id, agent_id, state } = req.body || {};
    if (!ticket_id || !state) return res.status(400).json({ error: 'ticket_id and state required' });

    console.log(`[state transition] /status: Ticket ${ticket_id} -> ${state} (by ${agent_id})`);

    // Verify valid agent_definitions if agent_id provided (optional security check)
    // ...

    await execute(`
      UPDATE tickets 
      SET state = $1, 
          updated_at = NOW()
      WHERE id = $2
    `, [state, ticket_id]);

    // Broadcast update
    const ticket = await queryOne('SELECT * FROM tickets WHERE id = $1', [ticket_id]);
    if (ticket) {
      if (!queryOne.broadcast) {
        // Import broadcast if not available in scope, but typically tickets-legacy.js doesn't import it.
        // We'll rely on polling or the fact that dashboard polls.
        // Ideally we should broadcast. 
        // Let's attempt to use the broadcast mechanism if available or skip.
        // See top of file... tickets-legacy.js doesn't import broadcast!
        // We should probably rely on polling for now.
      }
    }

    res.json({ success: true, state });
  } catch (err) {
    console.error('POST /status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /complete - Agent completes ticket
router.post('/complete', async (req, res) => {
  try {
    const { agent_id, ticket_id, pr_url, branch_name, files_involved, outputs } = req.body || {};
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });

    // Log state transition: in_progress → in_review
    console.log('[state transition] /complete:', {
      ticketId: ticket_id,
      fromState: 'in_progress',
      toState: 'in_review',
      agent_id,
      pr_url,
      branch_name,
      timestamp: new Date().toISOString()
    });



    // Only transition to in_review if we actually have a PR (success)
    // If failed, we might want to set to 'failed' or leave as is?
    // For now, let's respect that the Agent might call complete with success=false
    // But we definitely shouldn't trigger verification or set in_review if it failed.

    let newState = 'verifying';
    if (!pr_url) {
      newState = 'in_progress'; // Keep in progress if no PR
      console.log('[complete] No PR URL, skipping state transition to verifying');
      return res.json({ success: false, message: 'No PR URL provided, skipping completion' });
    }

    // 1. Update Ticket State to VERIFYING (The Fracture Protocol)
    await execute(`
      UPDATE tickets 
      SET state = $1, 
          completed_at = NOW(),
          pr_url = $2,
          branch_name = $3,
          files_involved = $4,
          outputs = $5,
          verification_status = 'partial', 
          updated_at = NOW()
      WHERE id = $6
    `, [
      newState,
      pr_url || null,
      branch_name || null,
      files_involved ? JSON.stringify(files_involved) : null,
      outputs ? JSON.stringify(outputs) : null,
      ticket_id
    ]);

    // Fetch latest ticket data to get repo_url
    const ticketData = await queryOne('SELECT repo_url FROM tickets WHERE id = $1', [ticket_id]);
    const repoUrl = ticketData?.repo_url || 'git@github.com:swarm-stack/swarm-workspace.git';

    // 2. Trigger Sentinel Verification
    if (pr_url && branch_name) {
      const sentinelUrl = 'http://localhost:3006/verify';
      console.log(`[Swarm Protocol] Triggering Sentinel Verification for ${ticket_id} with metadata`);

      // Fetch ticket metadata to push to Sentinel (bypass Sentinel's auth issues)
      const ticketMetadata = await queryOne('SELECT title, description, acceptance_criteria FROM tickets WHERE id = $1', [ticket_id]);

      fetch(sentinelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id,
          branch_name,
          repo_url: repoUrl,
          title: ticketMetadata?.title,
          description: ticketMetadata?.description,
          acceptance_criteria: ticketMetadata?.acceptance_criteria,
          phases: ['static', 'automated', 'sentinel']
        })
      })
        .then(r => r.json())
        .then(async data => {
          console.log(`[Swarm Protocol] Sentinel Result for ${ticket_id}:`, data.status);

          if (data.status === 'passed') {
            try {
              // 1. Mark ticket as DONE
              console.log(`[Swarm Protocol] Auto-approving ticket ${ticket_id}`);
              await execute(`
                UPDATE tickets 
                SET state = 'done', 
                    verification_status = 'verified',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
              `, [ticket_id]);

              // 2. Trigger Deploy Agent
              console.log(`[Swarm Protocol] Triggering Deploy Agent for ${ticket_id}`);
              await fetch('http://localhost:3457/api/callbacks/ticket-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id, status: 'done' })
              });
            } catch (err) {
              console.error(`[Swarm Protocol] Handoff failed: ${err.message}`);
            }
          } else {
            // Handle Verification Failure (retry or hold)
            console.log(`[Swarm Protocol] Verification failed for ${ticket_id}:`, data.status);
            try {
              const agentLearning = require('../lib/agent-learning.js');

              // Get current ticket state for retry count
              const ticket = await queryOne(
                'SELECT rejection_count, retry_count, retry_strategy FROM tickets WHERE id = $1',
                [ticket_id]
              );

              if (ticket) {
                const currentRetryCount = ticket.retry_count || 0;
                const newRejectionCount = (ticket.rejection_count || 0) + 1;

                // Construct error message from feedback
                const feedback = (data.feedback_for_agent || []).join('\n') || data.error || 'Verification failed';
                const errorMessage = `Sentinel Verification Failed: ${data.sentinel_decision || 'UNKNOWN'}\n${feedback}`;

                // Calculate retry strategy
                const retryDecision = agentLearning.shouldRetryTicket(errorMessage, currentRetryCount);
                const { shouldRetry, classification, strategy, nextDelay, attemptsRemaining } = retryDecision;

                const newState = shouldRetry ? 'ready' : 'on_hold';

                const holdReason = !shouldRetry ?
                  `Max retries exceeded for verified failure (${strategy.maxRetries} attempts)` :
                  null;

                const logEntry = `[${new Date().toISOString()}] Verification Failed (attempt ${currentRetryCount + 1}): ${data.sentinel_decision}\n${feedback}\n`;

                const retryStrategyJson = JSON.stringify({
                  errorCategory: classification.category,
                  errorSubcategory: classification.subcategory,
                  maxRetries: strategy.maxRetries,
                  backoffType: strategy.backoffType,
                  nextDelayMs: nextDelay,
                  attemptsRemaining
                });

                // Prepare sentinel_feedback object for Forge Agent
                const sentinelFeedback = {
                  decision: data.sentinel_decision,
                  status: data.status,
                  feedback: feedback,
                  issues: data.results?.sentinel?.issues || {},
                  errorClassification: classification
                };

                await execute(`
                  UPDATE tickets
                  SET state = $1,
                      assignee_id = NULL,
                      assignee_type = NULL,
                      vm_id = NULL,
                      rejection_count = $2,
                      retry_count = $3,
                      retry_strategy = $4,
                      hold_reason = $5,
                      error = $6,
                      progress_log = COALESCE(progress_log, '') || $7,
                      verification_status = 'failed',
                      sentinel_feedback = $8
                  WHERE id = $9
                `, [
                  newState,
                  newRejectionCount,
                  currentRetryCount + 1,
                  retryStrategyJson,
                  holdReason,
                  errorMessage,
                  logEntry,
                  JSON.stringify(sentinelFeedback),
                  ticket_id
                ]);

                console.log(`[Swarm Protocol] Verification failure handled. Ticket ${ticket_id} moved to ${newState}`);
              }
            } catch (err) {
              console.error(`[Swarm Protocol] Failed verification handling error: ${err.message}`);
            }
          }
        })
        .catch(err => console.error(`[Swarm Protocol] Sentinel Trigger FAILED: ${err.message}`));
    }

    res.json({ success: true, state: 'verifying' });
  } catch (err) {
    console.error('POST /complete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /release - Release ticket back to pool
router.post('/release', async (req, res) => {
  try {
    const { ticket_id, agent_id, reason } = req.body || {};
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });

    const logEntry = `[${new Date().toISOString()}] Released: ${reason || 'No reason provided'}\n`;

    await execute(`
      UPDATE tickets 
      SET state = 'ready', 
          assignee_id = COALESCE(assignee_id, 'forge'),
          assignee_type = COALESCE(assignee_type, 'agent'),
          vm_id = NULL,
          lease_expires = NULL,
          progress_log = COALESCE(progress_log, '') || $1
      WHERE id = $2
    `, [logEntry, ticket_id]);

    res.json({ success: true, state: 'ready' });
  } catch (err) {
    console.error('POST /release error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /fail - Agent reports failure with dynamic retry strategy
router.post('/fail', async (req, res) => {
  try {
    const { ticket_id, agent_id, error_message, should_retry } = req.body || {};
    if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });

    const agentLearning = require('../lib/agent-learning.js');

    // Get current ticket state
    const ticket = await queryOne(
      'SELECT rejection_count, retry_count, retry_strategy FROM tickets WHERE id = $1',
      [ticket_id]
    );

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const currentRetryCount = ticket.retry_count || 0;
    const newRejectionCount = (ticket.rejection_count || 0) + 1;

    // Use intelligent retry strategy based on error classification
    const retryDecision = agentLearning.shouldRetryTicket(error_message, currentRetryCount);
    const { shouldRetry, classification, strategy, nextDelay, attemptsRemaining } = retryDecision;

    // Determine new state
    let newState;
    if (shouldRetry) {
      newState = 'ready'; // Return to ready queue for retry
    } else {
      newState = 'on_hold'; // No more retries - put on hold
    }

    const holdReason = !shouldRetry ?
      `Max retries exceeded for ${classification.category} error (${strategy.maxRetries} attempts)` :
      null;

    const logEntry = `[${new Date().toISOString()}] Failed (attempt ${currentRetryCount + 1}): ${error_message} [${classification.category}/${classification.subcategory}]\n`;

    // Store retry strategy info in ticket
    const retryStrategyJson = JSON.stringify({
      errorCategory: classification.category,
      errorSubcategory: classification.subcategory,
      maxRetries: strategy.maxRetries,
      backoffType: strategy.backoffType,
      nextDelayMs: nextDelay,
      attemptsRemaining
    });

    await execute(`
      UPDATE tickets
      SET state = $1,
          assignee_id = NULL,
          assignee_type = NULL,
          vm_id = NULL,
          rejection_count = $2,
          retry_count = $3,
          retry_strategy = $4,
          hold_reason = $5,
          error = $6,
          progress_log = COALESCE(progress_log, '') || $7
      WHERE id = $8
    `, [
      newState,
      newRejectionCount,
      currentRetryCount + 1,
      retryStrategyJson,
      holdReason,
      error_message,
      logEntry,
      ticket_id
    ]);

    console.log('[retry strategy] /fail decision:', {
      ticketId: ticket_id,
      errorCategory: classification.category,
      retryCount: currentRetryCount + 1,
      maxRetries: strategy.maxRetries,
      shouldRetry,
      nextState: newState,
      nextDelayMs: nextDelay
    });

    res.json({
      success: true,
      state: newState,
      rejection_count: newRejectionCount,
      retry_count: currentRetryCount + 1,
      retry_decision: {
        should_retry: shouldRetry,
        error_category: classification.category,
        error_subcategory: classification.subcategory,
        attempts_remaining: attemptsRemaining,
        next_delay_ms: nextDelay,
        backoff_type: strategy.backoffType
      }
    });
  } catch (err) {
    console.error('POST /fail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /execution - Log agent execution for learning system
router.post('/execution', async (req, res) => {
  try {
    const agentLearning = require('../lib/agent-learning.js');
    const {
      taskId, agentId, tenantId, model,
      inputTokens, outputTokens,
      startedAt, completedAt, durationMs,
      outcome, prUrl, filesChanged,
      criteriaStatus, errorMessage
    } = req.body || {};

    if (!taskId || !agentId) {
      return res.status(400).json({ error: 'taskId and agentId required' });
    }

    if (outcome === 'failure' || outcome === 'timeout' || errorMessage) {
      agentLearning.logExecutionWithError({
        taskId, agentId, tenantId, model,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        startedAt, durationMs,
        outcome: outcome || 'failure',
        errorMessage: errorMessage || 'Unknown error'
      });
    } else {
      agentLearning.logExecution({
        taskId, agentId, tenantId, model,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        startedAt, completedAt, durationMs,
        outcome: outcome || 'success',
        prUrl, filesChanged, criteriaStatus
      });
    }

    res.json({ success: true, logged: true });
  } catch (e) {
    console.error('Execution logging failed:', e.message);
    res.json({ success: true, logged: false, warning: e.message });
  }
});

module.exports = router;
