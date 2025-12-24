/**
 * Backlog API Routes
 * 
 * Lightweight idea staging area before HITL sessions.
 * ZERO breaking changes to existing HITL workflow.
 * 
 * State Machine: draft → chatting → refined → promoted (or archived)
 */

const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { broadcast } = require('../websocket');
const { chat } = require('../services/claude-client');
const { fetchContext } = require('../services/rag-client');
const RAG_BASE_URL = process.env.RAG_URL || 'http://localhost:8082';

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_STATES = ['draft', 'chatting', 'refined', 'promoted', 'archived'];
const VALID_PRIORITIES = [0, 1, 2]; // 0=low, 1=medium, 2=high
const CHAT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify tenant access to backlog item
 */
async function getBacklogItem(id, tenantId) {
  return queryOne(
    'SELECT * FROM backlog_items WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
}


/**
 * Fetch RAG context for a backlog item based on its repo_url
 */
async function fetchBacklogRagContext(item, query) {
  if (!item.repo_url) {
    return { context: '', files: [], success: false, reason: 'no_repo_url' };
  }
  
  try {
    const result = await fetchContext(query, [item.repo_url], { maxTokens: 4000 });
    console.log(`[RAG] Backlog context: ${result.success ? result.tokenCount + ' tokens' : result.reason}`);
    return result;
  } catch (error) {
    console.error('[RAG] Error fetching backlog context:', error.message);
    return { context: '', files: [], success: false, reason: error.message };
  }
}

/**
 * Generate initial clarifying message based on backlog item
 */
function generateClarifyingPrompt(item, ragContext = '') {
  let systemPrompt = `You are a technical product clarifier helping refine a project idea.

The user has submitted this idea to their backlog:
Title: ${item.title}
Description: ${item.description || 'No description provided'}`;

  if (item.repo_url) {
    systemPrompt += `
Repository: ${item.repo_url}`;
  }

  if (ragContext) {
    systemPrompt += `

The following code context from the repository may be relevant:

<repository_context>
${ragContext}
</repository_context>

Use this context to ask informed questions about the codebase.`;
  }

  systemPrompt += `

Your goal is to ask 2-3 focused clarifying questions to better understand:
1. The core problem being solved
2. Key technical requirements or constraints  
3. Success criteria

Be conversational and helpful. Don't overwhelm with too many questions at once.
When relevant, reference specific files or patterns from the repository context.`;

  return systemPrompt;
}


// ============================================================================
// REPOSITORY ENDPOINTS
// ============================================================================

/**
 * GET /api/backlog/repos - List available repositories from RAG service
 */
router.get('/repos', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${RAG_BASE_URL}/api/rag/repositories`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch repositories from RAG service' });
    }
    
    const data = await response.json();
    
    // Return only essential fields for the dropdown - filter to ready repos only
    const repos = (data.repositories || [])
      .filter(r => r.index_status === 'ready')
      .map(r => ({
        id: r.id,
        url: r.url,
        name: r.name,
        chunk_count: r.chunk_count
      }));
    
    res.json({ repos });
  } catch (err) {
    console.error('GET /api/backlog/repos error:', err);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// ============================================================================
// CRUD ENDPOINTS
// ============================================================================

/**
 * POST /api/backlog - Create new backlog item
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, labels, priority, project_id, repo_url } = req.body;
    const tenantId = req.user.tenant_id;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (title.length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }
    
    const itemPriority = VALID_PRIORITIES.includes(priority) ? priority : 0;
    const itemLabels = Array.isArray(labels) ? labels : [];
    
    const id = uuidv4();
    
    // Get max rank for ordering
    const maxRank = await queryOne(
      'SELECT COALESCE(MAX(rank), 0) + 1 as next_rank FROM backlog_items WHERE tenant_id = $1',
      [tenantId]
    );
    
    await execute(`
      INSERT INTO backlog_items (id, tenant_id, title, description, labels, priority, rank, project_id, repo_url, created_by, state)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
    `, [id, tenantId, title.trim(), description || null, JSON.stringify(itemLabels), itemPriority, maxRank.next_rank, project_id || null, repo_url || null, req.user.id]);
    
    const item = await getBacklogItem(id, tenantId);
    
    // Broadcast to tenant's backlog room
    broadcast.toRoom(`backlog:${tenantId}`, 'backlog:created', {
      id: item.id,
      title: item.title,
      state: item.state,
      priority: item.priority,
      repo_url: item.repo_url
    });
    
    res.status(201).json(item);
  } catch (err) {
    console.error('POST /api/backlog error:', err);
    res.status(500).json({ error: 'Failed to create backlog item' });
  }
});

/**
 * GET /api/backlog - List backlog items for tenant
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { state, priority, label, search, limit = 50, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM backlog_items WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;
    
    // Filter by state
    if (state && VALID_STATES.includes(state)) {
      sql += ` AND state = $${paramIndex++}`;
      params.push(state);
    } else {
      // Default: exclude archived and promoted
      sql += ` AND state NOT IN ('archived', 'promoted')`;
    }
    
    // Filter by priority
    if (priority !== undefined && VALID_PRIORITIES.includes(parseInt(priority))) {
      sql += ` AND priority = $${paramIndex++}`;
      params.push(parseInt(priority));
    }
    
    // Filter by label (JSONB containment)
    if (label) {
      sql += ` AND labels @> $${paramIndex++}::jsonb`;
      params.push(JSON.stringify([label]));
    }
    
    // Full-text search
    if (search && search.trim().length > 0) {
      sql += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }
    
    // Order by priority (high first), then rank
    sql += ' ORDER BY priority DESC, rank ASC';
    
    // Pagination
    sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const items = await queryAll(sql, params);
    
    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM backlog_items WHERE tenant_id = $1';
    const countParams = [tenantId];
    if (state && VALID_STATES.includes(state)) {
      countSql += ' AND state = $2';
      countParams.push(state);
    } else {
      countSql += ` AND state NOT IN ('archived', 'promoted')`;
    }
    const countResult = await queryOne(countSql, countParams);
    
    res.json({
      items,
      total: parseInt(countResult.total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('GET /api/backlog error:', err);
    res.status(500).json({ error: 'Failed to list backlog items' });
  }
});

/**
 * GET /api/backlog/:id - Get single backlog item
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    res.json(item);
  } catch (err) {
    console.error('GET /api/backlog/:id error:', err);
    res.status(500).json({ error: 'Failed to get backlog item' });
  }
});

/**
 * PATCH /api/backlog/:id - Update backlog item
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    // Can't edit promoted items
    if (item.state === 'promoted') {
      return res.status(400).json({ error: 'Cannot edit promoted items' });
    }
    
    const { title, description, labels, priority, rank, project_id, repo_url } = req.body;
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      if (title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updates.push(`title = $${paramIndex++}`);
      params.push(title.trim());
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    
    if (labels !== undefined && Array.isArray(labels)) {
      updates.push(`labels = $${paramIndex++}`);
      params.push(JSON.stringify(labels));
    }
    
    if (priority !== undefined && VALID_PRIORITIES.includes(priority)) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    
    if (rank !== undefined) {
      updates.push(`rank = $${paramIndex++}`);
      params.push(rank);
    }
    
    if (project_id !== undefined) {
      updates.push(`project_id = ${paramIndex++}`);
      params.push(project_id);
    }
    
    if (repo_url !== undefined) {
      updates.push(`repo_url = ${paramIndex++}`);
      params.push(repo_url);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    params.push(req.params.id, req.user.tenant_id);
    await execute(
      `UPDATE backlog_items SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
      params
    );
    
    const updated = await getBacklogItem(req.params.id, req.user.tenant_id);
    
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:updated', {
      id: updated.id,
      changes: req.body
    });
    
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/backlog/:id error:', err);
    res.status(500).json({ error: 'Failed to update backlog item' });
  }
});

