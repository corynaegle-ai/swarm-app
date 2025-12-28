/**
 * Artifact Store
 * Persists execution artifacts (stdout, stderr, files, PR URLs)
 * Uses PostgreSQL for storage with optional file-based large artifact support
 */
import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Artifact types
export const ARTIFACT_TYPE = {
  STDOUT: 'stdout',
  STDERR: 'stderr',
  FILE: 'file',
  PR_URL: 'pr_url',
  LOG: 'log',
  METRICS: 'metrics',
  CHECKPOINT: 'checkpoint'
};

export class ArtifactStore {
  constructor(options = {}) {
    this.pool = options.pool; // Shared Postgres pool
    this.artifactDir = options.artifactDir || '/opt/swarm-engine/artifacts';
    this.maxInlineSize = options.maxInlineSize || 64 * 1024; // 64KB inline limit

    if (!this.pool) {
      throw new Error('ArtifactStore requires a Postgres connection pool');
    }
  }

  /**
   * Initialize the artifact store
   */
  async init() {
    // Ensure artifact directory exists
    if (!existsSync(this.artifactDir)) {
      try {
        mkdirSync(this.artifactDir, { recursive: true });
      } catch (e) {
        // Ignore permission errors in dev if already exists
      }
    }

    await this.createTables();
  }

  /**
   * Create database tables
   */
  async createTables() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Execution artifacts
      await client.query(`
          CREATE TABLE IF NOT EXISTS execution_artifacts (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            workflow_run_id TEXT,
            step_id TEXT,
            vm_id INTEGER,
            artifact_type TEXT NOT NULL,
            content TEXT,
            file_path TEXT,
            size_bytes INTEGER,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ
          )
        `);

