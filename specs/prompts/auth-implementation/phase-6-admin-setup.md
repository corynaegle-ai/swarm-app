# Phase 6: Create Admin Setup Script

**Project**: Swarm Dashboard Authentication
**Phase**: 6 of 7
**Estimated Time**: 10-15 minutes
**Prerequisite**: Phases 1-5 complete

---

## Context

A setup script to create the initial admin user. Run once during deployment. Credentials should be provided via environment variables or prompts.

## Objective

Create `/opt/swarm-tickets/scripts/setup-admin.js`

## Implementation

### File: `/opt/swarm-tickets/scripts/setup-admin.js`

```javascript
#!/usr/bin/env node

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const readline = require('readline');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'tickets.db');
const BCRYPT_ROUNDS = 12;

async function prompt(question, hidden = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    if (hidden) {
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (char) => {
        char = char.toString();
        if (char === '\n' || char === '\r') {
          process.stdin.setRawMode(false);
          console.log();
          rl.close();
          resolve(input);
        } else if (char === '\u0003') {
          process.exit();
        } else if (char === '\u007F') {
          input = input.slice(0, -1);
        } else {
          input += char;
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  console.log('=== Swarm Admin Setup ===\n');
  
  // Check for env vars first
  let email = process.env.SWARM_ADMIN_EMAIL;
  let password = process.env.SWARM_ADMIN_PASSWORD;
  let name = process.env.SWARM_ADMIN_NAME || 'Admin';
  
  // Prompt if not provided
  if (!email) {
    email = await prompt('Admin email: ');
  }
  if (!password) {
    password = await prompt('Admin password: ', true);
    const confirm = await prompt('Confirm password: ', true);
    if (password !== confirm) {
      console.error('Passwords do not match');
      process.exit(1);
    }
  }
  if (!process.env.SWARM_ADMIN_NAME) {
    name = await prompt('Admin name [Admin]: ') || 'Admin';
  }
  
  // Validate
  if (!email || !password) {
    console.error('Email and password are required');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }
  
  // Open database
  const db = new Database(DB_PATH);
  
  // Check if admin exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.error(`User with email ${email} already exists`);
    process.exit(1);
  }
  
  // Create admin
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run(id, email, passwordHash, name);
  
  console.log(`\n✅ Admin user created successfully`);
  console.log(`   Email: ${email}`);
  console.log(`   Role: admin`);
  
  db.close();
}

main().catch(console.error);
```

## Usage

### Interactive mode:
```bash
node scripts/setup-admin.js
```

### Environment variables:
```bash
SWARM_ADMIN_EMAIL=admin@swarm.local \
SWARM_ADMIN_PASSWORD=securepassword123 \
SWARM_ADMIN_NAME="System Admin" \
node scripts/setup-admin.js
```

## Steps

1. SSH to droplet
2. Create scripts directory: `mkdir -p /opt/swarm-tickets/scripts`
3. Create setup-admin.js
4. Make executable: `chmod +x scripts/setup-admin.js`
5. Run setup script to create admin user
6. Test login with created credentials

## Success Criteria

- [ ] setup-admin.js exists and is executable
- [ ] Script creates admin user in database
- [ ] Admin can login via /api/auth/login
- [ ] Duplicate email prevention works

## Session Notes Update

Update Step 6 status from ⏳ to ✅.
