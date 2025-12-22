/**
 * Agent Registry API Routes - PostgreSQL Version
 * Provides /api/registry/* endpoints for agent catalog, workflows, and personas
 * Data source: PostgreSQL agent_definitions table
 */

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

const PERSONAS_DIR = '/opt/personas';

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'swarmdb',
  user: process.env.PG_USER || 'swarm',
  password: process.env.PG_PASSWORD || 'swarm_dev_2024',
  max: 5
});

// All registry routes require auth
router.use(requireAuth);

// ============================================
// AGENTS CATALOG ENDPOINTS
// ============================================

// GET /api/registry/agents - List all registered agents
router.get('/agents', async (req, res) => {
  const { name, tag, runtime, limit = 50, offset = 0 } = req.query;
  
  try {
    let sql = `SELECT id, name, version, description, runtime, memory_mb, 
               timeout_seconds, author, tags, created_at, updated_at 
               FROM agent_definitions WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (name) {
      sql += ` AND name ILIKE $${paramIndex++}`;
      params.push(`%${name}%`);
    }
    if (runtime) {
      sql += ` AND runtime = $${paramIndex++}`;
      params.push(runtime);
    }
    if (tag) {
      sql += ` AND tags::text ILIKE $${paramIndex++}`;
      params.push(`%${tag}%`);
    }
    
    // Get total count
    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Add pagination
    sql += ` ORDER BY updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(sql, params);
    
    // Parse JSON fields
    const agents = result.rows.map(a => ({
      ...a,
      tags: typeof a.tags === 'string' ? JSON.parse(a.tags || '[]') : (a.tags || [])
    }));
    
    res.json({ agents, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (e) {
    console.error('Registry agents error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/registry/agents/:id - Get full agent details
router.get('/agents/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`SELECT * FROM agent_definitions WHERE id = $1`, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    
    // Check persona file
    let persona = null;
    const agentName = agent.name.replace('_template:', '');
    const personaPath = path.join(PERSONAS_DIR, `${agentName}.md`);
    
    if (fs.existsSync(personaPath)) {
      const content = fs.readFileSync(personaPath, 'utf8');
      persona = {
        path: personaPath,
        exists: true,
        preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
      };
    } else {
      persona = { path: personaPath, exists: false, preview: null };
    }
    
    // Parse JSON fields
    const parsed = {
      ...agent,
      capabilities: typeof agent.capabilities === 'string' 
        ? JSON.parse(agent.capabilities || '{}') 
        : (agent.capabilities || {}),
      inputs_schema: typeof agent.inputs_schema === 'string' 
        ? JSON.parse(agent.inputs_schema || 'null') 
        : agent.inputs_schema,
      outputs_schema: typeof agent.outputs_schema === 'string' 
        ? JSON.parse(agent.outputs_schema || 'null') 
        : agent.outputs_schema,
      triggers: typeof agent.triggers === 'string' 
        ? JSON.parse(agent.triggers || '[]') 
        : (agent.triggers || []),
      tags: typeof agent.tags === 'string' 
        ? JSON.parse(agent.tags || '[]') 
        : (agent.tags || []),
      persona,
      stats: {
        total_executions: 0,
        success_rate: 0,
        avg_duration_ms: 0,
        total_tokens_used: 0
      }
    };
    
    res.json(parsed);
  } catch (e) {
    console.error('Registry agent detail error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/registry/agents/:id/executions - Get agent execution history
router.get('/agents/:id/executions', async (req, res) => {
  const { id } = req.params;
  const { limit = 20 } = req.query;
  
  try {
    // For now, return empty since we migrated to PostgreSQL and don't have executions table yet
    res.json({ executions: [], total: 0 });
  } catch (e) {
    console.error('Registry executions error:', e);
    res.status(500).json({ error: e.message });
  }
});


// ============================================
// WORKFLOWS ENDPOINTS (stub for now)
// ============================================

// GET /api/registry/workflows - List all workflows
router.get('/workflows', async (req, res) => {
  try {
    // Return empty for now - workflows table not yet migrated
    res.json({ workflows: [], total: 0 });
  } catch (e) {
    console.error('Registry workflows error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/registry/workflows/:id - Get workflow detail
router.get('/workflows/:id', async (req, res) => {
  res.status(404).json({ error: 'Workflow not found' });
});

// GET /api/registry/workflows/:id/runs - Get workflow run history
router.get('/workflows/:id/runs', async (req, res) => {
  res.json({ runs: [], total: 0 });
});

// ============================================
// PERSONAS ENDPOINTS
// ============================================

// GET /api/registry/personas - List all personas
router.get('/personas', (req, res) => {
  try {
    if (!fs.existsSync(PERSONAS_DIR)) {
      return res.json({ personas: [] });
    }
    
    const files = fs.readdirSync(PERSONAS_DIR).filter(f => f.endsWith('.md'));
    
    const personas = files.map(f => {
      const filePath = path.join(PERSONAS_DIR, f);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      
      return {
        name: f.replace('.md', ''),
        path: filePath,
        size_bytes: stats.size,
        preview: content.substring(0, 150) + (content.length > 150 ? '...' : ''),
        updated_at: stats.mtime.toISOString()
      };
    });
    
    res.json({ personas });
  } catch (e) {
    console.error('Personas list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/registry/personas/:name - Get persona content
router.get('/personas/:name', (req, res) => {
  const { name } = req.params;
  const filePath = path.join(PERSONAS_DIR, `${name}.md`);
  
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    res.json({
      name,
      path: filePath,
      content,
      size_bytes: stats.size,
      updated_at: stats.mtime.toISOString()
    });
  } catch (e) {
    console.error('Persona detail error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/registry/personas/:name - Update or create persona
router.put('/personas/:name', (req, res) => {
  const { name } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  // Sanitize name to prevent path traversal
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(PERSONAS_DIR, `${safeName}.md`);
  
  try {
    // Ensure directory exists
    if (!fs.existsSync(PERSONAS_DIR)) {
      fs.mkdirSync(PERSONAS_DIR, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    
    res.json({
      name: safeName,
      path: filePath,
      message: 'Persona saved successfully'
    });
  } catch (e) {
    console.error('Persona save error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
