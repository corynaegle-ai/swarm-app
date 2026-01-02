/**
 * Bundle Service - MinIO + PostgreSQL operations for workflow bundles
 * 
 * Handles:
 * - Uploading bundles to MinIO
 * - Registering versions in PostgreSQL
 * - Activating workflow versions
 * - Retrieving bundle URLs for VM spawn
 */

const { Client: MinioClient } = require('minio');
const { queryAll, queryOne, execute } = require('../db');
const crypto = require('crypto');
const path = require('path');

// MinIO configuration
const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'swarm_admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'SwarmMinIO2025_Dev!'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'swarm-bundles';
const BUNDLE_PREFIX = 'bundles';

/**
 * Ensure bucket exists
 */
async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME);
    console.log(`Created MinIO bucket: ${BUCKET_NAME}`);
  }
}

/**
 * Calculate SHA256 hash of buffer
 */
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Upload bundle to MinIO and register in PostgreSQL
 * 
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.workflowId - Workflow UUID
 * @param {string} params.version - Semantic version (e.g., "1.0.0")
 * @param {Buffer} params.bundleBuffer - Tarball buffer
 * @param {string} params.deployedBy - User who deployed
 * @param {Object} params.metadata - Optional metadata
 * @returns {Object} Created version record
 */
async function uploadBundle({ tenantId, workflowId, version, bundleBuffer, deployedBy, metadata = {} }) {
  await ensureBucket();
  
  // Calculate hash for deduplication and integrity
  const bundleHash = calculateHash(bundleBuffer);
  const bundleSize = bundleBuffer.length;
  
  // Check if this exact bundle already exists
  const existing = await queryOne(
    'SELECT id, version, bundle_url FROM workflow_versions WHERE bundle_hash = $1',
    [bundleHash]
  );
  
  if (existing) {
    return {
      deduplicated: true,
      existingVersion: existing.version,
      versionId: existing.id,
      bundleUrl: existing.bundle_url,
      bundleHash
    };
  }
  
  // Upload to MinIO
  // Path: bundles/{tenant_id}/{workflow_id}/{hash}.tar.gz
  const objectName = `${BUNDLE_PREFIX}/${tenantId}/${workflowId}/${bundleHash}.tar.gz`;
  
  await minioClient.putObject(BUCKET_NAME, objectName, bundleBuffer, {
    'Content-Type': 'application/gzip',
    'x-amz-meta-workflow-id': workflowId,
    'x-amz-meta-version': version,
    'x-amz-meta-tenant-id': tenantId
  });
  
  // Generate internal URL (VMs fetch via internal network)
  const bundleUrl = `http://localhost:9000/${BUCKET_NAME}/${objectName}`;
  
  // Register in PostgreSQL
  const versionRecord = await queryOne(
    `INSERT INTO workflow_versions 
     (workflow_id, version, bundle_hash, bundle_url, bundle_size_bytes, deployed_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [workflowId, version, bundleHash, bundleUrl, bundleSize, deployedBy, JSON.stringify(metadata)]
  );
  
  return {
    deduplicated: false,
    versionId: versionRecord.id,
    version: versionRecord.version,
    bundleUrl: versionRecord.bundle_url,
    bundleHash: versionRecord.bundle_hash,
    bundleSize: versionRecord.bundle_size_bytes
  };
}


/**
 * Activate a specific workflow version
 * Deactivates any currently active version first
 * 
 * @param {string} workflowId - Workflow UUID
 * @param {string} versionId - Version UUID to activate
 * @returns {Object} Activated version record
 */
async function activateVersion(workflowId, versionId) {
  // Deactivate current active version
  await execute(
    'UPDATE workflow_versions SET is_active = false, deployed_at = NULL WHERE workflow_id = $1 AND is_active = true',
    [workflowId]
  );
  
  // Activate new version
  const activated = await queryOne(
    `UPDATE workflow_versions 
     SET is_active = true, deployed_at = NOW() 
     WHERE id = $1 AND workflow_id = $2
     RETURNING *`,
    [versionId, workflowId]
  );
  
  if (!activated) {
    throw new Error(`Version ${versionId} not found for workflow ${workflowId}`);
  }
  
  return activated;
}

/**
 * Get active version for a workflow (used by orchestrator for spawning)
 * 
 * @param {string} workflowId - Workflow UUID
 * @returns {Object|null} Active version with bundle URL and hash
 */
async function getActiveVersion(workflowId) {
  return queryOne(
    `SELECT wv.*, w.name as workflow_name, w.runtime, w.entrypoint, w.memory_mb, w.timeout_sec
     FROM workflow_versions wv
     JOIN workflows w ON w.id = wv.workflow_id
     WHERE wv.workflow_id = $1 AND wv.is_active = true`,
    [workflowId]
  );
}

/**
 * Get bundle URL by hash (for cache validation)
 * 
 * @param {string} bundleHash - SHA256 hash
 * @returns {Object|null} Version record with URL
 */
async function getBundleByHash(bundleHash) {
  return queryOne(
    'SELECT * FROM workflow_versions WHERE bundle_hash = $1',
    [bundleHash]
  );
}

/**
 * List all workflows for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @returns {Array} Workflow list with active version info
 */
async function listTenantWorkflows(tenantId) {
  return queryAll(
    `SELECT w.*, 
            (SELECT COUNT(*) FROM workflow_versions WHERE workflow_id = w.id) as version_count,
            (SELECT version FROM workflow_versions WHERE workflow_id = w.id AND is_active = true) as active_version
     FROM workflows w
     WHERE w.tenant_id = $1 AND w.is_active = true
     ORDER BY w.updated_at DESC`,
    [tenantId]
  );
}

/**
 * List all versions for a workflow
 * 
 * @param {string} workflowId - Workflow UUID
 * @returns {Array} Version list
 */
async function listWorkflowVersions(workflowId) {
  return queryAll(
    `SELECT * FROM workflow_versions 
     WHERE workflow_id = $1 
     ORDER BY created_at DESC`,
    [workflowId]
  );
}

/**
 * Create a new workflow
 * 
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string} params.name
 * @param {string} params.slug
 * @param {string} params.description
 * @param {string} params.runtime - node20, python311, custom
 * @param {string} params.entrypoint
 * @param {number} params.memoryMb - 256, 512, 1024, 2048
 * @param {number} params.timeoutSec
 * @returns {Object} Created workflow
 */
async function createWorkflow({ tenantId, name, slug, description, runtime = 'node20', entrypoint = 'src/index.js', memoryMb = 512, timeoutSec = 300 }) {
  return queryOne(
    `INSERT INTO workflows (tenant_id, name, slug, description, runtime, entrypoint, memory_mb, timeout_sec)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, name, slug, description, runtime, entrypoint, memoryMb, timeoutSec]
  );
}

/**
 * Generate presigned URL for direct bundle download (for VMs)
 * 
 * @param {string} bundleHash - Bundle hash
 * @param {number} expirySeconds - URL expiry (default 3600)
 * @returns {string} Presigned URL
 */
async function getPresignedUrl(bundleHash, expirySeconds = 3600) {
  const version = await getBundleByHash(bundleHash);
  if (!version) {
    throw new Error(`Bundle not found: ${bundleHash}`);
  }
  
  // Extract object name from stored URL
  const urlPath = new URL(version.bundle_url).pathname;
  const objectName = urlPath.substring(urlPath.indexOf('/', 1) + 1);
  
  return minioClient.presignedGetObject(BUCKET_NAME, objectName, expirySeconds);
}

module.exports = {
  uploadBundle,
  activateVersion,
  getActiveVersion,
  getBundleByHash,
  listTenantWorkflows,
  listWorkflowVersions,
  createWorkflow,
  getPresignedUrl,
  ensureBucket
};
