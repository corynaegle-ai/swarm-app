import pg from 'pg';
import dotenv from 'dotenv';

// Load env before creating pool
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'swarm_orchestrator',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = pool;

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS flows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        definition JSONB NOT NULL,
        active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL REFERENCES flows(id),
        status TEXT NOT NULL,
        trigger_data JSONB,
        current_node_id TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS step_results (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES executions(id),
        node_id TEXT NOT NULL,
        step_type TEXT NOT NULL,
        inputs JSONB,
        outputs JSONB,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL REFERENCES flows(id),
        cron_expression TEXT NOT NULL,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        active BOOLEAN DEFAULT TRUE
      );

      CREATE INDEX IF NOT EXISTS idx_executions_flow_id ON executions(flow_id);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_step_results_execution_id ON step_results(execution_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);
    `);
    console.log('[DB] PostgreSQL database initialized');
  } finally {
    client.release();
  }
}
