# Implementation Prompt: Swarm Backlog System

## Role

You are a senior full-stack engineer implementing a Backlog System for the Swarm AI agent orchestration platform. You have 30 years of experience in systems architecture, databases, Node.js, React, and PostgreSQL.

---

## Context

Swarm is an AI agent orchestration system that manages HITL (Human-in-the-Loop) sessions for software development. Currently, users must commit to the full clarification→approval→build pipeline immediately. We need a **Backlog System** - a lightweight staging area where users can:

1. Capture ideas quickly without commitment
2. Optionally chat with a Clarifying Agent to refine ideas
3. Promote refined items to full HITL sessions when ready

### Key Principle: ZERO Breaking Changes

The existing HITL workflow (`/api/hitl/*`) must continue working unchanged. The backlog is an **additive layer** that feeds into the existing system.

---

## Design Decisions (Already Made)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | Separate `backlog_items` table | Different semantics from sessions (priority, labels, lightweight) |
| Chat storage | In `backlog_items.chat_transcript` | Original stays for audit; context seeds session on promotion |
| Post-promotion | Item persists in `promoted` state | Audit trail linking backlog → session |
| Abandonment | Auto-return to `draft` with chat saved | No lost work |
| Skip option | Direct promote without chat | Power users with well-defined ideas |

### State Machine

```
draft ──────────────────────────────────▶ promoted (direct build)
  │                                           ▲
  ▼                                           │
chatting ◀──────────▶ refined ────────────────┘
  │         (iterate)     │
  │                       │
  ▼                       ▼
draft              archived
(abandon)          (not building)
```

---

## Database Schema

### New Table: `backlog_items`

```sql
CREATE TABLE backlog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Core content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    enriched_description TEXT,  -- AI-refined after chat
    
    -- Organization
    priority INTEGER DEFAULT 0,  -- 0=low, 1=medium, 2=high
    rank INTEGER,  -- Drag-drop ordering within priority tier
    labels JSONB DEFAULT '[]',
    
    -- Linkages
    project_id UUID REFERENCES projects(id),
    hitl_session_id UUID REFERENCES hitl_sessions(id),
    
    -- State machine
    state VARCHAR(50) DEFAULT 'draft' CHECK (state IN (
        'draft', 'chatting', 'refined', 'promoted', 'archived'
    )),
    
    -- Chat context
    chat_transcript JSONB DEFAULT '[]',
    chat_summary TEXT,
    chat_started_at TIMESTAMP,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    promoted_at TIMESTAMP,
    
    -- Search
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED
);

CREATE INDEX idx_backlog_tenant ON backlog_items(tenant_id);
CREATE INDEX idx_backlog_state ON backlog_items(tenant_id, state);
CREATE INDEX idx_backlog_priority ON backlog_items(tenant_id, priority DESC, rank ASC);
CREATE INDEX idx_backlog_search ON backlog_items USING GIN(search_vector);
CREATE INDEX idx_backlog_labels ON backlog_items USING GIN(labels);
```

### Modify: `hitl_sessions`

```sql
ALTER TABLE hitl_sessions ADD COLUMN source_type VARCHAR(50) 
    DEFAULT 'direct' CHECK (source_type IN ('direct', 'backlog', 'api'));
ALTER TABLE hitl_sessions ADD COLUMN backlog_item_id UUID REFERENCES backlog_items(id);
```

---

## API Endpoints

### CRUD Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/backlog` | List backlog items (with filters) |
| `POST` | `/api/backlog` | Create new backlog item |
| `GET` | `/api/backlog/:id` | Get single item |
| `PATCH` | `/api/backlog/:id` | Update item (title, description, priority, labels) |
| `DELETE` | `/api/backlog/:id` | Archive item (soft delete) |

### Chat Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/backlog/:id/start-chat` | Begin clarifying conversation |
| `POST` | `/api/backlog/:id/chat` | Send message in active chat |
| `POST` | `/api/backlog/:id/end-chat` | End chat, generate summary |
| `POST` | `/api/backlog/:id/abandon-chat` | Return to draft, save transcript |