/**
 * DELETE /api/backlog/:id - Archive backlog item (soft delete)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (item.state === 'promoted') {
      return res.status(400).json({ error: 'Cannot delete promoted items' });
    }
    
    await execute(
      `UPDATE backlog_items SET state = 'archived' WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.tenant_id]
    );
    
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:archived', {
      id: req.params.id
    });
    
    res.json({ success: true, message: 'Backlog item archived' });
  } catch (err) {
    console.error('DELETE /api/backlog/:id error:', err);
    res.status(500).json({ error: 'Failed to archive backlog item' });
  }
});


// ============================================================================
// CHAT ENDPOINTS
// ============================================================================

/**
 * POST /api/backlog/:id/start-chat - Begin clarifying chat session
 */
router.post('/:id/start-chat', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (!['draft', 'refined'].includes(item.state)) {
      return res.status(400).json({ 
        error: `Cannot start chat from ${item.state} state`,
        allowedStates: ['draft', 'refined']
      });
    }
    
    // Fetch RAG context if repo_url is set
    let ragContext = '';
    if (item.repo_url) {
      const ragResult = await fetchBacklogRagContext(item, `Feature: ${item.title}. ${item.description || ''}`);
      if (ragResult.success) {
        ragContext = ragResult.context;
      }
    }
    
    // Generate initial AI message with RAG context
    const systemPrompt = generateClarifyingPrompt(item, ragContext);
    const aiResult = await chat({ messages: [
      { role: 'user', content: 'Please start the clarification conversation.' }
    ], system: systemPrompt });
    
    const initialMessage = {
      role: 'assistant',
      content: aiResult.success ? aiResult.content : "AI error: " + aiResult.error,
      timestamp: new Date().toISOString()
    };
    
    // Update item state and save first message
    await execute(`
      UPDATE backlog_items 
      SET state = 'chatting', 
          chat_transcript = $1,
          chat_started_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3
    `, [JSON.stringify([initialMessage]), req.params.id, req.user.tenant_id]);
    
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:updated', {
      id: req.params.id,
      changes: { state: 'chatting' }
    });
    
    // Fetch updated item to return to client
    const updatedItem = await getBacklogItem(req.params.id, req.user.tenant_id);
    
    res.json({
      success: true,
      item: updatedItem,
      chat_history: [initialMessage]
    });
  } catch (err) {
    console.error('POST /api/backlog/:id/start-chat error:', err);
    res.status(500).json({ error: 'Failed to start chat' });
  }
});

