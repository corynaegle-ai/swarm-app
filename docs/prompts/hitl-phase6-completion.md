# HITL Phase 6 Completion Prompt

## Context

You are continuing development of the Swarm HITL (Human-in-the-Loop) design system. Phases 1-5 are complete:

- ✅ Phase 1: Database schema (`hitl_sessions`, `hitl_messages`, `hitl_state_transitions`)
- ✅ Phase 2: Session gate middleware  
- ✅ Phase 3: AI Dispatcher service
- ✅ Phase 4: Clarification Agent (Claude integration)
- ✅ Phase 5: UI - CreateProject + DesignSession pages with auto-start clarification

**Critical Fix Applied:** Sessions now auto-trigger clarification when loaded in `input` state with a description.

## Current System State

### Architecture
```
Dashboard (React SPA)          Platform API (Express)
dashboard.swarmstack.net  →    localhost:8080
/opt/swarm-dashboard/dist      /opt/swarm-platform

Caddy reverse proxy handles HTTPS + routing
```

### Database Location
```
/opt/swarm-platform/data/swarm.db
```

### Key Tables
```sql
hitl_sessions: id, tenant_id, project_name, description, state, clarification_context, spec_card, progress_percent
hitl_messages: id, session_id, role, content, created_at
hitl_state_transitions: id, session_id, from_state, to_state, triggered_by, created_at
```

### State Machine
```
input → clarifying → ready_for_docs → reviewing → approved → building → completed
                                          ↓
                                     (revision loop back to clarifying)
```

### API Endpoints (all under /api/hitl)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | / | Create session | ✅ |
| GET | /:id | Get session + messages | ✅ |
| POST | /:id/start-clarification | Trigger AI questions | ✅ |
| POST | /:id/respond | User answers question | ✅ |
| POST | /:id/generate-spec | Create spec card | ⚠️ Verify |
| POST | /:id/approve | Approve spec | ⚠️ Verify |
| POST | /:id/request-revision | Send back with feedback | ⚠️ Verify |
| POST | /:id/update-spec | Edit spec content | ⚠️ Verify |
| POST | /:id/start-build | Trigger execution | ⬜ Wire to engine |

### Secrets Location
```
/opt/swarm-platform/secrets.env
Contains: ANTHROPIC_API_KEY, GITHUB_TOKEN
```

## Remaining Work

### Phase 6: Review & Approval UI (P0)

**Goal:** Build the spec card review interface in DesignSession.jsx

#### 6.1 Spec Card Display Component
When `session.state === 'reviewing'` and `session.spec_card` exists:

```jsx
// Parse spec_card JSON and display structured view
const specCard = JSON.parse(session.spec_card);

// Display sections:
// - Project Overview (name, description, goals)
// - User Stories / Features list
// - Technical Requirements
// - Acceptance Criteria
// - Constraints & Timeline
```

#### 6.2 Spec Editing Mode
- Toggle between view/edit modes
- Textarea or structured form for spec modifications
- Save changes via `POST /api/hitl/:id/update-spec`

#### 6.3 Approval Actions
```jsx
// Approve button - triggers build
<button onClick={() => approveSpec(sessionId)}>
  ✅ Approve & Start Build
</button>

// Revision button - opens feedback input
<button onClick={() => setShowRevisionInput(true)}>
  🔄 Request Revision
</button>

// Revision feedback form
<textarea value={revisionFeedback} onChange={...} />
<button onClick={() => requestRevision(sessionId, revisionFeedback)}>
  Submit Feedback
</button>
```

#### 6.4 State-Aware Rendering
Update DesignSession.jsx to render different UI based on state:

```jsx
{session?.state === 'clarifying' && <ChatInterface />}
{session?.state === 'ready_for_docs' && <GenerateSpecButton />}
{session?.state === 'reviewing' && <SpecReviewPanel />}
{session?.state === 'approved' && <BuildConfirmation />}
{session?.state === 'building' && <BuildProgress />}
```

### Phase 7: Execution Engine Integration (P1)

Wire the `start-build` endpoint to trigger the Agent Execution Engine:

```javascript
// In routes/hitl.js - POST /:id/start-build
// After state transition to 'building':

// 1. Generate tickets from spec_card
const tickets = await generateTicketsFromSpec(session.spec_card);

// 2. Create workflow in registry
const workflowId = await createWorkflow(sessionId, tickets);

// 3. Dispatch to engine
await engineClient.startWorkflow(workflowId);
```

### Cleanup Tasks (P2)

1. **Fix trust proxy warning** in server.js:
```javascript
app.set('trust proxy', 1); // Already set, verify it's before rate limiter
```

2. **Add WebSocket events** for real-time spec generation progress

3. **Error handling** for Claude API failures during spec generation

## Test Commands

```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.nvm/versions/node/v22.12.0/bin

# Check platform status
pm2 logs swarm-platform --lines 20 --nostream

# Test create session
curl -s -X POST http://localhost:8080/api/hitl \
  -H 'Content-Type: application/json' \
  -d '{"project_name": "Test", "description": "A test project"}'

# Test start clarification (replace SESSION_ID)
curl -s -X POST http://localhost:8080/api/hitl/SESSION_ID/start-clarification

# Test generate spec (session must be in clarifying or ready_for_docs)
curl -s -X POST http://localhost:8080/api/hitl/SESSION_ID/generate-spec

# Query database
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state, progress_percent FROM hitl_sessions ORDER BY created_at DESC LIMIT 5;"

# Rebuild dashboard after changes
cd /opt/swarm-dashboard && npm run build

# Restart platform after backend changes
pm2 restart swarm-platform
```

## File Locations

| Component | Path |
|-----------|------|
| Platform API | `/opt/swarm-platform/` |
| HITL Routes | `/opt/swarm-platform/routes/hitl.js` |
| AI Dispatcher | `/opt/swarm-platform/services/ai-dispatcher.js` |
| Clarification Agent | `/opt/swarm-platform/agents/clarification-agent.js` |
| Claude Client | `/opt/swarm-platform/services/claude-client.js` |
| Dashboard | `/opt/swarm-dashboard/` |
| DesignSession Page | `/opt/swarm-dashboard/src/pages/DesignSession.jsx` |
| HITL Hook | `/opt/swarm-dashboard/src/hooks/useHITL.js` |
| Session Notes | `/opt/swarm-specs/session-notes/current.md` |

## Success Criteria

1. ✅ User can create project and see AI clarification questions
2. ⬜ User can chat back and forth until "Generate Spec" becomes available
3. ⬜ Spec card displays in structured, readable format
4. ⬜ User can edit spec content inline
5. ⬜ User can approve or request revision with feedback
6. ⬜ Approved projects transition to building state
7. ⬜ (Future) Building state triggers Agent Execution Engine

## Start Here

1. First, verify the current state by testing the dashboard at https://dashboard.swarmstack.net
2. Create a new project and confirm AI asks clarifying questions
3. Continue the conversation until `ready_for_docs` state is reached
4. Test the `generate-spec` endpoint
5. Build the spec review UI components

Remember to commit progress to git and update session notes!
