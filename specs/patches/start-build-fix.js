/**
 * Fixed start-build endpoint for hitl.js
 * 
 * Fixes:
 * 1. Correct project INSERT columns (was using non-existent hitl_session_id, status)
 * 2. Sets repo_url from session for build_feature projects
 * 3. Transitions tickets from 'draft' to 'ready' or 'blocked' based on dependencies
 * 4. Adds tenant_id to tickets for proper isolation
 * 5. Broadcasts build events for dashboard updates
 * 
 * To apply: Replace the existing start-build route in /opt/swarm-platform/routes/hitl.js
 */

// POST /api/hitl/:sessionId/start-build - Trigger ticket generation and start Engine execution
router.post('/:sessionId/start-build', async (req, res) => {
  try {
    const { confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({ error: 'User confirmation required', hint: 'Send { confirmed: true }' });
    }

    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.state !== 'approved') {
      return res.status(400).json({ 
        error: 'Can only start build from approved state', 
        currentState: session.state,
        allowedStates: ['approved']
      });
    }

    if (!session.spec_card) {
      return res.status(400).json({ error: 'No spec_card found - generate spec first' });
    }

    // Parse spec card
    let specCard;
    try {
      specCard = JSON.parse(session.spec_card);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid spec_card JSON' });
    }

    // === STEP 1: Create or get project ===
    let projectId = session.project_id;
    
    if (!projectId) {
      projectId = uuidv4();
      
      // Build project record with correct schema columns
      await execute(`
        INSERT INTO projects (id, name, description, repo_url, branch, tenant_id, state, type, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        projectId,
        specCard.title || session.project_name || 'Untitled Project',
        specCard.summary || session.description || '',
        session.repo_url || '',  // Use repo_url from session (important for build_feature)
        'main',
        session.tenant_id,
        session.project_type || 'generic'
      ]);
      
      // Link session to project
      await execute('UPDATE hitl_sessions SET project_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', 
        [projectId, req.params.sessionId]);
      
      console.log(`[start-build] Created project ${projectId} for session ${req.params.sessionId}`);
    }

    // === STEP 2: Transition to building state ===
    await execute(`
      UPDATE hitl_sessions 
      SET state = 'building', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [req.params.sessionId]);

    broadcast.sessionUpdate(req.params.sessionId, 'building', 90);

    // === STEP 3: Generate tickets from spec ===
    const ticketResult = await generateTicketsFromSpec(req.params.sessionId, projectId);
    
    if (!ticketResult.success) {
      // Rollback state on failure
      await execute(`
        UPDATE hitl_sessions 
        SET state = 'approved', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [req.params.sessionId]);
      
      broadcast.sessionUpdate(req.params.sessionId, 'approved', 80);
      
      return res.status(500).json({ 
        error: 'Ticket generation failed', 
        details: ticketResult.error 
      });
    }

    // === STEP 4: Set tenant_id on all tickets and compute ready states ===
    // Update tenant_id for all generated tickets
    await execute(`
      UPDATE tickets 
      SET tenant_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE design_session = $2 AND tenant_id IS NULL
    `, [session.tenant_id, req.params.sessionId]);

    // Compute and set ticket states based on dependencies
    // Tickets with no dependencies → 'ready'
    // Tickets with dependencies → 'blocked'
    const readyCount = await activateTickets(projectId, req.params.sessionId);
    
    // === STEP 5: Broadcast build started event ===
    broadcast.buildStarted(req.params.sessionId, {
      projectId,
      ticketCount: ticketResult.count,
      readyTickets: readyCount,
      repoUrl: session.repo_url
    });

    console.log(`[start-build] Build started: ${ticketResult.count} tickets, ${readyCount} ready for Engine`);

    res.json({ 
      success: true, 
      state: 'building',
      message: `Build started. ${ticketResult.count} tickets generated, ${readyCount} ready for execution.`,
      session_id: req.params.sessionId,
      project_id: projectId,
      ticket_count: ticketResult.count,
      ready_count: readyCount,
      engine_status: 'Tickets queued - Engine will pick them up on next poll cycle'
    });

  } catch (err) {
    console.error('POST /hitl/:sessionId/start-build error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


/**
 * Activate tickets for execution
 * - Tickets with no dependencies → 'ready'
 * - Tickets with unresolved dependencies → 'blocked'
 * 
 * @param {string} projectId - Project ID
 * @param {string} sessionId - HITL session ID
 * @returns {number} Count of tickets set to ready
 */
async function activateTickets(projectId, sessionId) {
  // Get all tickets for this session
  const tickets = await queryAll(`
    SELECT id, depends_on, state FROM tickets 
    WHERE design_session = $1
  `, [sessionId]);
  
  let readyCount = 0;
  
  for (const ticket of tickets) {
    // Parse dependencies
    let deps = [];
    if (ticket.depends_on) {
      try {
        deps = JSON.parse(ticket.depends_on);
      } catch (e) {
        deps = ticket.depends_on.split(',').map(d => d.trim()).filter(Boolean);
      }
    }
    
    if (deps.length === 0) {
      // No dependencies - set to ready
      await execute(`
        UPDATE tickets 
        SET state = 'ready', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND state = 'draft'
      `, [ticket.id]);
      readyCount++;
    } else {
      // Has dependencies - set to blocked
      await execute(`
        UPDATE tickets 
        SET state = 'blocked', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND state = 'draft'
      `, [ticket.id]);
    }
  }
  
  return readyCount;
}
