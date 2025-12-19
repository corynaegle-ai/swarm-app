const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const db = new Database('/opt/swarm-platform/data/swarm.db');

// Create users table
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',
  role_id TEXT,
  tenant_id TEXT,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

console.log('Users table created');

// Create admin user
const adminHash = bcrypt.hashSync('AdminTest123!', 10);
const testHash = bcrypt.hashSync('TestUser123!', 10);

const insert = db.prepare('INSERT OR REPLACE INTO users (id, email, password_hash, name, role, role_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
insert.run('user-admin-001', 'admin@swarmstack.net', adminHash, 'Admin User', 'admin', 'role-admin', 'tenant-swarm');
insert.run('user-test-001', 'test@swarmstack.net', testHash, 'Test User', 'user', 'role-developer', 'tenant-swarm');

console.log('Users created');
console.log(db.prepare('SELECT id, email, name, role FROM users').all());
db.close();
