/**
 * PostgreSQL Database Layer
 * Provides helper methods for easy route migration from SQLite
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'swarmdb',
  user: process.env.PG_USER || 'swarm',
  password: process.env.PG_PASSWORD || 'swarm_dev_2024',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => console.log('PostgreSQL client connected'));
pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));

// Test connection (non-fatal - allows server to start without DB for investigation)
pool.query('SELECT NOW()')
  .then(() => console.log('PostgreSQL connected successfully'))
  .catch(err => {
    console.error('PostgreSQL connection failed:', err.message);
    console.warn('WARNING: Server starting without database connection');
  });

/**
 * Execute query and return all rows
 */
async function queryAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Execute query and return first row (like SQLite .get())
 */
async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

/**
 * Execute query and return row count (like SQLite .run())
 */
async function execute(sql, params = []) {
  const result = await pool.query(sql, params);
  return { changes: result.rowCount, lastID: null };
}

/**
 * Raw query access
 */
async function query(sql, params = []) {
  return pool.query(sql, params);
}

/**
 * Get client for transactions
 */
async function getClient() {
  return pool.connect();
}

/**
 * Close pool gracefully
 */
async function closeDb() {
  console.log('Closing PostgreSQL pool...');
  await pool.end();
  console.log('PostgreSQL pool closed');
}

/**
 * Get the pool instance for transactions
 */
function getPool() {
  return pool;
}

module.exports = {
  getPool,
  pool,
  query,
  queryAll,
  queryOne,
  execute,
  getClient,
  closeDb
};
