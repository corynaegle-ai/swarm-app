/**
 * HITL (Human-in-the-Loop) routes - PostgreSQL version
 * Full state machine implementation with AI integration
 * 
 * Updated: 2025-12-17 - Migrated to async PostgreSQL
 */

const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { sessionGate, VALID_TRANSITIONS, ACTION_STATES } = require('../middleware/session-gate');
const { dispatcher } = require('../services/ai-dispatcher');
const { broadcast } = require('../websocket');
const { generateTicketsFromSpec } = require('../services/ticket-generator');
const { analyzeRepository } = require('../services/repoAnalysis');
const { checkReposStatus, indexRepository } = require("../services/rag-client");

// GET /api/hitl/meta/states - State machine metadata
router.get('/meta/states', (req, res) => {
  res.json({ 
    transitions: VALID_TRANSITIONS, 
    actions: ACTION_STATES,
    initialState: 'input'
  });
});

// GET /api/hitl - List HITL sessions
router.get('/', async (req, res) => {
  try {
    const { state, limit = 50 } = req.query;
    
    let sql = 'SELECT * FROM hitl_sessions';
    const params = [];
    let paramIdx = 1;
    
    if (state) { 
      sql += ` WHERE state = $${paramIdx++}`; 
      params.push(state); 
    }
    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));
    
    const sessions = await queryAll(sql, params);
    res.json({ sessions });
  } catch (err) {
    console.error('GET /hitl error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/hitl/:sessionId
router.get('/:sessionId', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const messages = await queryAll(`
      SELECT * FROM hitl_messages 
      WHERE session_id = $1 
      ORDER BY created_at ASC
    `, [req.params.sessionId]);
    
    let clarificationContext = {};
    try {
      clarificationContext = session.clarification_context 
        ? JSON.parse(session.clarification_context) 
        : {};
    } catch (e) {}
    
    // Fetch tickets for this session
    const tickets = await queryAll(`
      SELECT id, title, state, priority, created_at, updated_at
      FROM tickets 
      WHERE design_session = $1 
      ORDER BY created_at ASC
    `, [req.params.sessionId]);
    
    res.json({ 
      session: {
        ...session,
        clarificationContext
      }, 
      messages,
      tickets
    });
  } catch (err) {
    console.error('GET /hitl/:sessionId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/hitl - Create new HITL session
router.post("/", async (req, res) => {
  try {
    const { project_name, description, tenant_id, project_type, repo_url, supporting_repos } = req.body;
    if (!project_name) return res.status(400).json({ error: "project_name required" });

    const id = uuidv4();
    
    let finalRepoUrl = repo_url || null;
    if (!finalRepoUrl && project_type === "build_feature" && description) {
      const repoMatch = description.match(/## Main Repository[\s\S]*?\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);
      if (repoMatch) {
        finalRepoUrl = repoMatch[1];
      }
    }
    
    const supportingReposJson = supporting_repos ? JSON.stringify(supporting_repos) : '[]';
    
    await execute(`
      INSERT INTO hitl_sessions (id, tenant_id, project_name, description, state, project_type, repo_url, supporting_repos, created_at)
      VALUES ($1, $2, $3, $4, 'input', $5, $6, $7, CURRENT_TIMESTAMP)
    `, [id, tenant_id, project_name, description, project_type || "application", finalRepoUrl, supportingReposJson]);
    
    // Auto-analyze repo for build_feature
    let analysis = null;
    if (project_type === 'build_feature' && finalRepoUrl) {
      try {
        analysis = await analyzeRepository(finalRepoUrl);
        await execute('UPDATE hitl_sessions SET repo_analysis = $1 WHERE id = $2', [JSON.stringify(analysis), id]);
      } catch (err) {
        console.error('Auto repo analysis failed:', err.message);
      }
    }
    
    broadcast.sessionUpdate(id, "input", 0);
    
    res.status(201).json({ 
      success: true, 
      id, 
      state: "input", 
      repo_url: finalRepoUrl,
      supporting_repos: supporting_repos || [],
      repo_analysis: analysis
    });
  } catch (err) {
    console.error('POST /hitl error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/hitl/:sessionId
router.delete('/:sessionId', async (req, res) => {
  try {
    await execute('DELETE FROM hitl_messages WHERE session_id = $1', [req.params.sessionId]);
    const result = await execute('DELETE FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /hitl/:sessionId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/hitl/:sessionId/analyze-repo
router.post('/:sessionId/analyze-repo', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.project_type !== 'build_feature') return res.status(400).json({ error: 'Not a build_feature session' });
    if (!session.repo_url) return res.status(400).json({ error: 'No repository URL found' });
    
    if (session.repo_analysis) {
      return res.json({ success: true, cached: true, analysis: JSON.parse(session.repo_analysis) });
    }
    
    const analysis = await analyzeRepository(session.repo_url);
    await execute('UPDATE hitl_sessions SET repo_analysis = $1 WHERE id = $2', [JSON.stringify(analysis), req.params.sessionId]);
    
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Repo analysis failed:', error);
    res.status(500).json({ error: 'Repository analysis failed', details: error.message });
  }
});

// POST /api/hitl/:sessionId/respond - User responds to clarification questions
router.post('/:sessionId/respond', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!['input', 'clarifying'].includes(session.state)) {
      return res.status(400).json({ 
        error: `Cannot respond in state '${session.state}'`,
        currentState: session.state,
        allowedStates: ['input', 'clarifying']
      });
    }

    if (session.state === 'input') {
      await execute(`
        UPDATE hitl_sessions 
        SET description = COALESCE(description, '') || $1, state = 'clarifying'
        WHERE id = $2
      `, [message, req.params.sessionId]);
      
      const result = await dispatcher.dispatch(req.params.sessionId, 'clarify', {});
      return res.json(result);
    }

    const result = await dispatcher.dispatch(req.params.sessionId, 'clarify', { userMessage: message });
    res.json(result);
  } catch (error) {
    console.error('Error in respond:', error);
    res.status(500).json({ error: 'Failed to process response', details: error.message });
  }
});

// POST /api/hitl/:sessionId/start-clarification
router.post('/:sessionId/start-clarification', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.state !== 'input') {
      return res.status(400).json({ error: 'Can only start clarification from input state', currentState: session.state });
    }

    await execute(`
      UPDATE hitl_sessions SET state = 'clarifying', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [req.params.sessionId]);

    const result = await dispatcher.dispatch(req.params.sessionId, 'clarify', {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start clarification', details: error.message });
  }
});

// POST /api/hitl/:sessionId/generate-spec
router.post('/:sessionId/generate-spec', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!['clarifying', 'ready_for_docs'].includes(session.state)) {
      return res.status(400).json({ error: 'Can only generate spec from clarifying or ready_for_docs state', currentState: session.state });
    }

    const result = await dispatcher.dispatch(req.params.sessionId, 'generate_spec', {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate spec', details: error.message });
  }
});

// POST /api/hitl/:sessionId/approve
router.post('/:sessionId/approve', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.state !== 'reviewing') {
      return res.status(400).json({ error: 'Can only approve from reviewing state', currentState: session.state });
    }

    const userId = (req.user && req.user.id) || (req.body && req.body.user_id) || null;
    await execute(`
      UPDATE hitl_sessions SET state = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = $1 WHERE id = $2
    `, [userId, req.params.sessionId]);

    broadcast.sessionUpdate(req.params.sessionId, 'approved', 85);
    broadcast.approvalResolved(req.params.sessionId, null, 'approved', userId);
    
    res.json({ success: true, state: 'approved' });
  } catch (err) {
    console.error('POST /hitl/:sessionId/approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/hitl/:sessionId/request-revision
router.post('/:sessionId/request-revision', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback) return res.status(400).json({ error: 'feedback required' });

    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.state !== 'reviewing') {
      return res.status(400).json({ error: 'Can only request revision from reviewing state', currentState: session.state });
    }

    broadcast.sessionUpdate(req.params.sessionId, 'reviewing', session.progress_percent || 60);
    
    const result = await dispatcher.dispatch(req.params.sessionId, 'suggest_edits', { feedback });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process revision', details: error.message });
  }
});

// POST /api/hitl/:sessionId/update-spec
router.post('/:sessionId/update-spec', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.state !== 'reviewing') {
      return res.status(400).json({ error: 'Can only edit spec in reviewing state', currentState: session.state });
    }

    await execute(`
      UPDATE hitl_sessions SET spec_card = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [JSON.stringify(content), req.params.sessionId]);

    broadcast.specGenerated(req.params.sessionId, content);
    res.json({ success: true, spec_card: content });
  } catch (err) {
    console.error('POST /hitl/:sessionId/update-spec error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
      
      await execute(`
        INSERT INTO projects (id, name, description, repo_url, branch, tenant_id, state, type, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        projectId,
        specCard.title || session.project_name || 'Untitled Project',
        specCard.summary || session.description || '',
        session.repo_url || '',
        'main',
        session.tenant_id,
        session.project_type || 'generic'
      ]);
      
      await execute('UPDATE hitl_sessions SET project_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', 
        [projectId, req.params.sessionId]);
      
      console.log(`[start-build] Created project ${projectId} for session ${req.params.sessionId}`);
    }

    // === STEP 2: Transition to building state ===
    await execute(`
      UPDATE hitl_sessions SET state = 'building', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [req.params.sessionId]);

    broadcast.sessionUpdate(req.params.sessionId, 'building', 90);

    // === STEP 3: Generate tickets from spec ===
    const ticketResult = await generateTicketsFromSpec(req.params.sessionId, projectId);
    
    if (!ticketResult.success) {
      await execute(`
        UPDATE hitl_sessions SET state = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1
      `, [req.params.sessionId]);
      
      broadcast.sessionUpdate(req.params.sessionId, 'approved', 80);
      
      return res.status(500).json({ error: 'Ticket generation failed', details: ticketResult.error });
    }

    // === STEP 4: Set tenant_id and activate tickets ===
    await execute(`
      UPDATE tickets SET tenant_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE design_session = $2 AND tenant_id IS NULL
    `, [session.tenant_id, req.params.sessionId]);

    const readyCount = await activateTicketsForBuild(req.params.sessionId);

    console.log(`[start-build] Ticket activation complete for session ${req.params.sessionId}: ${readyCount} tickets set to 'ready' state, assigned to forge-agent, awaiting Engine pickup`);

    // === STEP 5: Broadcast tickets generated ===
    broadcast.ticketsGenerated(req.params.sessionId, { tickets: ticketResult.tickets || [] });
    broadcast.buildProgress(req.params.sessionId, 95, 'Tickets queued for execution', { 
      projectId, 
      readyTickets: readyCount 
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
 * Tickets with no dependencies → 'ready', others → 'blocked'
 */
async function activateTicketsForBuild(sessionId) {
  const tickets = await queryAll(`
    SELECT id, depends_on, state FROM tickets WHERE design_session = $1
  `, [sessionId]);
  
  let readyCount = 0;
  
  for (const ticket of tickets) {
    let deps = [];
    if (ticket.depends_on) {
      try {
        deps = JSON.parse(ticket.depends_on);
      } catch (e) {
        deps = ticket.depends_on.split(',').map(d => d.trim()).filter(Boolean);
      }
    }
    
    const newState = deps.length === 0 ? 'ready' : 'blocked';
    // When setting to 'ready', also assign forge-agent so the Engine can find the ticket
    // Engine polls with: WHERE state='ready' AND assignee_id IS NOT NULL AND assignee_type='agent'
    await execute(`
      UPDATE tickets
      SET state = $1,
          assignee_id = CASE WHEN $1 = 'ready' THEN 'forge' ELSE NULL END,
          assignee_type = CASE WHEN $1 = 'ready' THEN 'agent' ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND state = 'draft'
    `, [newState, ticket.id]);
    
    if (newState === 'ready') readyCount++;
  }
  
  return readyCount;
}

// GET /api/hitl/:sessionId/messages - Get message history
router.get('/:sessionId/messages', async (req, res) => {
  try {
    const messages = await queryAll(`
      SELECT * FROM hitl_messages 
      WHERE session_id = $1 
      ORDER BY created_at ASC
    `, [req.params.sessionId]);
    res.json({ messages });
  } catch (err) {
    console.error('GET /hitl/:sessionId/messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ============================================
// RAG Integration Routes
// ============================================

// GET /api/hitl/:sessionId/rag-status
router.get('/:sessionId/rag-status', async (req, res) => {
  try {
    const session = await queryOne('SELECT repo_url, supporting_repos FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const repoUrls = [];
    if (session.repo_url) repoUrls.push(session.repo_url);
    
    if (session.supporting_repos) {
      try {
        const supporting = typeof session.supporting_repos === 'string' 
          ? JSON.parse(session.supporting_repos) 
          : session.supporting_repos;
        if (Array.isArray(supporting)) {
          repoUrls.push(...supporting.filter(r => r && typeof r === 'string'));
        }
      } catch (e) {}
    }

    if (repoUrls.length === 0) {
      return res.json({ success: true, repos: {}, allIndexed: true, message: 'No repositories configured' });
    }

    const result = await checkReposStatus(repoUrls);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to check RAG status' });
    }

    const statuses = Object.values(result.status);
    const allIndexed = statuses.every(s => s.indexed);

    res.json({
      success: true,
      repos: result.status,
      allIndexed,
      indexingCount: statuses.filter(s => s.status === 'indexing').length,
      notFoundCount: statuses.filter(s => s.status === 'not_found').length,
      totalRepos: repoUrls.length
    });
  } catch (err) {
    console.error('GET /hitl/:id/rag-status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hitl/:sessionId/index-repos
router.post('/:sessionId/index-repos', async (req, res) => {
  try {
    const session = await queryOne('SELECT repo_url, supporting_repos FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const repoUrls = [];
    if (session.repo_url) repoUrls.push(session.repo_url);
    
    if (session.supporting_repos) {
      try {
        const supporting = typeof session.supporting_repos === 'string' 
          ? JSON.parse(session.supporting_repos) 
          : session.supporting_repos;
        if (Array.isArray(supporting)) {
          repoUrls.push(...supporting.filter(r => r && typeof r === 'string'));
        }
      } catch (e) {}
    }

    if (repoUrls.length === 0) {
      return res.json({ success: true, message: 'No repositories to index' });
    }

    const statusResult = await checkReposStatus(repoUrls);
    if (!statusResult.success) {
      return res.status(500).json({ error: 'Failed to check repo status' });
    }

    const indexingResults = [];
    for (const [url, status] of Object.entries(statusResult.status)) {
      if (status.status === 'not_found' || status.status === 'error') {
        console.log('[HITL] Triggering RAG index for:', url);
        const result = await indexRepository(url);
        indexingResults.push({ url, triggered: result.success, error: result.error });
      } else if (status.status === 'indexing') {
        indexingResults.push({ url, triggered: false, status: 'already_indexing' });
      } else {
        indexingResults.push({ url, triggered: false, status: 'already_indexed' });
      }
    }

    const anyTriggered = indexingResults.some(r => r.triggered);
    if (anyTriggered) {
      await execute('UPDATE hitl_sessions SET state = $1, updated_at = NOW() WHERE id = $2', ['indexing_repos', req.params.sessionId]);
      broadcast.sessionUpdate(req.params.sessionId, 'indexing_repos', 0);
    }

    res.json({ success: true, results: indexingResults, state: anyTriggered ? 'indexing_repos' : 'ready' });
  } catch (err) {
    console.error('POST /hitl/:id/index-repos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hitl/:sessionId/indexing-progress
router.get('/:sessionId/indexing-progress', async (req, res) => {
  try {
    const session = await queryOne('SELECT repo_url, supporting_repos, state FROM hitl_sessions WHERE id = $1', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const repoUrls = [];
    if (session.repo_url) repoUrls.push(session.repo_url);
    
    if (session.supporting_repos) {
      try {
        const supporting = typeof session.supporting_repos === 'string' 
          ? JSON.parse(session.supporting_repos) 
          : session.supporting_repos;
        if (Array.isArray(supporting)) {
          repoUrls.push(...supporting.filter(r => r && typeof r === 'string'));
        }
      } catch (e) {}
    }

    const statusResult = await checkReposStatus(repoUrls);
    if (!statusResult.success) {
      return res.status(500).json({ error: 'Failed to check status' });
    }

    const statuses = Object.entries(statusResult.status);
    let totalPercent = 0;
    const repoProgress = [];

    for (const [url, status] of statuses) {
      const progress = status.progress || {};
      const percent = status.indexed ? 100 : (progress.percent || 0);
      totalPercent += percent;
      
      repoProgress.push({
        url,
        name: url.split('/').pop()?.replace('.git', '') || url,
        status: status.status,
        indexed: status.indexed,
        percent,
        phase: progress.phase || (status.indexed ? 'complete' : 'pending'),
        chunkCount: status.chunkCount || 0
      });
    }

    const overallPercent = statuses.length > 0 ? Math.round(totalPercent / statuses.length) : 100;
    const allComplete = repoProgress.every(r => r.indexed);

    if (allComplete && session.state === 'indexing_repos') {
      await execute('UPDATE hitl_sessions SET state = $1, updated_at = NOW() WHERE id = $2', ['input', req.params.sessionId]);
      broadcast.sessionUpdate(req.params.sessionId, 'input', 0);
    }

    res.json({ success: true, overallPercent, allComplete, repos: repoProgress, sessionState: allComplete ? 'input' : session.state });
  } catch (err) {
    console.error('GET /hitl/:id/indexing-progress error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
