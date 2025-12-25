import pg from 'pg';

// Same PostgreSQL connection as the SwarmEngine
const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'swarmdb',
  user: process.env.PG_USER || 'swarm',
  password: process.env.PG_PASSWORD || 'swarm_dev_2024',
};

let swarmPool: pg.Pool | null = null;

export async function getSwarmDb(): Promise<pg.Pool> {
  if (!swarmPool) {
    swarmPool = new pg.Pool(PG_CONFIG);
    await swarmPool.query('SELECT 1'); // Test connection
    console.log('[SWARM-DB] Connected to swarmdb');
  }
  return swarmPool;
}

export async function closeSwarmDb(): Promise<void> {
  if (swarmPool) {
    await swarmPool.end();
    swarmPool = null;
  }
}
