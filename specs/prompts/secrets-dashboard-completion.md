# Complete Secrets Management Dashboard

## Context

A secrets management system was partially built for Swarm. The backend infrastructure is deployed, but frontend integration is incomplete.

## What Already Exists (on droplet 146.190.35.235)

### Deployed Infrastructure
- `/opt/swarm/secrets/` - Secrets storage directory (700 perms)
- `/opt/swarm/secrets/github/deploy_key` - GitHub SSH key (migrated from host)
- `/opt/swarm/secrets/registry/secrets.json` - Secrets metadata
- `/usr/local/bin/swarm-update-secrets-snapshot` - Script to inject keys into rootfs
- All 10 rootfs files updated with latest keys

### Source Files Ready (in Claude outputs or recreate from specs below)
- `api-secrets.js` - Backend API module
- `Secrets.jsx` - Frontend React page
- `App.jsx` - Updated router with /secrets route

## Tasks to Complete

### Step 1: Verify GitHub Auth in VM
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
swarm-cleanup --force
swarm-boot-vm 0
sleep 5
ssh root@10.0.0.2 "ssh -T git@github.com"
# Expected: "Hi corynaegle-ai! You have successfully authenticated..."
swarm-cleanup --force
```

### Step 2: Deploy Backend API

Create `/opt/swarm-tickets/api-secrets.js` with these endpoints:
- `GET /api/secrets` - List all secrets (masked)
- `GET /api/secrets/:type` - Get specific secret details
- `PUT /api/secrets/:type` - Update a secret value
- `POST /api/secrets/:type/validate` - Test secret works
- `POST /api/secrets/snapshot` - Trigger snapshot update
- `GET /api/secrets/snapshot/status` - Get update progress
- `POST /api/secrets/generate-key` - Generate new SSH key pair

Then integrate into api-server-dashboard.js:
```javascript
// Add import at top
import { registerSecretsRoutes } from ./api-secrets.js;

// Add after other route registrations
registerSecretsRoutes(app, authMiddleware, adminMiddleware);
```

### Step 3: Deploy Frontend Page

Create `/opt/swarm-dashboard/src/pages/Secrets.jsx` with:
- List of secrets (GitHub SSH Key, Anthropic API Key)
- Validate button for each secret
- Update/Upload modal for each secret
- Generate SSH Key button
- Update Snapshot button with progress display

### Step 4: Update App Router

Update `/opt/swarm-dashboard/src/App.jsx`:
```jsx
import Secrets from ./pages/Secrets;

// Add route inside Routes:
<Route path="/secrets" element={
  <ProtectedRoute adminOnly>
    <Secrets />
  </ProtectedRoute>
} />
```

### Step 5: Rebuild and Test

```bash
cd /opt/swarm-dashboard
npm run build
cp -r dist/* /var/www/swarmstack/

# Restart API server
systemctl restart swarm-api
# Or if using pm2:
pm2 restart swarm-api

# Test in browser
# https://swarmstack.net/secrets (admin login required)
```

### Step 6: Add Dashboard Navigation Link

Update Dashboard.jsx to add a link to /secrets for admin users.

## API Module Specification

```javascript
// Key functions needed in api-secrets.js:

// Directories
const SECRETS_DIR = /opt/swarm/secrets;

// Endpoints:
// GET /api/secrets - returns { secrets: [...] } with masked values
// PUT /api/secrets/github - accepts { value: privateKey, publicKey: optional }
// PUT /api/secrets/anthropic - accepts { value: apiKey }
// POST /api/secrets/github/validate - runs ssh -T git@github.com
// POST /api/secrets/anthropic/validate - tests API with curl
// POST /api/secrets/snapshot - runs swarm-update-secrets-snapshot
// POST /api/secrets/generate-key - runs ssh-keygen, returns { privateKey, publicKey }
```

## Success Criteria

- [ ] VM GitHub auth verified working
- [ ] `/api/secrets` endpoint returns list of secrets
- [ ] `/api/secrets/github/validate` confirms GitHub auth
- [ ] `/secrets` page loads in dashboard (admin only)
- [ ] Can upload new SSH key via UI
- [ ] Can trigger snapshot update via UI
- [ ] Snapshot update injects key into all rootfs files

## Anti-Freeze Protocol

- Use `head -50` when reading files
- SSH timeout 15s max
- Max 3 chained commands per tool call
- Checkpoint progress after each major step