/**
 * POST /api/backlog/:id/chat - Send message in active chat
 */
router.post('/:id/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (item.state !== 'chatting') {
      return res.status(400).json({ 
        error: `Cannot chat in ${item.state} state`,
        hint: 'Call /start-chat first'
      });
    }
    
    // Parse existing transcript
    const transcript = Array.isArray(item.chat_transcript) 
      ? item.chat_transcript 
      : JSON.parse(item.chat_transcript || '[]');
    
    // Add user message
    const userMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };
    transcript.push(userMessage);
    
    // Build messages for Claude (convert to Claude format)
    const claudeMessages = transcript.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
    
    // Fetch RAG context if repo_url is set (use conversation context for query)
    let ragContext = '';
    if (item.repo_url) {
      // Use the last user message + title for more relevant context
      const contextQuery = `Feature: ${item.title}. User question: ${message.trim()}`;
      const ragResult = await fetchBacklogRagContext(item, contextQuery);
      if (ragResult.success) {
        ragContext = ragResult.context;
      }
    }
    
    // Get AI response with RAG context
    const systemPrompt = generateClarifyingPrompt(item, ragContext);
    const aiResult2 = await chat({ messages: claudeMessages, system: systemPrompt });
    const aiContent = aiResult2.success ? aiResult2.content : "AI error: " + aiResult2.error;
    
    const aiMessage = {
      role: 'assistant',
      content: aiContent,
      timestamp: new Date().toISOString()
    };
    transcript.push(aiMessage);
    
    // Update transcript
    await execute(`
      UPDATE backlog_items SET chat_transcript = $1 WHERE id = $2 AND tenant_id = $3
    `, [JSON.stringify(transcript), req.params.id, req.user.tenant_id]);
    
    // Broadcast new message
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:chat_message', {
      backlogId: req.params.id,
      messages: [userMessage, aiMessage]
    });
    
    res.json({
      user_message: userMessage,
      ai_response: aiMessage,
      transcript_length: transcript.length,
      chat_history: transcript
    });
  } catch (err) {
    console.error('POST /api/backlog/:id/chat error:', err);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

/**
 * POST /api/backlog/:id/end-chat - End chat and generate summary
 */
router.post('/:id/end-chat', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (item.state !== 'chatting') {
      return res.status(400).json({ error: 'Not currently chatting' });
    }
    
    const transcript = Array.isArray(item.chat_transcript) 
      ? item.chat_transcript 
      : JSON.parse(item.chat_transcript || '[]');
    
    // Generate summary if there's meaningful conversation
    let summary = null;
    let enrichedDescription = item.description;
    
    if (transcript.length >= 2) {
      const summaryPrompt = `Based on this conversation about a project idea, provide:
1. A brief summary (2-3 sentences) of key decisions made
2. An enriched description incorporating the clarified requirements

Original idea: ${item.title}
Original description: ${item.description || 'None'}

Conversation:
${transcript.map(m => `${m.role}: ${m.content}`).join('\n\n')}

Respond in JSON format:
{
  "summary": "...",
  "enriched_description": "..."
}`;

      try {
        const summaryResult = await chat({ messages: [
          { role: 'user', content: summaryPrompt }
        ], system: 'You are a technical product analyst. Respond only with valid JSON.' });
        
        const parsed = JSON.parse(summaryResult.content);
        summary = parsed.summary;
        enrichedDescription = parsed.enriched_description || item.description;
      } catch (parseErr) {
        console.warn('Failed to parse summary response, using fallback');
        summary = 'Chat session completed.';
      }
    }
    
    // Update to refined state
    await execute(`
      UPDATE backlog_items 
      SET state = 'refined',
          chat_summary = $1,
          enriched_description = $2
      WHERE id = $3 AND tenant_id = $4
    `, [summary, enrichedDescription, req.params.id, req.user.tenant_id]);
    
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:updated', {
      id: req.params.id,
      changes: { state: 'refined', chat_summary: summary }
    });
    
    // Fetch updated item to return to client
    const updatedItem = await getBacklogItem(req.params.id, req.user.tenant_id);
    
    res.json({
      success: true,
      item: updatedItem
    });
  } catch (err) {
    console.error('POST /api/backlog/:id/end-chat error:', err);
    res.status(500).json({ error: 'Failed to end chat' });
  }
});

