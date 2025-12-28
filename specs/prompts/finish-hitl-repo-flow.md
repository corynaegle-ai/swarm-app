# Prompt: Complete HITL → Repo → Project Flow

## Context

We're implementing the flow where an approved HITL design session creates a GitHub repo and project record. The backend endpoints and modal component are done. This session needs to wire the modal into the UI and test end-to-end.

## What's Already Done

### Backend Endpoints (in `/opt/swarm-platform/routes/repo.js`)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/repo/provision` | Creates managed repo at `corynaegle-ai/swarm-managed-{name}` |
| `POST /api/repo/link` | Links user's existing repo with their PAT |
| `GET /api/repo/check/:sessionId` | Checks if session already has a project/repo |

**Provision request:**
```json
{ "hitl_session_id": "uuid" }
```

**Provision response:**
```json
{
  "success": true,
  "project_id": "uuid",
  "repo_url": "https://github.com/corynaegle-ai/swarm-managed-xxx",
  "repo_owner": "corynaegle-ai",
  "repo_name": "swarm-managed-xxx",
  "mode": "managed"
}
```

### Frontend Component (in `/opt/swarm-dashboard/src/components/RepoSetupModal.jsx`)

```jsx
<RepoSetupModal
  sessionId="uuid"           // HITL session ID
  projectName="My Project"   // For generating repo name preview
  onSuccess={(data) => {}}   // Called with provision/link response
  onCancel={() => {}}        // Called when user clicks Cancel
/>
```

Features:
- Two radio options: managed repo vs linked repo
- Shows preview URL for managed repos
- PAT input for linked repos
- Loading/error states
- Calls the backend endpoints

## Remaining Steps

### Step 8: Wire Modal into DesignSession.jsx

The DesignSession page (`/opt/swarm-dashboard/src/pages/DesignSession.jsx`) handles the design flow. When user approves a spec, we need to:

1. Show RepoSetupModal instead of immediately transitioning
2. On modal success → navigate to project page or show success
3. On modal cancel → stay on page

**Current approve flow location:** Find where `state === 'approved'` or approve action is triggered.

**Integration pattern:**
```jsx
import RepoSetupModal from '../components/RepoSetupModal';

// Add state
const [showRepoModal, setShowRepoModal] = useState(false);

// When approve button clicked (or state becomes approved):
setShowRepoModal(true);

// In render:
{showRepoModal && (
  <RepoSetupModal
    sessionId={sessionId}
    projectName={session.project_name}
    onSuccess={(data) => {
      setShowRepoModal(false);
      // Navigate to project or show success
      navigate(`/projects/${data.project_id}`);
    }}
    onCancel={() => setShowRepoModal(false)}
  />
)}
```

### Step 9: End-to-End Test

1. Go to https://dashboard.swarmstack.net/projects/new
2. Create a new project with name and description
3. Go through clarification flow until spec is generated
4. Approve the spec
5. Verify modal appears with repo options
6. Select "Create new repo" and click "Start Building"
7. Verify:
   - GitHub repo created at `corynaegle-ai/swarm-managed-{name}`
   - Project record exists in database
   - User redirected appropriately

### Step 10: Commit & Push

```bash
# On droplet
cd /opt/swarm-dashboard
git add -A
git commit -m "Add RepoSetupModal and wire into approve flow"
git push origin main

cd /opt/swarm-platform
git add -A
git commit -m "Add repo provisioning endpoints"
git push origin main

# Sync local repos
cd ~/swarm-dashboard && git pull
cd ~/swarm-platform && git pull
```

## Key File Locations

| File | Path |
|------|------|
| Repo routes | `/opt/swarm-platform/routes/repo.js` |
| RepoSetupModal | `/opt/swarm-dashboard/src/components/RepoSetupModal.jsx` |
| DesignSession page | `/opt/swarm-dashboard/src/pages/DesignSession.jsx` |
| HITL hook | `/opt/swarm-dashboard/src/hooks/useHITL.js` |
| Database | `/opt/swarm-platform/data/swarm.db` |

## Database Schema (relevant tables)

```sql
-- projects table has these repo columns:
repo_provider TEXT DEFAULT 'github'
repo_owner TEXT
repo_name TEXT  
repo_mode TEXT DEFAULT 'managed'  -- 'managed' or 'linked'
credentials_secret_id TEXT        -- FK to secrets for linked repos
hitl_session_id TEXT              -- FK to hitl_sessions

-- hitl_sessions states:
-- input → clarifying → ready_for_docs → reviewing → approved → building
```

## Test Credentials

- Dashboard: https://dashboard.swarmstack.net
- Login: admin@swarmstack.net / AdminTest123!

## Commands Reference

```bash
# SSH to droplet
ssh root@146.190.35.235

# Restart API
pm2 restart swarm-platform

# Rebuild dashboard
cd /opt/swarm-dashboard && npm run build

# Check logs
pm2 logs swarm-platform --lines 20

# Database queries
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT * FROM projects"
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, project_name, state FROM hitl_sessions"
```

## Success Criteria

- [ ] RepoSetupModal appears when user approves a spec
- [ ] "Create new repo" option creates GitHub repo and project record
- [ ] "Use my existing repo" option validates PAT and links repo
- [ ] User is navigated to project page after repo setup
- [ ] All changes committed to GitHub