### Promotion

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/backlog/:id/promote` | Convert to HITL session |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Database | PostgreSQL 16 |
| Backend | Node.js 22, Express.js |
| Auth | JWT middleware (`requireAuth`) |
| AI | Anthropic Claude API via `claude-client.js` |
| Real-time | WebSocket broadcast |
| Frontend | React 18, Tailwind CSS, shadcn/ui |

### Key File Locations (Dev Droplet)

```
/opt/swarm-dashboard/
├── server/
│   ├── routes/
│   │   ├── hitl.js          # Existing HITL routes (DO NOT MODIFY)
│   │   └── backlog.js       # NEW: Backlog routes
│   ├── services/
│   │   └── claude-client.js # AI chat utility
│   ├── db/
│   │   └── index.js         # queryAll, queryOne, execute
│   └── middleware/
│       └── auth.js          # requireAuth
├── src/
│   ├── pages/
│   │   └── Backlog.jsx      # NEW: Backlog list view
│   └── components/
│       ├── backlog/
│       │   ├── BacklogCard.jsx
│       │   ├── BacklogChat.jsx
│       │   └── PromoteModal.jsx
```

---

## Implementation Tasks

### Phase 1: Database & CRUD (Priority: HIGH)

1. **Create migration file**: `migrations/YYYYMMDD_create_backlog_items.sql`
2. **Run migration** on dev droplet
3. **Create `/server/routes/backlog.js`** with CRUD endpoints
4. **Register routes** in `server/index.js`
5. **Test with curl**: Create, list, update, archive

### Phase 2: Chat Integration (Priority: HIGH)

1. **Implement `/start-chat`**: Generate initial AI message, set state to `chatting`
2. **Implement `/chat`**: Append user message, get AI response, update transcript
3. **Implement `/end-chat`**: Generate summary, set state to `refined`
4. **Implement `/abandon-chat`**: Save transcript, return to `draft`
5. **WebSocket broadcasts**: Real-time chat updates to UI

### Phase 3: Promotion (Priority: HIGH)

1. **Implement `/promote`**:
   - Validate state is `draft` or `refined`
   - Create HITL session with `source_type: 'backlog'`
   - Set `backlog_item_id` on session
   - Update backlog item to `promoted` state
   - Return session ID
2. **Test integration**: Promoted items should appear in existing HITL UI

### Phase 4: Frontend (Priority: MEDIUM)

1. **Backlog list page**: `/backlog` route showing all items
2. **BacklogCard component**: Compact card with title, state, priority
3. **BacklogChat component**: Chat interface for clarifying conversation
4. **PromoteModal**: Confirmation with "Skip Clarification" option
5. **Navigation**: Add "Backlog" to sidebar

### Phase 5: Polish (Priority: LOW)

1. **Search**: Full-text search using `search_vector`
2. **Drag-drop reorder**: Update `rank` field
3. **Label management**: Create/assign labels
4. **Bulk operations**: Archive multiple, bulk promote

---

## Acceptance Criteria

### CRUD
- [ ] Create backlog item with title, description, priority, labels
- [ ] List items filtered by state, priority, labels
- [ ] Update item fields (not state directly)
- [ ] Archive item (state → `archived`)
- [ ] Tenant isolation enforced on all queries

### Chat
- [ ] Start chat generates AI greeting based on item content
- [ ] Send message returns AI response within 10s
- [ ] Chat transcript persists in `chat_transcript` JSONB
- [ ] End chat generates summary in `chat_summary`
- [ ] Abandon chat saves transcript, returns to `draft`
- [ ] WebSocket broadcasts update connected clients

### Promotion
- [ ] Promote creates HITL session with `source_type: 'backlog'`
- [ ] Session links back via `backlog_item_id`
- [ ] Backlog item state → `promoted`
- [ ] `skip_clarification: true` sets session state to `reviewing`
- [ ] Promoted session appears in existing HITL dashboard

### Non-Functional
- [ ] Zero changes to existing HITL routes
- [ ] All endpoints require authentication
- [ ] All queries include `tenant_id` filter
- [ ] Input validation on title length (max 255)
- [ ] Error responses include helpful messages

---

## Reference Files

Before implementing, read these files via RAG or directly:

1. **Design spec**: `/opt/swarm-specs/designs/backlog-system.md`
2. **Route template**: `/opt/swarm-specs/implementations/backlog-routes.js`
3. **Existing HITL routes**: `/opt/swarm-dashboard/server/routes/hitl.js`
4. **Claude client**: `/opt/swarm-dashboard/server/services/claude-client.js`
5. **Auth middleware**: `/opt/swarm-dashboard/server/middleware/auth.js`

---

## RAG Query Before Starting

```bash
curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "hitl_sessions table create session state machine tenant_id", "limit": 8}'
```

This will surface existing patterns for session creation that you should follow.

---

## Anti-Patterns to Avoid

| Anti-Pattern | Correct Approach |
|--------------|------------------|
| Modifying `hitl.js` routes | Create new `backlog.js` file |
| Storing chat in sessions table | Store in `backlog_items.chat_transcript` |
| Deleting backlog items | Archive (soft delete) only |
| Hard-coding tenant IDs | Always use `req.user.tenant_id` |
| Blocking on AI calls | Use async/await with timeout |

---

## Success Metrics

After implementation:

1. User can create backlog item in < 2 seconds
2. Chat response latency < 10 seconds
3. Promote to session in < 1 second
4. Zero regressions in existing HITL tests
5. All new endpoints pass auth middleware

---

## Activation

Begin implementation by:

1. SSH to dev droplet: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
2. Query RAG for existing patterns
3. Create migration file
4. Implement Phase 1 (CRUD)
5. Test with curl
6. Proceed to Phase 2-5

Report progress after each phase.
