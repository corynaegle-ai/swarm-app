/**
 * Bundle Routes - Workflow bundle management API
 * 
 * Mount at: /api/bundles
 * 
 * Endpoints:
 * - POST   /bundles                           Upload and register bundle
 * - GET    /bundles/:hash                     Get bundle URL by hash
 * - GET    /bundles/:hash/presigned           Get presigned download URL
 * - GET    /workflows                         List tenant workflows
 * - POST   /workflows                         Create new workflow
 * - GET    /workflows/:id/versions            List workflow versions
 * - GET    /workflows/:id/active              Get active version (for spawn)
 * - POST   /workflows/:id/versions/:vid/activate  Activate version
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const bundleService = require('../services/bundle-service');

// Multer for handling tarball uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/gzip' || 
        file.mimetype === 'application/x-gzip' ||
        file.originalname.endsWith('.tar.gz') ||
        file.originalname.endsWith('.tgz')) {
      cb(null, true);
    } else {
      cb(new Error('Only .tar.gz files are allowed'));
    }
  }
});

/**
 * POST /bundles
 * Upload and register a new workflow bundle
 * 
 * Body: multipart/form-data
 * - bundle: tarball file
 * - workflow_id: UUID
 * - version: semver string
 * - metadata: optional JSON
 */
router.post('/', requireAuth, upload.single('bundle'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No bundle file provided' });
    }
    
    const { workflow_id, version, metadata } = req.body;
    
    if (!workflow_id || !version) {
      return res.status(400).json({ error: 'workflow_id and version required' });
    }
    
    const result = await bundleService.uploadBundle({
      tenantId: req.user.tenant_id,
      workflowId: workflow_id,
      version,
      bundleBuffer: req.file.buffer,
      deployedBy: req.user.email || req.user.id,
      metadata: metadata ? JSON.parse(metadata) : {}
    });
    
    res.status(result.deduplicated ? 200 : 201).json(result);
  } catch (err) {
    console.error('POST /bundles error:', err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /bundles/:hash
 * Get bundle metadata by hash
 */
router.get('/:hash', requireAuth, async (req, res) => {
  try {
    const bundle = await bundleService.getBundleByHash(req.params.hash);
    
    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }
    
    res.json(bundle);
  } catch (err) {
    console.error('GET /bundles/:hash error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /bundles/:hash/presigned
 * Get presigned download URL for VM fetch
 */
router.get('/:hash/presigned', requireAuth, async (req, res) => {
  try {
    const url = await bundleService.getPresignedUrl(req.params.hash);
    res.json({ url, expiresIn: 3600 });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'Bundle not found' });
    }
    console.error('GET /bundles/:hash/presigned error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /workflows
 * List all workflows for current tenant
 */
router.get('/workflows', requireAuth, async (req, res) => {
  try {
    const workflows = await bundleService.listTenantWorkflows(req.user.tenant_id);
    res.json({ workflows });
  } catch (err) {
    console.error('GET /workflows error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /workflows
 * Create new workflow
 */
router.post('/workflows', requireAuth, async (req, res) => {
  try {
    const { name, slug, description, runtime, entrypoint, memory_mb, timeout_sec } = req.body;
    
    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug required' });
    }
    
    const workflow = await bundleService.createWorkflow({
      tenantId: req.user.tenant_id,
      name,
      slug,
      description,
      runtime,
      entrypoint,
      memoryMb: memory_mb,
      timeoutSec: timeout_sec
    });
    
    res.status(201).json(workflow);
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: 'Workflow slug already exists' });
    }
    console.error('POST /workflows error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /workflows/:id/versions
 * List all versions for a workflow
 */
router.get('/workflows/:id/versions', requireAuth, async (req, res) => {
  try {
    const versions = await bundleService.listWorkflowVersions(req.params.id);
    res.json({ versions });
  } catch (err) {
    console.error('GET /workflows/:id/versions error:', err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /workflows/:id/active
 * Get active version for a workflow (used by orchestrator for spawning)
 */
router.get('/workflows/:id/active', requireAuth, async (req, res) => {
  try {
    const active = await bundleService.getActiveVersion(req.params.id);
    
    if (!active) {
      return res.status(404).json({ error: 'No active version found' });
    }
    
    res.json({
      workflow_id: active.workflow_id,
      version_id: active.id,
      version: active.version,
      bundle_url: active.bundle_url,
      bundle_hash: active.bundle_hash,
      runtime: active.runtime,
      entrypoint: active.entrypoint,
      memory_mb: active.memory_mb,
      timeout_sec: active.timeout_sec,
      deployed_at: active.deployed_at
    });
  } catch (err) {
    console.error('GET /workflows/:id/active error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /workflows/:id/versions/:versionId/activate
 * Activate a specific workflow version
 */
router.post('/workflows/:id/versions/:versionId/activate', requireAuth, async (req, res) => {
  try {
    const activated = await bundleService.activateVersion(req.params.id, req.params.versionId);
    
    res.json({
      message: 'Version activated',
      version: activated.version,
      version_id: activated.id,
      deployed_at: activated.deployed_at
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('POST /activate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Internal endpoint for engine/orchestrator (no auth required from internal network)
// This is mounted separately under /api/internal
const internalRouter = express.Router();

/**
 * GET /api/internal/spawn/:workflowId
 * Get spawn configuration for a workflow (called by orchestrator)
 * Returns bundle URL, hash, and runtime config
 */
internalRouter.get('/spawn/:workflowId', async (req, res) => {
  try {
    const active = await bundleService.getActiveVersion(req.params.workflowId);
    
    if (!active) {
      return res.status(404).json({ error: 'No active version' });
    }
    
    res.json({
      workflow_id: active.workflow_id,
      bundle_url: active.bundle_url,
      bundle_hash: active.bundle_hash,
      runtime: active.runtime,
      entrypoint: active.entrypoint,
      memory_mb: active.memory_mb,
      timeout_sec: active.timeout_sec
    });
  } catch (err) {
    console.error('GET /spawn/:workflowId error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, internalRouter };
