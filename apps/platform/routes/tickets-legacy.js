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

    await execute(`
      UPDATE tickets 
      SET state = 'in_review', 
          completed_at = NOW(),
          pr_url = $1,
          branch_name = $2,
          files_involved = $3,
          outputs = $4,
          verification_status = 'pending'
      WHERE id = $5
    `, [
      pr_url || null,
      branch_name || null,
      files_involved ? JSON.stringify(files_involved) : null,
      outputs ? JSON.stringify(outputs) : null,
      ticket_id
    ]);
    
    res.json({ success: true, state: 'in_review' });
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
          assignee_id = NULL,
          assignee_type = NULL,
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
