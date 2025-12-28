# Continue: Fix tenant_id Propagation Bug

## Context
We diagnosed why projects/tickets created via HITL are invisible in the dashboard. Root cause: **frontend doesn't send tenant_id when creating sessions**.

## Diagnosis Complete
- All `hitl_sessions` have `tenant_id = NULL` 
- Backend correctly expects `tenant_id` in POST body (line 103 hitl.js)
- `CreateProject.jsx` has access to `user.tenant_id` from `useAuth()`
- `useHITL.js` createSession doesn't pass it through

## Fix Required (2 files on DEV droplet 134.199.235.140)

### File 1: /opt/swarm-dashboard/src/hooks/useHITL.js
Line 40-50 - Add tenant_id parameter:
```javascript
// BEFORE:
const createSession = useCallback((projectName, description, projectType = 'application', extraParams = {}) => 

// AFTER:
const createSession = useCallback((projectName, description, projectType = 'application', tenantId = null, extraParams = {}) => 
```

And add to the body (around line 46):
```javascript
tenant_id: tenantId,
```

### File 2: /opt/swarm-dashboard/src/pages/CreateProject.jsx
Line ~190:
```javascript
// BEFORE:
const result = await createSession(projectName.trim(), description.trim());

// AFTER:
const result = await createSession(projectName.trim(), description.trim(), 'application', user?.tenant_id);
```

Line ~245:
```javascript
// BEFORE:
const result = await createSession(featureName.trim(), featureDescription.trim(), 'build_feature', {

// AFTER:
const result = await createSession(featureName.trim(), featureDescription.trim(), 'build_feature', user?.tenant_id, {
```

## Implementation Commands
```bash
# 1. Edit useHITL.js
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sed -n '38,55p' /opt/swarm-dashboard/src/hooks/useHITL.js"

# 2. Edit CreateProject.jsx  
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sed -n '188,195p' /opt/swarm-dashboard/src/pages/CreateProject.jsx"
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sed -n '243,250p' /opt/swarm-dashboard/src/pages/CreateProject.jsx"

# 3. Rebuild dashboard
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "cd /opt/swarm-dashboard && npm run build"

# 4. Test - create new session, verify tenant_id is set
```

## Verification Query
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && cd /opt/swarm-app/apps/platform && node -e \"const {Pool} = require('pg'); const p = new Pool({host:'localhost',user:'swarm',password:'swarm_dev_2024',database:'swarmdb'}); p.query('SELECT id, project_name, tenant_id FROM hitl_sessions ORDER BY created_at DESC LIMIT 3').then(r=>{console.log(JSON.stringify(r.rows,null,2));p.end()});\""
```

## Task
Apply the 2 file edits using sed or nano via SSH, rebuild dashboard, test by creating a new session and verify tenant_id is populated.
