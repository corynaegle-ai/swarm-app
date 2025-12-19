/**
 * Repository provisioning routes
 * Migrated to PostgreSQL async methods
 */

const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');

const GITHUB_API = 'https://api.github.com';
const MANAGED_REPO_OWNER = 'corynaegle-ai';
const MANAGED_REPO_PREFIX = 'swarm-managed-';

/**
 * Get system GitHub PAT from secrets (async)
 */
async function getSystemGitHubPAT() {
  const secret = await queryOne('SELECT value FROM secrets WHERE type = $1', ['SYSTEM_GITHUB_PAT']);
  if (!secret) throw new Error('System GitHub PAT not configured');
  return secret.value;
}

/**
 * Sanitize project name for use as repo name
 */
function sanitizeRepoName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * GET /api/repo/list
 * List all accessible GitHub repositories for corynaegle-ai
 */
router.get('/list', requireAuth, async (req, res) => {
  try {
    const pat = await getSystemGitHubPAT();
    
    const response = await fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated&affiliation=owner`, {
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    
    const repos = data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      updated_at: repo.updated_at,
      default_branch: repo.default_branch,
      private: repo.private
    }));

    res.json({ repos });
  } catch (err) {
    console.error('Error fetching repos:', err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/repo/provision
 * Create a managed repo for a HITL session
 */
router.post('/provision', requireAuth, async (req, res) => {
  const { hitl_session_id } = req.body;
  
  if (!hitl_session_id) {
    return res.status(400).json({ error: 'hitl_session_id required' });
  }

  const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [hitl_session_id]);
  if (!session) {
    return res.status(404).json({ error: 'HITL session not found' });
  }
  
  if (session.state !== 'approved') {
    return res.status(400).json({ error: 'Session must be approved before provisioning repo' });
  }

  try {
    const pat = await getSystemGitHubPAT();
    const repoName = MANAGED_REPO_PREFIX + sanitizeRepoName(session.project_name);
    
    // Check if repo already exists
    const checkRes = await fetch(`${GITHUB_API}/repos/${MANAGED_REPO_OWNER}/${repoName}`, {
      headers: { 'Authorization': `Bearer ${pat}` }
    });
    
    if (checkRes.ok) {
      return res.status(409).json({ 
        error: 'Repository already exists',
        repo_url: `https://github.com/${MANAGED_REPO_OWNER}/${repoName}`
      });
    }

    // Create repo
    const createRes = await fetch(`${GITHUB_API}/user/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: `Swarm-managed: ${session.project_name}`,
        private: false,
        auto_init: true
      })
    });

    if (!createRes.ok) {
      const errData = await createRes.json();
      throw new Error(errData.message || 'Failed to create repository');
    }

    const repoData = await createRes.json();
    
    // Create project record
    const projectId = uuidv4();
    await execute(`
      INSERT INTO projects (
        id, name, description, repo_url, repo_provider, repo_owner, 
        repo_name, repo_mode, hitl_session_id, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, 'github', $5, $6, 'managed', $7, $8, NOW())
    `, [
      projectId,
      session.project_name,
      session.description,
      repoData.html_url,
      MANAGED_REPO_OWNER,
      repoName,
      hitl_session_id,
      session.tenant_id
    ]);

    // Link project_id to HITL session
    await execute('UPDATE hitl_sessions SET project_id = $1 WHERE id = $2', [projectId, hitl_session_id]);

    res.status(201).json({
      success: true,
      project_id: projectId,
      repo_url: repoData.html_url,
      repo_owner: MANAGED_REPO_OWNER,
      repo_name: repoName,
      mode: 'managed'
    });

  } catch (error) {
    console.error('Repo provision error:', error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * POST /api/repo/link
 * Link an existing user repo to a HITL session
 */
router.post('/link', requireAuth, async (req, res) => {
  const { hitl_session_id, repo_url, pat } = req.body;
  
  if (!hitl_session_id || !repo_url || !pat) {
    return res.status(400).json({ error: 'hitl_session_id, repo_url, and pat required' });
  }

  const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [hitl_session_id]);
  if (!session) {
    return res.status(404).json({ error: 'HITL session not found' });
  }
  
  if (session.state !== 'approved') {
    return res.status(400).json({ error: 'Session must be approved before linking repo' });
  }

  try {
    // Parse repo URL
    const match = repo_url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub repo URL' });
    }
    const [, owner, repoName] = match;

    // Validate PAT has access to repo
    const checkRes = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}`, {
      headers: { 'Authorization': `Bearer ${pat}` }
    });
    
    if (!checkRes.ok) {
      return res.status(401).json({ error: 'Cannot access repository with provided PAT' });
    }

    const repoData = await checkRes.json();
    
    if (!repoData.permissions?.push) {
      return res.status(403).json({ error: 'PAT does not have write access to repository' });
    }

    // Store PAT as secret
    const secretId = uuidv4();
    await execute(`
      INSERT INTO secrets (id, type, value, description, tenant_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      secretId,
      `GITHUB_PAT_${owner}_${repoName}`.toUpperCase(),
      pat,
      `PAT for linked repo ${owner}/${repoName}`,
      session.tenant_id
    ]);

    // Create project record
    const projectId = uuidv4();
    await execute(`
      INSERT INTO projects (
        id, name, description, repo_url, repo_provider, repo_owner,
        repo_name, repo_mode, credentials_secret_id, hitl_session_id, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, 'github', $5, $6, 'linked', $7, $8, $9, NOW())
    `, [
      projectId,
      session.project_name,
      session.description,
      repoData.html_url,
      owner,
      repoName,
      secretId,
      hitl_session_id,
      session.tenant_id
    ]);

    await execute('UPDATE hitl_sessions SET project_id = $1 WHERE id = $2', [projectId, hitl_session_id]);

    res.status(201).json({
      success: true,
      project_id: projectId,
      repo_url: repoData.html_url,
      repo_owner: owner,
      repo_name: repoName,
      mode: 'linked'
    });

  } catch (error) {
    console.error('Repo link error:', error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * GET /api/repo/check/:sessionId
 * Check if a session already has a linked project/repo
 */
router.get('/check/:sessionId', requireAuth, async (req, res) => {
  try {
    const project = await queryOne(`
      SELECT id, repo_url, repo_mode, repo_owner, repo_name 
      FROM projects WHERE hitl_session_id = $1
    `, [req.params.sessionId]);
    
    if (project) {
      res.json({ hasRepo: true, project });
    } else {
      res.json({ hasRepo: false });
    }
  } catch (error) {
    console.error('Check repo error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/repo/use-existing
 * Use an existing managed repo that was created in a previous session
 */
router.post('/use-existing', requireAuth, async (req, res) => {
  const { hitl_session_id, repo_url } = req.body;

  if (!hitl_session_id || !repo_url) {
    return res.status(400).json({ error: 'Missing hitl_session_id or repo_url' });
  }

  const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [hitl_session_id]);
  if (!session) {
    return res.status(404).json({ error: 'HITL session not found' });
  }

  if (session.state !== 'approved') {
    return res.status(400).json({ error: 'Session must be approved before connecting repo' });
  }

  // Check if project already exists for this session
  const existingProject = await queryOne('SELECT id FROM projects WHERE hitl_session_id = $1', [hitl_session_id]);
  if (existingProject) {
    return res.status(409).json({ error: 'Project already exists for this session', project_id: existingProject.id });
  }

  try {
    // Parse repo URL to get owner/name
    const match = repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub repo URL' });
    }
    const [, owner, repoName] = match;

    // Create project record
    const projectId = uuidv4();
    await execute(`
      INSERT INTO projects (
        id, name, description, repo_url, repo_provider, repo_owner, 
        repo_name, repo_mode, hitl_session_id, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, 'github', $5, $6, 'managed', $7, $8, NOW())
    `, [
      projectId,
      session.project_name,
      session.description,
      repo_url,
      owner,
      repoName.replace('.git', ''),
      hitl_session_id,
      session.tenant_id
    ]);

    await execute('UPDATE hitl_sessions SET project_id = $1 WHERE id = $2', [projectId, hitl_session_id]);

    res.status(201).json({
      success: true,
      project_id: projectId,
      repo_url: repo_url,
      repo_owner: owner,
      repo_name: repoName.replace('.git', ''),
      mode: 'managed'
    });

  } catch (error) {
    console.error('Use existing repo error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
