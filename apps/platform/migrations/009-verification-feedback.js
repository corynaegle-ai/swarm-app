/**
 * Migration 009: Add feedback_for_agent to verification_attempts
 * 
 * Purpose: Enable per-attempt feedback persistence for Phase 8 dashboard
 * 
 * Problem: Verifier creates feedback_for_agent but only stores in tickets table.
 * Solution: Add feedback_for_agent TEXT to verification_attempts.
 */

const Database = require('better-sqlite3');
const DB_PATH = process.env.DB_PATH || '/opt/swarm-platform/data/swarm.db';

function migrate() {
  console.log('🔄 Migration 009: verification-feedback');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  const columnExists = (table, column) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some(col => col.name === column);
  };
  
  try {
    db.exec('BEGIN TRANSACTION');
    
    if (!columnExists('verification_attempts', 'feedback_for_agent')) {
      console.log('📝 Adding feedback_for_agent column...');
      db.exec(`ALTER TABLE verification_attempts ADD COLUMN feedback_for_agent TEXT DEFAULT NULL`);
      console.log('✅ Column added');
    } else {
      console.log('✓ Column already exists');
    }
    
    // Add indexes for efficient querying
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_verification_ticket_attempt ON verification_attempts(ticket_id, attempt_number DESC)`);
      console.log('✅ Index created');
    } catch (e) {
      console.log('ℹ️  Index exists');
    }
    
    db.exec('COMMIT');
    console.log('✨ Migration 009 complete\n');
    
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
