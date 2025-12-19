/**
 * Migration: Repo Integration for HITL → Project Flow
 * 
 * Adds:
 * - secrets table for storing credentials
 * - repo columns to projects table
 * - project_id link in hitl_sessions
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/opt/swarm-platform/data/swarm.db';

function migrate() {
  console.log('Starting migration: repo-integration');
  console.log(`Database: ${DB_PATH}`);
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // Helper to check if column exists
  const columnExists = (table, column) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some(col => col.name === column);
  };
  
  // Helper to check if table exists
  const tableExists = (table) => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(table);
    return !!result;
  };
  
  try {
    db.exec('BEGIN TRANSACTION');
    
    // 1. Create secrets table
    if (!tableExists('secrets')) {
      console.log('Creating secrets table...');
      db.exec(`
        CREATE TABLE secrets (
          id TEXT PRIMARY KEY,
          type TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          tenant_id TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_secrets_type ON secrets(type);
        CREATE INDEX idx_secrets_tenant ON secrets(tenant_id);
      `);
      console.log('✓ secrets table created');
    } else {
      console.log('✓ secrets table already exists');
    }
    
    // 2. Add columns to projects table
    const projectColumns = [
      { name: 'repo_provider', def: "TEXT DEFAULT 'github'" },
      { name: 'repo_owner', def: 'TEXT' },
      { name: 'repo_name', def: 'TEXT' },
      { name: 'repo_mode', def: "TEXT DEFAULT 'managed'" },
      { name: 'credentials_secret_id', def: 'TEXT' },
      { name: 'hitl_session_id', def: 'TEXT' }
    ];
    
    for (const col of projectColumns) {
      if (!columnExists('projects', col.name)) {
        console.log(`Adding projects.${col.name}...`);
        db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.def}`);
        console.log(`✓ projects.${col.name} added`);
      } else {
        console.log(`✓ projects.${col.name} already exists`);
      }
    }
    
    // 3. Make repo_url nullable (SQLite workaround - can't modify constraint)
    // We'll just allow empty string as fallback
    
    // 4. Add project_id to hitl_sessions
    if (!columnExists('hitl_sessions', 'project_id')) {
      console.log('Adding hitl_sessions.project_id...');
      db.exec('ALTER TABLE hitl_sessions ADD COLUMN project_id TEXT');
      console.log('✓ hitl_sessions.project_id added');
    } else {
      console.log('✓ hitl_sessions.project_id already exists');
    }
    
    db.exec('COMMIT');
    console.log('\n✅ Migration completed successfully');
    
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
