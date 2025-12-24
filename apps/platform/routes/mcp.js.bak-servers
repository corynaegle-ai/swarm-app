/**
 * MCP Factory Integration Routes
 * Endpoints for mcp-factory to create tickets from specs
 * 
 * MIGRATED TO POSTGRESQL: 2025-12-17
 */

const express = require('express');
const router = express.Router();
const { generateMcpTickets } = require('../services/mcp-ticket-generator');
const { queryAll, execute } = require('../db');
const { randomUUID } = require('crypto');

// Service-to-service auth (simple shared secret for internal calls)
const MCP_SERVICE_KEY = process.env.MCP_SERVICE_KEY || 'mcp-internal-key-dev';

function requireServiceAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing service authorization' });
  }
  
  const token = authHeader.slice(7);
  if (token !== MCP_SERVICE_KEY) {
    return res.status(403).json({ error: 'Invalid service key' });
  }
  
  next();
}

/**
 * POST /api/mcp/create-tickets
 * Called by mcp-factory after parsing spec
 * 
 * Body: { spec, project_id, job_id }
 */
router.post('/create-tickets', requireServiceAuth, async (req, res) => {
  try {
    const { spec, project_id, job_id } = req.body;
    
    if (!spec) {
      return res.status(400).json({ error: 'spec is required' });
    }
    
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    
    console.log(`[MCP] Creating tickets for: ${spec.name}, project: ${project_id}`);
    
    const result = await generateMcpTickets(spec, project_id, job_id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${result.count} tickets for MCP: ${spec.name}`,
      epic_id: result.epicId,
      tickets: result.tickets,
      count: result.count
    });
  } catch (err) {
    console.error('[MCP] Error creating tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mcp/tickets/:projectId
 * List MCP-related tickets for a project
 */
router.get('/tickets/:projectId', requireServiceAuth, async (req, res) => {
  try {
    const tickets = await queryAll(`
      SELECT id, title, state, epic, estimated_scope, created_at
      FROM tickets
      WHERE project_id = $1 AND title LIKE '[MCP]%'
      ORDER BY created_at ASC
    `, [req.params.projectId]);
    
    res.json({ tickets, count: tickets.length });
  } catch (err) {
    console.error('[MCP] Error fetching tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mcp/create-project
 * Create a project specifically for an MCP server
 */
router.post('/create-project', requireServiceAuth, async (req, res) => {
  try {
    const { name, description, tenant_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    // Use default tenant if not provided (for dev/testing)
    const tenantId = tenant_id || 'default';
    const projectId = randomUUID();
    const projectName = `MCP: ${name}`;
    
    await execute(`
      INSERT INTO projects (id, name, description, tenant_id, type, repo_url, created_at, status)
      VALUES ($1, $2, $3, $4, 'mcp', 'pending', CURRENT_TIMESTAMP, 'designing')
    `, [projectId, projectName, description || `MCP Server: ${name}`, tenantId]);
    
    console.log(`[MCP] Created project: ${projectId} - ${projectName}`);
    
    res.status(201).json({
      success: true,
      project_id: projectId,
      name: projectName
    });
  } catch (err) {
    console.error('[MCP] Error creating project:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
