/**
 * Seed PostgreSQL with initial users
 */
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'swarmdb',
  user: 'swarm',
  password: 'swarm_prod_2024'
});

async function seed() {
  try {
    const adminHash = await bcrypt.hash('AdminTest123!', 10);
    const testHash = await bcrypt.hash('TestUser123!', 10);
    
    await pool.query('DELETE FROM users');
    
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, role_id, tenant_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['user-admin-001', 'admin@swarmstack.net', adminHash, 'Admin User', 'admin', 'role-admin', 'tenant-swarm']
    );
    
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, role_id, tenant_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['user-test-001', 'test@swarmstack.net', testHash, 'Test User', 'user', 'role-developer', 'tenant-swarm']
    );
    
    const users = await pool.query('SELECT id, email, name, role FROM users');
    console.log('Users seeded:', users.rows);
    
    await pool.end();
    console.log('Done!');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
