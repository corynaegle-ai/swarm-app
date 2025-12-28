# Phase 2: Create Auth Module (JWT + bcrypt)

**Project**: Swarm Dashboard Authentication
**Phase**: 2 of 7
**Estimated Time**: 15-20 minutes
**Prerequisite**: Phase 1 complete (users table exists)

---

## Context

Create a reusable auth module that handles JWT token generation/validation and password hashing. This module will be imported by routes and middleware.

## Objective

Create `/opt/swarm-tickets/lib/auth.js` with JWT and bcrypt utilities.

## Implementation

### File: `/opt/swarm-tickets/lib/auth.js`

```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'swarm-dev-secret-change-in-prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'swarm-refresh-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_ROUNDS = 12;

// Password hashing
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// JWT tokens
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};
```

## Steps

1. SSH to droplet
2. Install dependencies: `cd /opt/swarm-tickets && npm install jsonwebtoken bcrypt`
3. Create lib directory: `mkdir -p /opt/swarm-tickets/lib`
4. Create auth.js with the module code
5. Test import: `node -e "const auth = require('./lib/auth'); console.log(Object.keys(auth));"`

## Success Criteria

- [ ] jsonwebtoken and bcrypt installed in package.json
- [ ] `/opt/swarm-tickets/lib/auth.js` exists
- [ ] Module exports all 6 functions
- [ ] Test import succeeds without errors

## Session Notes Update

Update Step 2 status from ⏳ to ✅ in session notes.