// ============================================================================
// PROMOTION ENDPOINT

/**
 * POST /api/backlog/:id/abandon-chat - Abandon chat and return to draft state
 * Clears chat transcript and resets item to draft
 */
router.post('/:id/abandon-chat', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (item.state !== 'chatting') {
      return res.status(400).json({ error: 'Item is not in chatting state' });
    }
    
    await execute(`
      UPDATE backlog_items 
      SET state = 'draft', 
          chat_transcript = NULL,
          chat_started_at = NULL
      WHERE id = $1 AND tenant_id = $2
    `, [req.params.id, req.user.tenant_id]);
    
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:updated', {
      id: req.params.id,
      changes: { state: 'draft' }
    });
    
    // Fetch updated item to return to client
    const updatedItem = await getBacklogItem(req.params.id, req.user.tenant_id);
    
    res.json({
      success: true,
      item: updatedItem
    });
  } catch (err) {
    console.error('POST /api/backlog/:id/abandon-chat error:', err);
    res.status(500).json({ error: 'Failed to abandon chat' });
  }
});
// ============================================================================

/**
 * POST /api/backlog/:id/promote - Convert backlog item to HITL session
 * 
 * This is the key integration point. It creates a new HITL session
 * seeded with the backlog item's content, WITHOUT breaking the existing
 * HITL workflow.
 */
