const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
  constructor() {
    this.db = null;
  }

  init(dbPath = ':memory:') {
    this.db = new Database(dbPath);
    this.runMigrations();
    return this.db;
  }

  runMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).sort();
    
    for (const file of migrationFiles) {
      if (file.endsWith('.sql')) {
        const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        this.db.exec(migration);
      }
    }
  }

  getDatabase() {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = new DatabaseManager();