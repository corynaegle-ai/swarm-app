/**
 * Agent Registry API Routes
 * Provides /api/registry/* endpoints for agent catalog, workflows, and personas
 * Data source: /opt/swarm-registry/registry.db
 */

const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Registry database connection
const REGISTRY_DB_PATH = '/opt/swarm-registry/registry.db';
const PERSONAS_DIR = '/opt/personas';

function getRegistryDb() {
  return new Database(REGISTRY_DB_PATH, { readonly: true });
}

// All registry routes require auth
router.use(requireAuth);

// ============================================
// AGENTS CATALOG ENDPOINTS
// ============================================

// GET /api/registry/agents - List all registered agents
router.get('/agents', (req, res) => {
  const { name, tag, runtime, limit = 50, offset = 0 } = req.query;
  
  try {
    const db = getRegistryDb();
    
    let sql = `SELECT id, name, version, description, runtime, memory_mb, 
               timeout_seconds, author, tags, created_at, updated_at 
               FROM agents WHERE 1=1`;
    const params = [];
    
    if (name) {
      sql += ` AND name LIKE ?`;
      params.push(`%${name}%`);
    }
    if (runtime) {
      sql += ` AND runtime = ?`;
      params.push(runtime);
    }
    if (tag) {
      sql += ` AND tags LIKE ?`;
      params.push(`%${tag}%`);
    }
    
    // Get total count
    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const { total } = db.prepare(countSql).get(...params);
    
    // Add pagination
    sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const agents = db.prepare(sql).all(...params);
    
    // Parse JSON fields
    const parsed = agents.map(a => ({
      ...a,
      tags: JSON.parse(a.tags || '[]')
    }));
    
    db.close();
    res.json({ agents: parsed, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (e) {
    console.error('Registry agents error:', e);
    res.status(500).json({ error: e.message });
  }
});


// GET /api/registry/agents/:id - Get full agent details
router.get('/agents/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const db = getRegistryDb();
    
    const agent = db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(id);
    
    if (!agent) {
      db.close();
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Get execution stats
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_executions,
        AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) as success_rate,
        AVG(duration_ms) as avg_duration_ms,
        SUM(api_tokens_used) as total_tokens_used
      FROM step_executions
      WHERE agent_id = ?
    `).get(id);
    
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
    const result = {
      ...agent,
      capabilities: JSON.parse(agent.capabilities || '{}'),
      inputs_schema: JSON.parse(agent.inputs_schema || 'null'),
      outputs_schema: JSON.parse(agent.outputs_schema || 'null'),
      triggers: JSON.parse(agent.triggers || '[]'),
      tags: JSON.parse(agent.tags || '[]'),
      persona,
      stats: {
        total_executions: stats.total_executions || 0,
        success_rate: stats.success_rate || 0,
        avg_duration_ms: Math.round(stats.avg_duration_ms || 0),
        total_tokens_used: stats.total_tokens_used || 0
      }
    };
    
    db.close();
    res.json(result);
  } catch (e) {
    console.error('Registry agent detail error:', e);
    res.status(500).json({ error: e.message });
  }
});


// GET /api/registry/agents/:id/executions - Get agent execution history
router.get('/agents/:id/executions', (req, res) => {
  const { id } = req.params;
  const { status, limit = 20 } = req.query;
  
  try {
    const db = getRegistryDb();
    
    let sql = `
      SELECT 
        se.id, se.run_id, se.step_id, se.status, se.vm_id,
        se.inputs, se.outputs, se.duration_ms, se.api_tokens_used,
        se.started_at, se.completed_at, se.error,
        wr.workflow_id,
        w.name as workflow_name
      FROM step_executions se
      LEFT JOIN workflow_runs wr ON se.run_id = wr.id
      LEFT JOIN workflows w ON wr.workflow_id = w.id
      WHERE se.agent_id = ?
    `;
    const params = [id];
    
    if (status) {
      sql += ` AND se.status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY se.started_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const executions = db.prepare(sql).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as c FROM step_executions WHERE agent_id = ?`).get(id).c;
    
    const parsed = executions.map(e => ({
      ...e,
      inputs: JSON.parse(e.inputs || '{}'),
      outputs: JSON.parse(e.outputs || '{}')
    }));
    
    db.close();
    res.json({ executions: parsed, total });
  } catch (e) {
    console.error('Registry executions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// WORKFLOWS ENDPOINTS
// ============================================

// GET /api/registry/workflows - List all workflows
router.get('/workflows', (req, res) => {
  try {
    const db = getRegistryDb();
    
    const workflows = db.prepare(`
      SELECT 
        w.id, w.name, w.version, w.description, w.trigger_type, w.enabled,
        w.steps, w.author, w.tags, w.created_at, w.updated_at,
        (SELECT COUNT(*) FROM workflow_runs WHERE workflow_id = w.id) as run_count
      FROM workflows w
      ORDER BY w.updated_at DESC
    `).all();
    
    const parsed = workflows.map(w => {
      const steps = JSON.parse(w.steps || '[]');
      const agentsUsed = [...new Set(steps.map(s => s.agent).filter(Boolean))];
      return {
        ...w,
        steps_count: steps.length,
        agents_used: agentsUsed,
        tags: JSON.parse(w.tags || '[]')
      };
    });
    
    db.close();
    res.json({ workflows: parsed, total: parsed.length });
  } catch (e) {
    console.error('Registry workflows error:', e);
    res.status(500).json({ error: e.message });
  }
});


// GET /api/registry/workflows/:id - Get workflow detail
router.get('/workflows/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const db = getRegistryDb();
    
    const workflow = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id);
    
    if (!workflow) {
      db.close();
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const result = {
      ...workflow,
      steps: JSON.parse(workflow.steps || '[]'),
      variables: JSON.parse(workflow.variables || '{}'),
      trigger_config: JSON.parse(workflow.trigger_config || '{}'),
      on_error: JSON.parse(workflow.on_error || '{}'),
      on_success: JSON.parse(workflow.on_success || '{}'),
      tags: JSON.parse(workflow.tags || '[]')
    };
    
    db.close();
    res.json(result);
  } catch (e) {
    console.error('Registry workflow detail error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/registry/workflows/:id/runs - Get workflow run history
router.get('/workflows/:id/runs', (req, res) => {
  const { id } = req.params;
  const { status, limit = 20 } = req.query;
  
  try {
    const db = getRegistryDb();
    
    let sql = `SELECT * FROM workflow_runs WHERE workflow_id = ?`;
    const params = [id];
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const runs = db.prepare(sql).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as c FROM workflow_runs WHERE workflow_id = ?`).get(id).c;
    
    const parsed = runs.map(r => ({
      ...r,
      trigger_data: JSON.parse(r.trigger_data || '{}'),
      step_results: JSON.parse(r.step_results || '{}')
    }));
    
    db.close();
    res.json({ runs: parsed, total });
  } catch (e) {
    console.error('Registry workflow runs error:', e);
    res.status(500).json({ error: e.message });
  }
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