router.post('/:id/promote', requireAuth, async (req, res) => {
  try {
    const { skip_clarification = false } = req.body || {};
    
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (!['draft', 'refined'].includes(item.state)) {
      return res.status(400).json({ 
        error: `Cannot promote from ${item.state} state`,
        allowedStates: ['draft', 'refined']
      });
    }
    
    // Create HITL session with backlog context
    const sessionId = uuidv4();
    const initialState = skip_clarification ? 'ready_for_docs' : 'input';
    
    // Use enriched description if available, otherwise original
    const description = item.enriched_description || item.description || '';
    
    // Build initial chat history from backlog transcript
    let chatHistory = [];
    if (item.chat_transcript && item.chat_transcript.length > 0) {
      const transcript = Array.isArray(item.chat_transcript) 
        ? item.chat_transcript 
        : JSON.parse(item.chat_transcript);
      chatHistory = transcript.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      }));
    }
    
    // Create the HITL session
    await execute(`
      INSERT INTO hitl_sessions (
        id, tenant_id, type, state, project_name, description, 
        chat_history, source_type, backlog_item_id, created_at, updated_at
      ) VALUES ($1, $2, 'design', $3, $4, $5, $6, 'backlog', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      sessionId,
      req.user.tenant_id,
      initialState,
      item.title,
      description,
      JSON.stringify(chatHistory),
      req.params.id
    ]);
    
    // Update backlog item to promoted state
    await execute(`
      UPDATE backlog_items 
      SET state = 'promoted',
          hitl_session_id = $1,
          promoted_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3
    `, [sessionId, req.params.id, req.user.tenant_id]);
    
    // Broadcast events
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:promoted', {
      backlogId: req.params.id,
      hitlSessionId: sessionId
    });
    
    broadcast.toRoom(`tenant:${req.user.tenant_id}`, 'session:created', {
      id: sessionId,
      state: initialState,
      source: 'backlog',
      projectName: item.title
    });
    
    res.json({
      success: true,
      backlog_state: 'promoted',
      session: {
        id: sessionId,
        state: initialState,
        source_type: 'backlog',
        backlog_item_id: req.params.id,
        project_name: item.title
      }
    });
  } catch (err) {
    console.error('POST /api/backlog/:id/promote error:', err);
    res.status(500).json({ error: 'Failed to promote backlog item' });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * POST /api/backlog/reorder - Bulk update ranks for drag-drop reordering
 */
router.post('/reorder', requireAuth, async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, rank, priority? }
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    // Update each item's rank (and optionally priority)
    for (const item of items) {
      if (!item.id || typeof item.rank !== 'number') continue;
      
      let sql = 'UPDATE backlog_items SET rank = $1';
      const params = [item.rank];
      
      if (item.priority !== undefined && VALID_PRIORITIES.includes(item.priority)) {
        sql += ', priority = $2 WHERE id = $3 AND tenant_id = $4';
        params.push(item.priority, item.id, req.user.tenant_id);
      } else {
        sql += ' WHERE id = $2 AND tenant_id = $3';
        params.push(item.id, req.user.tenant_id);
      }
      
      await execute(sql, params);
    }
    
    broadcast.toRoom(`backlog:${req.user.tenant_id}`, 'backlog:reordered', {
      count: items.length
    });
    
    res.json({ success: true, updated: items.length });
  } catch (err) {
    console.error('POST /api/backlog/reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder items' });
  }
});

/**
 * POST /api/backlog/bulk-label - Add/remove labels from multiple items
 */
router.post('/bulk-label', requireAuth, async (req, res) => {
  try {
    const { item_ids, add_labels = [], remove_labels = [] } = req.body;
    
    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids array is required' });
    }
    
    for (const itemId of item_ids) {
      const item = await getBacklogItem(itemId, req.user.tenant_id);
      if (!item) continue;
      
      let labels = Array.isArray(item.labels) 
        ? item.labels 
        : JSON.parse(item.labels || '[]');
      
      // Add new labels
      for (const label of add_labels) {
        if (!labels.includes(label)) {
          labels.push(label);
        }
      }
      
      // Remove labels
      labels = labels.filter(l => !remove_labels.includes(l));
      
      await execute(
        'UPDATE backlog_items SET labels = $1 WHERE id = $2 AND tenant_id = $3',
        [JSON.stringify(labels), itemId, req.user.tenant_id]
      );
    }
    
    res.json({ success: true, updated: item_ids.length });
  } catch (err) {
    console.error('POST /api/backlog/bulk-label error:', err);
    res.status(500).json({ error: 'Failed to update labels' });
  }
});


// ============================================================================
// ATTACHMENT ENDPOINTS
// ============================================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = `/opt/swarm-app/uploads/${req.user.tenant_id}/${req.params.id}`;
    try {
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});


const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});


/**
 * GET /api/backlog/:id/attachments - List attachments for a backlog item
 */
router.get('/:id/attachments', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    const attachments = await queryAll(`
      SELECT id, attachment_type, name, url, mime_type, file_size, git_metadata, created_at
      FROM backlog_attachments 
      WHERE backlog_item_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `, [req.params.id, req.user.tenant_id]);
    
    res.json({ attachments });
  } catch (err) {
    console.error('GET /api/backlog/:id/attachments error:', err);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});


/**
 * POST /api/backlog/:id/attachments/file - Upload a file attachment
 */
router.post('/:id/attachments/file', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const attachmentId = uuidv4();
    const fileUrl = `/uploads/${req.user.tenant_id}/${req.params.id}/${req.file.filename}`;
    
    await execute(`
      INSERT INTO backlog_attachments 
        (id, backlog_item_id, tenant_id, attachment_type, name, url, mime_type, file_size, created_by)
      VALUES ($1, $2, $3, 'file', $4, $5, $6, $7, $8)
    `, [
      attachmentId, req.params.id, req.user.tenant_id,
      req.file.originalname, fileUrl, req.file.mimetype, req.file.size, req.user.id
    ]);
    
    const attachment = await queryOne('SELECT * FROM backlog_attachments WHERE id = $1', [attachmentId]);
    res.status(201).json({ attachment });
  } catch (err) {
    console.error('POST /api/backlog/:id/attachments/file error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});


/**
 * POST /api/backlog/:id/attachments/link - Add a link (git or external)
 */
router.post('/:id/attachments/link', requireAuth, async (req, res) => {
  try {
    const item = await getBacklogItem(req.params.id, req.user.tenant_id);
    if (!item) {
      return res.status(404).json({ error: 'Backlog item not found' });
    }
    
    const { url, name } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Determine if this is a git link
    const gitPatterns = [
      /github\.com\/([^\/]+)\/([^\/]+)/,
      /gitlab\.com\/([^\/]+)\/([^\/]+)/,
      /bitbucket\.org\/([^\/]+)\/([^\/]+)/
    ];
    
    let attachmentType = 'external_link';
    let gitMetadata = null;
    
    for (const pattern of gitPatterns) {
      const match = url.match(pattern);
      if (match) {
        attachmentType = 'git_link';
        gitMetadata = {
          owner: match[1],
          repo: match[2],
          platform: url.includes('github') ? 'github' : url.includes('gitlab') ? 'gitlab' : 'bitbucket',
          type: url.includes('/pull/') || url.includes('/merge_requests/') ? 'pr' :
                url.includes('/issues/') ? 'issue' : url.includes('/commit/') ? 'commit' : 'repo'
        };
        break;
      }
    }
    
    const attachmentId = uuidv4();
    const displayName = name?.trim() || (gitMetadata ? `${gitMetadata.owner}/${gitMetadata.repo}` : url);
    
    await execute(`
      INSERT INTO backlog_attachments 
        (id, backlog_item_id, tenant_id, attachment_type, name, url, git_metadata, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      attachmentId, req.params.id, req.user.tenant_id, attachmentType,
      displayName, url.trim(), gitMetadata ? JSON.stringify(gitMetadata) : null, req.user.id
    ]);
    
    const attachment = await queryOne('SELECT * FROM backlog_attachments WHERE id = $1', [attachmentId]);
    res.status(201).json({ attachment });
  } catch (err) {
    console.error('POST /api/backlog/:id/attachments/link error:', err);
    res.status(500).json({ error: 'Failed to add link' });
  }
});


/**
 * DELETE /api/backlog/:id/attachments/:attachmentId - Remove an attachment
 */
router.delete('/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
  try {
    const attachment = await queryOne(`
      SELECT * FROM backlog_attachments 
      WHERE id = $1 AND backlog_item_id = $2 AND tenant_id = $3 AND deleted_at IS NULL
    `, [req.params.attachmentId, req.params.id, req.user.tenant_id]);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    // Soft delete
    await execute('UPDATE backlog_attachments SET deleted_at = NOW() WHERE id = $1', [req.params.attachmentId]);
    
    // Delete file from disk if it's a file attachment
    if (attachment.attachment_type === 'file') {
      const filePath = `/opt/swarm-app${attachment.url}`;
      try {
        await fs.unlink(filePath);
      } catch (e) {
        console.warn('Could not delete file:', filePath, e.message);
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/backlog/:id/attachments/:attachmentId error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

module.exports = router;
