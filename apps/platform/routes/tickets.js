/**
 * Ticket routes - PostgreSQL version
 * Migrated from SQLite to async PostgreSQL
 */

const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const { broadcast } = require('../websocket');
// =============================================================================
// STATIC ROUTES (must come before /:id to avoid param capture)
// =============================================================================

// GET /api/tickets - List tickets (with tenant isolation via projects)
router.get('/', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { state, project_id, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE p.tenant_id = $1
    `;
    const params = [req.tenantId];
    let paramIdx = 2;
    
    if (state) { 
      sql += ` AND t.state = $${paramIdx++}`; 
      params.push(state); 
    }
    if (project_id) { 
      sql += ` AND t.project_id = $${paramIdx++}`; 
      params.push(project_id); 
    }
    
    sql += ` ORDER BY t.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const tickets = await queryAll(sql, params);
    res.json({ tickets, count: tickets.length });
  } catch (err) {
    console.error('GET /tickets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/stats - Ticket statistics (tenant-isolated)
router.get('/stats', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const stats = await queryAll(`
      SELECT t.state, COUNT(*)::int as count 
      FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE p.tenant_id = $1
      GROUP BY t.state
    `, [req.tenantId]);
    
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    res.json({ total, byState: Object.fromEntries(stats.map(s => [s.state, s.count])) });
  } catch (err) {
    console.error('GET /tickets/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/needs-review - List tickets needing review (tenant-isolated)
router.get('/needs-review', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const tickets = await queryAll(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE p.tenant_id = $1 AND t.state = 'needs_review'
      ORDER BY t.updated_at DESC
    `, [req.tenantId]);
    res.json({ tickets, count: tickets.length });
  } catch (err) {
    console.error('GET /tickets/needs-review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/stuck - List tickets stuck in progress states (tenant-isolated)
// Returns tickets in 'assigned' or 'in_progress' state for >5 minutes without update
router.get('/stuck', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { threshold_minutes = 5 } = req.query;
    const thresholdMs = parseInt(threshold_minutes) * 60 * 1000;

    const tickets = await queryAll(`
      SELECT t.*,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.updated_at)) * 1000 as stuck_duration_ms
      FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE p.tenant_id = $1
        AND t.state IN ('assigned', 'in_progress', 'ready')
        AND t.updated_at < CURRENT_TIMESTAMP - INTERVAL '1 millisecond' * $2
      ORDER BY t.updated_at ASC
    `, [req.tenantId, thresholdMs]);

    const stuckTickets = tickets.map(t => ({
      ...t,
      stuck_duration_minutes: Math.round(t.stuck_duration_ms / 60000)
    }));

    res.json({
      tickets: stuckTickets,
      count: stuckTickets.length,
      threshold_minutes: parseInt(threshold_minutes),
      message: stuckTickets.length > 0
        ? `Found ${stuckTickets.length} ticket(s) stuck for more than ${threshold_minutes} minutes`
        : 'No stuck tickets found'
    });
  } catch (err) {
    console.error('GET /tickets/stuck error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets - Create ticket
router.post('/', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { title, description, type, priority, project_id, parent_id, dependencies } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const id = randomUUID();
    
    await execute(`
      INSERT INTO tickets (id, title, description, project_id, parent_id, state, created_at)
      VALUES ($1, $2, $3, $4, $5, 'draft', CURRENT_TIMESTAMP)
    `, [id, title, description, project_id, parent_id || null]);
    
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('POST /tickets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// PARAMETERIZED ROUTES (/:id patterns)
// =============================================================================

// GET /api/tickets/:id (tenant-isolated) - Enhanced with include params
router.get('/:id', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { id } = req.params;
    const include = (req.query.include || '').split(',').filter(Boolean);
    
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    const response = { ...ticket };
    
    // Include dependencies if requested
    if (include.includes('dependencies')) {
      response.blocked_by = await queryAll(`
        SELECT t.id, t.title, t.state 
        FROM ticket_dependencies d 
        JOIN tickets t ON d.depends_on = t.id 
        WHERE d.ticket_id = $1
      `, [id]);
      
      response.blocks = await queryAll(`
        SELECT t.id, t.title, t.state 
        FROM ticket_dependencies d 
        JOIN tickets t ON d.ticket_id = t.id 
        WHERE d.depends_on = $1
      `, [id]);
    }
    
    // Include events if requested
    if (include.includes('events')) {
      response.events = await queryAll(`
        SELECT * FROM ticket_events 
        WHERE ticket_id = $1 
        ORDER BY created_at DESC 
        LIMIT 50
      `, [id]);
    }
    
    res.json({ ticket: response });
  } catch (err) {
    console.error('GET /tickets/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tickets/:id - Partial update with event logging (tenant-isolated)
router.patch('/:id', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['title', 'description', 'acceptance_criteria', 'epic', 'estimated_scope', 'files_hint', 'priority', 'state'];
    
    const currentTicket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    
    if (!currentTicket) return res.status(404).json({ error: 'Ticket not found' });
    
    const updates = [];
    const params = [];
    const changes = {};
    let paramIdx = 1;
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined && req.body[field] !== currentTicket[field]) {
        updates.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
        changes[field] = { from: currentTicket[field], to: req.body[field] };
      }
    }
    
    if (updates.length === 0) {
      return res.json({ ticket: currentTicket, event_id: null, message: 'No changes' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    await execute(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    
    // Log event
    const eventResult = await queryOne(`
      INSERT INTO ticket_events (ticket_id, event_type, actor_id, actor_type, previous_value, new_value, metadata)
      VALUES ($1, 'edited', $2, 'human', $3, $4, $5)
      RETURNING id
    `, [
      id,
      req.user?.id || 'anonymous',
      JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from]))),
      JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to]))),
      JSON.stringify({ fields_changed: Object.keys(changes) })
    ]);
    
    const updatedTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [id]);
    
    // Broadcast to tenant
    broadcast.toTenant(req.tenantId, 'ticket:update', { ticket: updatedTicket, action: 'edited' });
    
    res.json({ ticket: updatedTicket, event_id: eventResult?.id || null, changes: Object.keys(changes) });
  } catch (err) {
    console.error('PATCH /tickets/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets/:id/requeue - Reset ticket to pending (tenant-isolated)
router.post('/:id/requeue', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    const requeueableStates = ['in_progress', 'assigned', 'in_review', 'changes_requested', 'done', 'failed', 'cancelled'];
    if (!requeueableStates.includes(ticket.state)) {
      return res.status(400).json({ error: `Cannot requeue from state '${ticket.state}'` });
    }
    
    const previousState = ticket.state;
    
    await execute(`
      UPDATE tickets 
      SET state = 'pending', assignee_id = NULL, assignee_type = NULL, 
          vm_id = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);
    
    await execute(`
      INSERT INTO ticket_events (ticket_id, event_type, actor_id, actor_type, previous_value, new_value, rationale)
      VALUES ($1, 'requeued', $2, 'human', $3, 'pending', $4)
    `, [id, req.user?.id || 'anonymous', previousState, reason || 'Manual requeue']);
    
    const updatedTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [id]);
    
    broadcast.toTenant(req.tenantId, 'ticket:update', { ticket: updatedTicket, action: 'requeued' });
    
    res.json({ ticket: updatedTicket, previous_state: previousState });
  } catch (err) {
    console.error('POST /tickets/:id/requeue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets/:id/dependencies - Add dependency (tenant-isolated)
router.post('/:id/dependencies', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const { depends_on } = req.body || {};
    
    if (!depends_on) return res.status(400).json({ error: 'depends_on required' });
    
    // Verify both tickets belong to tenant
    const ticket = await queryOne(`
      SELECT t.id FROM tickets t JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    const depTicket = await queryOne(`
      SELECT t.id, t.state FROM tickets t JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [depends_on, req.tenantId]);
    if (!depTicket) return res.status(404).json({ error: 'Dependency ticket not found' });
    
    // Check circular dependency
    const wouldCycle = await queryOne(`
      SELECT 1 FROM ticket_dependencies WHERE ticket_id = $1 AND depends_on = $2
    `, [depends_on, id]);
    if (wouldCycle) return res.status(400).json({ error: 'Would create circular dependency' });
    
    await execute(`
      INSERT INTO ticket_dependencies (ticket_id, depends_on) VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [id, depends_on]);
    
    await execute(`
      INSERT INTO ticket_events (ticket_id, event_type, actor_id, actor_type, new_value)
      VALUES ($1, 'dependency_added', $2, 'human', $3)
    `, [id, req.user?.id || 'anonymous', depends_on]);
    
    broadcast.toTenant(req.tenantId, 'ticket:update', { ticketId: id, action: 'dependency_added' });
    
    res.json({ success: true, ticket_id: id, depends_on });
  } catch (err) {
    console.error('POST /tickets/:id/dependencies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tickets/:id/dependencies/:depends_on - Remove dependency (tenant-isolated)
router.delete('/:id/dependencies/:depends_on', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id, depends_on } = req.params;
    
    const ticket = await queryOne(`
      SELECT t.id FROM tickets t JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    await execute(`DELETE FROM ticket_dependencies WHERE ticket_id = $1 AND depends_on = $2`, [id, depends_on]);
    
    await execute(`
      INSERT INTO ticket_events (ticket_id, event_type, actor_id, actor_type, previous_value)
      VALUES ($1, 'dependency_removed', $2, 'human', $3)
    `, [id, req.user?.id || 'anonymous', depends_on]);
    
    broadcast.toTenant(req.tenantId, 'ticket:update', { ticketId: id, action: 'dependency_removed' });
    
    res.json({ success: true, ticket_id: id, removed: depends_on });
  } catch (err) {
    console.error('DELETE /tickets/:id/dependencies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tickets/:id - Update ticket (tenant-isolated)
router.put('/:id', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    // Verify ticket belongs to tenant's project
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [req.params.id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { title, description, state, priority, assignee_id, parent_id } = req.body;
    const updates = [];
    const params = [];
    let paramIdx = 1;
    
    if (title) { updates.push(`title = $${paramIdx++}`); params.push(title); }
    if (description) { updates.push(`description = $${paramIdx++}`); params.push(description); }
    if (state) { updates.push(`state = $${paramIdx++}`); params.push(state); }
    if (priority) { updates.push(`priority = $${paramIdx++}`); params.push(priority); }
    if (assignee_id !== undefined) { updates.push(`assignee_id = $${paramIdx++}`); params.push(assignee_id); }
    if (parent_id !== undefined) { updates.push(`parent_id = $${paramIdx++}`); params.push(parent_id); }
    
    if (updates.length === 0) return res.json({ success: true, message: 'No changes' });
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    await execute(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    
    // Notify deploy agent if ticket was marked done
    if (state === 'done') {
      notifyDeployAgent(req.params.id, state);
      await checkSessionCompletion(req.params.id);
    }
    
    const updatedTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    broadcast.toTenant(req.tenantId, 'ticket:update', { ticket: updatedTicket, action: 'updated' });
    
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /tickets/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tickets/:id (tenant-isolated)
router.delete('/:id', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    // Verify ticket belongs to tenant before deleting
    const ticket = await queryOne(`
      SELECT t.id FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [req.params.id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    await execute('DELETE FROM tickets WHERE id = $1', [req.params.id]);
    const updatedTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    broadcast.toTenant(req.tenantId, 'ticket:update', { ticket: updatedTicket, action: 'updated' });
    
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /tickets/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// VERIFICATION WORKFLOW ROUTES (Agent-Foreman inspired)
// =============================================================================

// POST /api/tickets/:id/verify - Start or record verification (tenant-isolated)
router.post('/:id/verify', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, evidence, reason } = req.body;
    
    // Verify ticket belongs to tenant
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const now = new Date().toISOString();
    
    switch (action) {
      case 'start':
        if (ticket.state !== 'in_progress') {
          return res.status(400).json({ 
            error: `Cannot start verification from state '${ticket.state}'. Must be 'in_progress'.` 
          });
        }
        await execute(`
          UPDATE tickets 
          SET state = 'verifying', verification_status = 'partial', updated_at = $1
          WHERE id = $2
        `, [now, id]);
        
        await logProgress(id, 'verification_started', 'Verification process initiated');
        res.json({ success: true, state: 'verifying' });
        break;

      case 'pass':
        if (ticket.state !== 'verifying') {
          return res.status(400).json({ 
            error: `Cannot pass verification from state '${ticket.state}'. Must be 'verifying'.` 
          });
        }
        const passEvidence = evidence ? JSON.stringify(evidence) : ticket.verification_evidence;
        await execute(`
          UPDATE tickets 
          SET state = 'done', verification_status = 'verified', 
              verification_evidence = $1, updated_at = $2
          WHERE id = $3
        `, [passEvidence, now, id]);
        
        await logProgress(id, 'verification_passed', 'All acceptance criteria verified');
        res.json({ success: true, state: 'done', verification_status: 'verified' });
        break;

      case 'fail':
        if (ticket.state !== 'verifying') {
          return res.status(400).json({ 
            error: `Cannot fail verification from state '${ticket.state}'. Must be 'verifying'.` 
          });
        }
        const failEvidence = evidence ? JSON.stringify(evidence) : ticket.verification_evidence;
        await execute(`
          UPDATE tickets 
          SET state = 'in_progress', verification_status = 'failed',
              verification_evidence = $1, rejection_count = COALESCE(rejection_count, 0) + 1, updated_at = $2
          WHERE id = $3
        `, [failEvidence, now, id]);
        
        await logProgress(id, 'verification_failed', reason || 'Verification failed, returning to in_progress');
        res.json({ success: true, state: 'in_progress', verification_status: 'failed' });
        break;

      default:
        res.status(400).json({ error: "Action must be 'start', 'pass', or 'fail'" });
    }
  } catch (err) {
    console.error('POST /tickets/:id/verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tickets/:id/files - Update files_involved for impact tracking (tenant-isolated)
router.put('/:id/files', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const { files } = req.body;
    
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'files must be an array of file paths' });
    }

    // Verify ticket belongs to tenant
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const now = new Date().toISOString();
    await execute(`
      UPDATE tickets 
      SET files_involved = $1, updated_at = $2
      WHERE id = $3
    `, [JSON.stringify(files), now, id]);
    
    await logProgress(id, 'files_updated', `Updated files_involved: ${files.length} files`);
    res.json({ success: true, files_involved: files });
  } catch (err) {
    console.error('PUT /tickets/:id/files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id/impact - Get impact analysis (tenant-isolated)
router.get('/:id/impact', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ticket belongs to tenant
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    let filesInvolved = [];
    try {
      filesInvolved = ticket.files_involved ? JSON.parse(ticket.files_involved) : [];
    } catch (e) {
      filesInvolved = [];
    }

    if (filesInvolved.length === 0) {
      return res.json({ 
        ticket_id: id,
        files_involved: [],
        impacted_tickets: [],
        message: 'No files tracked for this ticket'
      });
    }

    // Find other tickets in tenant's projects that touch the same files
    const allTickets = await queryAll(`
      SELECT t.id, t.title, t.state, t.files_involved, t.files_hint 
      FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id != $1 AND p.tenant_id = $2 
        AND (t.files_involved IS NOT NULL OR t.files_hint IS NOT NULL)
    `, [id, req.tenantId]);

    const impactedTickets = allTickets.filter(t => {
      let otherFiles = [];
      try {
        otherFiles = t.files_involved ? JSON.parse(t.files_involved) : [];
      } catch (e) {
        otherFiles = t.files_hint ? t.files_hint.split(',').map(f => f.trim()) : [];
      }
      return filesInvolved.some(f => otherFiles.includes(f));
    }).map(t => ({
      id: t.id,
      title: t.title,
      state: t.state,
      overlapping_files: (() => {
        let otherFiles = [];
        try {
          otherFiles = t.files_involved ? JSON.parse(t.files_involved) : [];
        } catch (e) {
          otherFiles = t.files_hint ? t.files_hint.split(',').map(f => f.trim()) : [];
        }
        return filesInvolved.filter(f => otherFiles.includes(f));
      })()
    }));

    res.json({
      ticket_id: id,
      files_involved: filesInvolved,
      impacted_tickets: impactedTickets,
      impact_count: impactedTickets.length
    });
  } catch (err) {
    console.error('GET /tickets/:id/impact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets/:id/needs-review - Mark ticket as needing review (tenant-isolated)
router.post('/:id/needs-review', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Verify ticket belongs to tenant
    const ticket = await queryOne(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND p.tenant_id = $2
    `, [id, req.tenantId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const now = new Date().toISOString();
    await execute(`
      UPDATE tickets 
      SET state = 'needs_review', hold_reason = $1, updated_at = $2
      WHERE id = $3
    `, [reason || 'Marked for review', now, id]);
    
    await logProgress(id, 'marked_needs_review', reason || 'Ticket marked as needing review');
    res.json({ success: true, state: 'needs_review' });
  } catch (err) {
    console.error('POST /tickets/:id/needs-review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id/children - Get child tickets of a parent
router.get('/:id/children', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const children = await queryAll(`
      SELECT t.* FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.parent_id = $1 AND p.tenant_id = $2
      ORDER BY t.created_at ASC
    `, [req.params.id, req.tenantId]);
    res.json({ children });
  } catch (err) {
    console.error('GET /tickets/:id/children error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// DEPLOY AGENT INTEGRATION
// =============================================================================

// Internal: Notify deploy-agent when ticket completes
async function notifyDeployAgent(ticketId, status) {
  if (status !== 'done' && status !== 'completed') return;
  
  try {
    const response = await fetch('http://localhost:3457/api/callbacks/ticket-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, status })
    });
    if (!response.ok) {
      console.error('Deploy agent callback failed:', await response.text());
    }
  } catch (err) {
    // Deploy agent may not be running - log but don't fail
    console.error('Deploy agent callback error:', err.message);
  }
}

// GAP #5: Session Completion Check (async PostgreSQL version)
async function checkSessionCompletion(ticketId) {
  const ticket = await queryOne('SELECT design_session FROM tickets WHERE id = $1', [ticketId]);
  if (!ticket?.design_session) return;
  
  const incomplete = await queryOne(`
    SELECT COUNT(*)::int as count FROM tickets 
    WHERE design_session = $1 AND state NOT IN ('done', 'cancelled')
  `, [ticket.design_session]);
  
  if (incomplete.count === 0) {
    await execute(`
      UPDATE hitl_sessions SET state = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [ticket.design_session]);
    console.log(`[GAP5] Session ${ticket.design_session} completed - all tickets done`);
  }
}

// =============================================================================
// =============================================================================
// TICKET ACTIVITY LOGGING - Real-time agent activity
// =============================================================================

// Agent service key for internal agent calls
const AGENT_SERVICE_KEY = process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev';

// Middleware: Agent service auth (for POST)
function requireAgentAuth(req, res, next) {
  const serviceKey = req.headers['x-agent-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (serviceKey === AGENT_SERVICE_KEY) {
    req.isAgent = true;
    return next();
  }
  return res.status(401).json({ error: 'Invalid agent key' });
}

// POST /api/tickets/:id/activity - Log agent activity (agent auth)
router.post('/:id/activity', requireAgentAuth, async (req, res) => {
  const { id } = req.params;
  const { agent_id, category, message, metadata = {} } = req.body;
  
  // Validate required fields
  if (!agent_id || !category || !message) {
    return res.status(400).json({ error: 'agent_id, category, message required' });
  }
  
  try {
    // Verify ticket exists
    const ticket = await queryOne('SELECT id, state FROM tickets WHERE id = $1', [id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Map agent_id prefix to valid actor_type (per DB constraint)
    const agentPrefix = agent_id.split('-')[0].toLowerCase();
    const actorTypeMap = {
      'design': 'design_agent',
      'worker': 'worker_agent', 
      'forge': 'worker_agent',
      'review': 'review_agent',
      'orchestrator': 'orchestrator',
      'system': 'system'
    };
    const actorType = actorTypeMap[agentPrefix] || 'worker_agent';
    
    // Insert activity into ticket_events
    await execute(`
      INSERT INTO ticket_events (ticket_id, event_type, actor_id, actor_type, new_value, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, category, agent_id, actorType, message, JSON.stringify(metadata)]);
    
    // Broadcast via WebSocket for real-time UI updates
    broadcast('ticket_activity', {
      ticket_id: id,
      entry: {
        timestamp: new Date().toISOString(),
        category,
        actor: { id: agent_id, type: actorType },
        message,
        metadata
      }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('POST /tickets/:id/activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id/activity - Fetch activity log (user auth)
router.get('/:id/activity', requireAuth, async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const category = req.query.category; // Optional filter
  
  try {
    // Build query with optional category filter
    let sql = `
      SELECT 
        id,
        created_at as timestamp,
        event_type as category,
        actor_id,
        actor_type,
        new_value as message,
        metadata
      FROM ticket_events
      WHERE ticket_id = $1
    `;
    const params = [id];
    let paramIdx = 2;
    
    if (category) {
      sql += ` AND event_type = $${paramIdx++}`;
      params.push(category);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(limit);
    
    const events = await queryAll(sql, params);
    
    // Get current agent if ticket is in progress
    const ticket = await queryOne(`
      SELECT t.id, t.state, t.title,
             ai.id as agent_instance_id, ai.agent_type, ai.vm_id, ai.status as agent_status
      FROM tickets t
      LEFT JOIN agent_instances ai ON ai.ticket_id = t.id AND ai.status = 'running'
      WHERE t.id = $1
    `, [id]);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const currentAgent = ticket.agent_instance_id ? {
      id: `${ticket.agent_type}-${ticket.agent_instance_id}`,
      type: ticket.agent_type,
      instance_id: ticket.agent_instance_id,
      vm_id: ticket.vm_id,
      status: ticket.agent_status
    } : null;
    
    res.json({
      ticket_id: id,
      ticket_state: ticket.state,
      current_agent: currentAgent,
      entries: events.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        category: e.category,
        actor: { id: e.actor_id, type: e.actor_type },
        message: e.message,
        metadata: e.metadata || {}
      })),
      count: events.length
    });
  } catch (err) {
    console.error('GET /tickets/:id/activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// HELPER FUNCTIONS
// =============================================================================

// Log progress entry to ticket's progress_log JSON
async function logProgress(ticketId, event, message) {
  const ticket = await queryOne('SELECT progress_log FROM tickets WHERE id = $1', [ticketId]);
  
  let log = { entries: [] };
  try {
    log = ticket?.progress_log ? JSON.parse(ticket.progress_log) : { entries: [] };
  } catch (e) {
    log = { entries: [] };
  }
  
  log.entries.push({
    timestamp: new Date().toISOString(),
    event,
    message
  });
  
  await execute('UPDATE tickets SET progress_log = $1 WHERE id = $2', [JSON.stringify(log), ticketId]);
}

module.exports = router;
