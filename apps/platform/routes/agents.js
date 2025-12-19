/**
 * Agent management routes - PostgreSQL version
 * Provides /api/agents/* endpoints for agent monitoring
 */

const express = require('express');
const { queryAll, queryOne, execute } = require('../db');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

// All agent routes require auth + view_agents permission
router.use(requireAuth, requirePermission('view_agents'));

// GET /api/agents - List all agents
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const agents = await queryAll(`
      SELECT 
        a.*,
        t.title as ticket_title,
        t.state as ticket_state,
        p.name as project_name
      FROM agents a
      LEFT JOIN tickets t ON a.ticket_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE a.tenant_id = $1
      ORDER BY a.started_at DESC
    `, [tenantId]);
    
    res.json({ agents, count: agents.length });
  } catch (e) {
    console.error('GET /agents error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/active - List active agents only
router.get('/active', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const agents = await queryAll(`
      SELECT 
        a.*,
        t.title as ticket_title,
        t.state as ticket_state,
        p.name as project_name
      FROM agents a
      LEFT JOIN tickets t ON a.ticket_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE a.tenant_id = $1
        AND a.status IN ('assigned', 'working')
      ORDER BY a.started_at DESC
    `, [tenantId]);
    
    res.json({ agents, count: agents.length });
  } catch (e) {
    console.error('GET /agents/active error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/stats - Agent statistics
router.get('/stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const stats = await queryAll(`
      SELECT status, COUNT(*)::int as count FROM agents WHERE tenant_id = $1 GROUP BY status
    `, [tenantId]);
    
    const byType = await queryAll(`
      SELECT agent_type, COUNT(*)::int as count FROM agents WHERE tenant_id = $1 GROUP BY agent_type
    `, [tenantId]);
    
    const total = await queryOne(`SELECT COUNT(*)::int as total FROM agents WHERE tenant_id = $1`, [tenantId]);
    
    res.json({ 
      total: total.total,
      byStatus: stats.reduce((acc, s) => { acc[s.status] = s.count; return acc; }, {}),
      byType: byType.reduce((acc, t) => { acc[t.agent_type] = t.count; return acc; }, {})
    });
  } catch (e) {
    console.error('GET /agents/stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/:id - Get agent details
router.get('/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    const agent = await queryOne(`
      SELECT 
        a.*,
        t.title as ticket_title,
        t.state as ticket_state,
        t.description as ticket_description,
        p.name as project_name,
        p.repo_url
      FROM agents a
      LEFT JOIN tickets t ON a.ticket_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE a.id = $1 AND a.tenant_id = $2
    `, [id, tenantId]);
    
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ agent });
  } catch (e) {
    console.error('GET /agents/:id error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/:id/heartbeats - Get agent heartbeats
router.get('/:id/heartbeats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const agent = await queryOne(`SELECT id FROM agents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const heartbeats = await queryAll(`
      SELECT * FROM heartbeats WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [id, limit]);
    
    res.json({ heartbeats, count: heartbeats.length });
  } catch (e) {
    console.error('GET /agents/:id/heartbeats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/:id/events - Get events for agent's ticket
router.get('/:id/events', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const agent = await queryOne(`SELECT ticket_id FROM agents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.ticket_id) return res.json({ events: [], count: 0 });
    
    const events = await queryAll(`
      SELECT * FROM events WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [agent.ticket_id, limit]);
    
    res.json({ events, count: events.length });
  } catch (e) {
    console.error('GET /agents/:id/events error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agents/:id/terminate - Terminate an agent
router.post('/:id/terminate', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    const agent = await queryOne(`SELECT * FROM agents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    await execute(`UPDATE agents SET status = 'terminated', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    
    // If agent has a VM, try to kill it
    if (agent.vm_id) {
      try {
        const { execSync } = require('child_process');
        execSync(`pkill -f "firecracker.*vm${agent.vm_id}" 2>/dev/null || true`);
      } catch (e) { /* Ignore VM kill errors */ }
    }
    
    res.json({ success: true, terminated: id });
  } catch (e) {
    console.error('POST /agents/:id/terminate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/:id/logs - Get agent execution logs
router.get('/:id/logs', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const tail = req.query.tail === 'true';
    
    const agent = await queryOne(`
      SELECT id, ticket_id, vm_id, status FROM agents WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const order = tail ? 'DESC' : 'ASC';
    
    const heartbeats = await queryAll(`
      SELECT 
        h.id,
        h.created_at as timestamp,
        h.message,
        h.progress,
        'heartbeat' as type
      FROM heartbeats h
      WHERE h.agent_id = $1
      ORDER BY h.created_at ${order}
      LIMIT $2
    `, [id, limit]);
    
    let events = [];
    if (agent.ticket_id) {
      events = await queryAll(`
        SELECT 
          e.id,
          e.created_at as timestamp,
          e.event_type as message,
          e.metadata,
          e.rationale,
          'event' as type
        FROM events e
        WHERE e.ticket_id = $1 AND e.actor_type IN ('worker_agent', 'orchestrator', 'system')
        ORDER BY e.created_at ${order}
        LIMIT $2
      `, [agent.ticket_id, limit]);
    }
    
    // Combine and sort logs
    let logs = [...heartbeats, ...events].sort((a, b) => {
      const cmp = new Date(a.timestamp) - new Date(b.timestamp);
      return tail ? -cmp : cmp;
    }).slice(0, limit);
    
    res.json({ 
      logs, 
      count: logs.length,
      agent_id: id,
      vm_id: agent.vm_id,
      status: agent.status
    });
  } catch (e) {
    console.error('GET /agents/:id/logs error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
