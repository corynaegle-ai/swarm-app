# Auth Audit Completion Prompt

**Created**: 2024-12-11
**Purpose**: Complete the Swarm Dashboard authentication system audit

---

## Context

You are a master systems architect auditing the Swarm Dashboard authentication system. A previous session was interrupted while checking for seeded users in the database.

## Swarm Dashboard Location
```
/opt/swarm-dashboard
├── frontend/    # React/Vite login UI
└── backend/     # Express API with auth routes
```

## What's Already Verified ✅
- Dashboard structure exists at `/opt/swarm-dashboard`
- Frontend auth components are complete
- Backend auth routes are comprehensive and mounted in server.js
- Auth middleware exists

## Issues Found ⚠️
1. **CORS Config**: Using defaults - needs explicit origin configuration for dashboard

## Resume From Here

### Step 1: Check Database Users
```bash
ssh -o ConnectTimeout=10 root@146.190.35.235 'export PATH="/root/.nvm/versions/node/v20.19.2/bin:$PATH" && sqlite3 /opt/swarm-tickets/tickets.db "SELECT id, email, role FROM users LIMIT 10;"'
```

### Step 2: If No Users, Check Seed Script
```bash
ssh root@146.190.35.235 'head -50 /opt/swarm-dashboard/backend/scripts/seed-users.js'
```

### Step 3: Fix CORS Configuration
Check and update CORS in `/opt/swarm-dashboard/backend/server.js`:
```javascript
// Should have explicit origin:
cors({
  origin: ['http://localhost:5173', 'https://dashboard.swarmstack.net'],
  credentials: true
})
```

### Step 4: Test Auth Flow
```bash
# Test login endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}'
```

## Success Criteria
- [ ] Users exist in database (or are seeded)
- [ ] CORS configured with explicit origins
- [ ] Login endpoint returns JWT token
- [ ] Frontend can authenticate successfully

## Anti-Freeze Protocol
- Max 3 SSH commands per checkpoint
- Pipe large outputs through `head -50` or `tail -20`
- Checkpoint progress after each step