      // Helper to safely add columns
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS workflow_run_id TEXT`);
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS step_id TEXT`);
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS vm_id INTEGER`);
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS metadata JSONB`);
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS file_path TEXT`);
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS size_bytes INTEGER`);
      await client.query(`ALTER TABLE execution_artifacts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);

      await client.query('CREATE INDEX IF NOT EXISTS idx_artifacts_ticket ON execution_artifacts(ticket_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_artifacts_run ON execution_artifacts(workflow_run_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_artifacts_type ON execution_artifacts(artifact_type)');

      // VM assignments tracking
      await client.query(`
          CREATE TABLE IF NOT EXISTS vm_assignments (
            vm_id INTEGER PRIMARY KEY,
            ticket_id TEXT,
            workflow_run_id TEXT,
            step_id TEXT,
            assigned_at TIMESTAMPTZ DEFAULT NOW(),
            status TEXT DEFAULT 'running',
            completed_at TIMESTAMPTZ,
            exit_code INTEGER
          )
        `);

      await client.query(`ALTER TABLE vm_assignments ADD COLUMN IF NOT EXISTS workflow_run_id TEXT`);
      await client.query(`ALTER TABLE vm_assignments ADD COLUMN IF NOT EXISTS step_id TEXT`);

      await client.query('CREATE INDEX IF NOT EXISTS idx_vm_assign_ticket ON vm_assignments(ticket_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_vm_assign_status ON vm_assignments(status)');

      // Execution metrics
      await client.query(`
          CREATE TABLE IF NOT EXISTS execution_metrics (
            id TEXT PRIMARY KEY,
            ticket_id TEXT,
            workflow_run_id TEXT,
            step_id TEXT,
            vm_id INTEGER,
            metric_name TEXT NOT NULL,
            metric_value REAL,
            unit TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_metrics_ticket ON execution_metrics(ticket_id)');

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Failed to create tables:', e);
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Store an artifact
   */
  async storeArtifact(artifact) {
    const id = artifact.id || randomUUID();
    let content = artifact.content;
    let filePath = null;
    let sizeBytes = 0;

    if (content) {
      sizeBytes = Buffer.byteLength(content, 'utf-8');

      // Store large artifacts to file
      if (sizeBytes > this.maxInlineSize) {
        filePath = join(this.artifactDir, `${id}.artifact`);
        writeFileSync(filePath, content);
        content = null; // Don't store in DB
      }
    }

    await this.pool.query(`
      INSERT INTO execution_artifacts 
        (id, ticket_id, workflow_run_id, step_id, vm_id, artifact_type, content, file_path, size_bytes, metadata, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id,
      artifact.ticketId,
      artifact.workflowRunId || null,
      artifact.stepId || null,
      artifact.vmId || null,
      artifact.type,
      content,
      filePath,
      sizeBytes,
      JSON.stringify(artifact.metadata || {}),
      artifact.expiresAt || null
    ]);

    return id;
  }

  /**
   * Get artifact by ID
   */
  async getArtifact(id) {
    const res = await this.pool.query('SELECT * FROM execution_artifacts WHERE id = $1', [id]);
    const row = res.rows[0];

    if (!row) return null;

    // Load content from file if needed
    if (row.file_path && existsSync(row.file_path)) {
      row.content = readFileSync(row.file_path, 'utf-8');
    }

    // metadata is already JSON object in pg/jsonb usually, but if driver returns string parse it?
    // pg driver auto-parses json columns.
    // But row.metadata might be object.
    return row;
  }

  /**
   * Get artifacts for a ticket
   */
  async getArtifactsForTicket(ticketId, type = null) {
    let sql = 'SELECT * FROM execution_artifacts WHERE ticket_id = $1';
    const params = [ticketId];

    if (type) {
      sql += ' AND artifact_type = $2';
      params.push(type);
    }

    sql += ' ORDER BY created_at ASC';

    const res = await this.pool.query(sql, params);

    return res.rows.map(row => {
      if (row.file_path && existsSync(row.file_path)) {
        row.content = readFileSync(row.file_path, 'utf-8');
      }
      return row;
    });
  }

  /**
   * Record VM assignment
   */
  async recordVMAssignment(vmId, ticketId, workflowRunId = null, stepId = null) {
    await this.pool.query(`
      INSERT INTO vm_assignments 
        (vm_id, ticket_id, workflow_run_id, step_id, assigned_at, status)
      VALUES ($1, $2, $3, $4, NOW(), 'running')
      ON CONFLICT (vm_id) DO UPDATE SET
        ticket_id = EXCLUDED.ticket_id,
        workflow_run_id = EXCLUDED.workflow_run_id,
        step_id = EXCLUDED.step_id,
        assigned_at = NOW(),
        status = 'running'
    `, [vmId, ticketId, workflowRunId, stepId]);
  }

  /**
   * Update VM assignment status
   */
  async updateVMAssignment(vmId, status, exitCode = null) {
    await this.pool.query(`
      UPDATE vm_assignments 
      SET status = $1, completed_at = NOW(), exit_code = $2
      WHERE vm_id = $3
    `, [status, exitCode, vmId]);
  }

  /**
   * Get active VM assignments
   */
  async getActiveAssignments() {
    const res = await this.pool.query(
      "SELECT * FROM vm_assignments WHERE status = 'running' ORDER BY assigned_at ASC"
    );
    return res.rows;
  }

  /**
   * Record execution metric
   */
  async recordMetric(data) {
    const id = randomUUID();

    await this.pool.query(`
      INSERT INTO execution_metrics 
        (id, ticket_id, workflow_run_id, step_id, vm_id, metric_name, metric_value, unit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      data.ticketId || null,
      data.workflowRunId || null,
      data.stepId || null,
      data.vmId || null,
      data.name,
      data.value,
      data.unit || null
    ]);

    return id;
  }

  /**
   * Get metrics for a ticket
   */
  async getMetricsForTicket(ticketId) {
    const res = await this.pool.query(
      'SELECT * FROM execution_metrics WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId]
    );
    return res.rows;
  }

  /**
   * Cleanup expired artifacts
   */
  async cleanupExpired() {
    const res = await this.pool.query(`
      DELETE FROM execution_artifacts 
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `);

    return res.rowCount;
  }

  /**
   * Close - pass through, nothing to do as pool is managed by engine
   */
  close() {
    // Pool is shared, don't close here
  }
}

export default ArtifactStore;
