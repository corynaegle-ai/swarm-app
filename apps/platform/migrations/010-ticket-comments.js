const Database = require('../../../lib/Database.js');

module.exports = {
  async up() {
    const db = new Database();
    
    // Create ticket_comments table
    await db.run(`
      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        comment_text TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);
    
    // Create index on ticket_id for efficient lookups
    await db.run(`
      CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id)
    `);
    
    // Create index on created_at for efficient sorting
    await db.run(`
      CREATE INDEX idx_ticket_comments_created_at ON ticket_comments(created_at)
    `);
    
    console.log('Created ticket_comments table with indexes');
  },
  
  async down() {
    const db = new Database();
    
    // Drop indexes first
    await db.run('DROP INDEX IF EXISTS idx_ticket_comments_created_at');
    await db.run('DROP INDEX IF EXISTS idx_ticket_comments_ticket_id');
    
    // Drop table
    await db.run('DROP TABLE IF EXISTS ticket_comments');
    
    console.log('Dropped ticket_comments table and indexes');
  }
};
