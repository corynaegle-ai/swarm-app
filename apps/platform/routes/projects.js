/**
 * Project routes - PostgreSQL version
 * Updated: 2025-12-17 - Migrated to async PostgreSQL
 */

const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');
const { GitHubService } = require('../services/github-service');

// GET /api/projects
router.get('/', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const projects = await queryAll(
      'SELECT * FROM projects WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ projects });
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id
router.get('/:id', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    const stats = await queryAll(`
      SELECT state, COUNT(*)::int as count FROM tickets 
      WHERE project_id = $1 
      GROUP BY state
    `, [req.params.id]);
    
    res.json({ project, ticketStats: Object.fromEntries(stats.map(s => [s.state, s.count])) });
  } catch (err) {
    console.error('GET /projects/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects
router.post('/', requireAuth, requireTenant, requirePermission('create_project'), async (req, res) => {
  try {
    const { name, description, repo_url, settings } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const id = uuidv4();
    
    await execute(`
      INSERT INTO projects (id, name, description, repo_url, settings, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [id, name, description, repo_url, settings ? JSON.stringify(settings) : null, req.tenantId]);
    
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('POST /projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/projects/:id
router.put('/:id', requireAuth, requireTenant, requirePermission('create_project'), async (req, res) => {
  try {
    const { name, description, repo_url, settings } = req.body;
    
    const updates = [];
    const params = [];
    let paramIdx = 1;
    
    if (name) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (description) { updates.push(`description = $${paramIdx++}`); params.push(description); }
    if (repo_url) { updates.push(`repo_url = $${paramIdx++}`); params.push(repo_url); }
    if (settings) { updates.push(`settings = $${paramIdx++}`); params.push(JSON.stringify(settings)); }
    
    if (updates.length === 0) return res.json({ success: true });
    
    params.push(req.params.id, req.tenantId);
    await execute(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /projects/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// === REPO PROVISIONING ENDPOINTS ===

/**
 * POST /api/projects/provision-repo
 * Create a new managed repo in swarmstack-projects org
 */
router.post('/provision-repo', requireAuth, requireTenant, requirePermission('create_project'), async (req, res) => {
  const { projectName, description, hitlSessionId } = req.body;
  
  if (!projectName) {
    return res.status(400).json({ error: 'projectName required' });
  }

  const github = new GitHubService();

  try {
    const repo = await github.createManagedRepo(projectName, description, true);
    
    const projectId = uuidv4();
    await execute(`
      INSERT INTO projects (
        id, name, description, repo_url, repo_provider, repo_owner, 
        repo_name, repo_mode, hitl_session_id, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, 'github', $5, $6, 'managed', $7, $8, CURRENT_TIMESTAMP)
    `, [projectId, projectName, description, repo.url, repo.owner, repo.name, hitlSessionId, req.tenantId]);
    
    if (hitlSessionId) {
      await execute('UPDATE hitl_sessions SET project_id = $1 WHERE id = $2', [projectId, hitlSessionId]);
    }
    
    res.status(201).json({
      success: true,
      project: { id: projectId, name: projectName, repo }
    });
  } catch (err) {
    console.error('Failed to provision repo:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/link-repo
 * Link an existing user repo to a project
 */
router.post('/link-repo', requireAuth, requireTenant, requirePermission('create_project'), async (req, res) => {
  const { projectName, description, repoUrl, pat, hitlSessionId } = req.body;
  
  if (!projectName || !repoUrl || !pat) {
    return res.status(400).json({ error: 'projectName, repoUrl, and pat required' });
  }

  const github = new GitHubService();

  try {
    const repo = await github.validateUserRepo(repoUrl, pat);
    
    // Store PAT in secrets
    const secretId = uuidv4();
    const secretType = `github_pat_${req.tenantId}_${repo.name}`;
    
    await execute(`
      INSERT INTO secrets (id, type, value, description, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT(type) DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP
    `, [secretId, secretType, pat, `PAT for ${repo.fullName}`, req.tenantId]);
    
    const projectId = uuidv4();
    await execute(`
      INSERT INTO projects (
        id, name, description, repo_url, repo_provider, repo_owner,
        repo_name, repo_mode, credentials_secret_id, hitl_session_id, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, 'github', $5, $6, 'linked', $7, $8, $9, CURRENT_TIMESTAMP)
    `, [projectId, projectName, description, repo.url, repo.owner, repo.name, secretId, hitlSessionId, req.tenantId]);
    
    if (hitlSessionId) {
      await execute('UPDATE hitl_sessions SET project_id = $1 WHERE id = $2', [projectId, hitlSessionId]);
    }
    
    res.status(201).json({
      success: true,
      project: {
        id: projectId,
        name: projectName,
        repo: { owner: repo.owner, name: repo.name, url: repo.url, mode: 'linked' }
      }
    });
  } catch (err) {
    console.error('Failed to link repo:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/validate-repo
 * Validate a repo URL and PAT without creating a project
 */
router.post('/validate-repo', requireAuth, async (req, res) => {
  const { repoUrl, pat } = req.body;
  
  if (!repoUrl || !pat) {
    return res.status(400).json({ error: 'repoUrl and pat required' });
  }

  const github = new GitHubService();

  try {
    const repo = await github.validateUserRepo(repoUrl, pat);
    res.json({
      valid: true,
      repo: {
        owner: repo.owner, name: repo.name, fullName: repo.fullName,
        url: repo.url, private: repo.private, canPush: repo.permissions?.push || false
      }
    });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

module.exports = router;

// =============================================================================
// MCP Server Configuration for Projects
// =============================================================================

// PUT /api/projects/:id/mcp-servers - Update project MCP server config
router.put('/:id/mcp-servers', requireAuth, requireTenant, requirePermission('manage_projects'), async (req, res) => {
  try {
    const { id } = req.params;
    const { mcp_servers } = req.body;
    
    if (!Array.isArray(mcp_servers)) {
      return res.status(400).json({ error: 'mcp_servers must be an array' });
    }
    
    const project = await queryOne(
      'SELECT id FROM projects WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    await execute(
      'UPDATE projects SET mcp_servers = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(mcp_servers), id]
    );
    
    res.json({ success: true, mcp_servers });
  } catch (err) {
    console.error('PUT /projects/:id/mcp-servers error:', err);
    res.status(500).json({ error: 'Failed to update MCP servers' });
  }
});

// GET /api/projects/:id/mcp-servers - Get project MCP server config
router.get('/:id/mcp-servers', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const project = await queryOne(
      'SELECT mcp_servers FROM projects WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ mcp_servers: project.mcp_servers || [] });
  } catch (err) {
    console.error('GET /projects/:id/mcp-servers error:', err);
    res.status(500).json({ error: 'Failed to get MCP servers' });
  }
});
