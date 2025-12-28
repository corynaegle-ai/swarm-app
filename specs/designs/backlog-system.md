# Swarm Backlog System Design

**Author:** Marcus "The Architect" Chen (Persona)  
**Date:** 2024-12-23  
**Status:** Design Specification  
**Version:** 1.0

---

## Executive Summary

The Swarm platform currently lacks a staging area for project ideas before they enter the HITL pipeline. Users must commit to the full clarification→approval→build flow immediately upon idea submission. A **Backlog System** provides a lightweight holding area where users can:

1. Capture ideas quickly without commitment
2. Prioritize and organize future work
3. Selectively promote items to full HITL sessions when ready

---

## Architectural Analysis

### Current State

```
┌─────────────────────────────────────────────────────────────┐
│  User submits project idea                                  │
│              │                                              │
│              ▼                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HITL Session Created (state: 'input')              │   │
│  │  → Clarifying Agent engages immediately             │   │
│  │  → User MUST continue or abandon                    │   │
│  └─────────────────────────────────────────────────────┘   │
│              │                                              │
│              ▼                                              │
│  clarifying → reviewing → approved → building → done        │
└─────────────────────────────────────────────────────────────┘
```

### Problem Statement

1. **No lightweight capture** - Every idea becomes a full session with AI engagement
2. **Cognitive overhead** - Users hesitate to submit rough ideas
3. **No prioritization** - No way to organize future work
4. **Wasted resources** - Clarifying Agent runs on ideas that may never build

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BACKLOG LAYER                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  backlog_items (lightweight capture)                  │  │
│  │  - Quick idea capture                                 │  │
│  │  - Prioritization (rank ordering)                     │  │
│  │  - Labels/tags for organization                       │  │
│  │  - Optional: Quick chat with Clarifying Agent         │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ "Promote to Build"               │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  HITL Session (full pipeline)                         │  │
│  │  - Clarifying → Reviewing → Approved → Building       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Decision: Backlog → Chat Session Flow

### Your Question Analyzed

> Should a backlog item be able to go straight to a chat session with a clarifying agent and the user and then go through the normal build process?

### My Assessment: **Yes, with nuance**

This is an excellent idea, but it needs careful implementation. Here's my analysis:

#### Why This Works

1. **Reduces friction** - Users can capture a rough idea, then "hydrate" it later with AI assistance
2. **Preserves context** - The backlog item's description seeds the clarification conversation
3. **Natural workflow** - Mirrors how humans actually work (capture→refine→execute)
4. **Efficient resource use** - Clarifying Agent only runs when user is actively engaged

#### Potential Pitfalls to Avoid

| Pitfall | Mitigation |
|---------|------------|
| Users start chat, abandon mid-conversation | Auto-return to backlog after 30min inactivity |
| Duplicate data between backlog item and session | Backlog item becomes metadata pointer, not duplication |
| Unclear state when "in chat" | Explicit `chatting` state on backlog item |
| Chat history lost if user abandons | Persist chat transcript back to backlog item |

#### Recommended Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  backlog_items  │     │  HITL Session   │     │    Tickets      │
│                 │     │                 │     │                 │
│  state: draft   │────▶│  state: input   │────▶│  state: draft   │
│  state: chatting│◀───▶│  state: clarify │     │  state: ready   │
│  state: ready   │     │  state: review  │     │  ...            │
│                 │     │  state: approved│     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │
        │   User abandons chat   │
        │◀───────────────────────│
        │   (chat saved to item) │
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
    description TEXT,  -- Initial rough idea
    enriched_description TEXT,  -- AI-refined version after chat
    
    -- Organization
    priority INTEGER DEFAULT 0,  -- Higher = more important
    rank INTEGER,  -- For drag-drop ordering within priority tier
    labels JSONB DEFAULT '[]',  -- ["urgent", "frontend", "Q1-2025"]
    
    -- Linkages
    project_id UUID REFERENCES projects(id),  -- Optional: pre-assign to project
    hitl_session_id UUID REFERENCES hitl_sessions(id),  -- When promoted
    
    -- State machine
    state VARCHAR(50) DEFAULT 'draft' CHECK (state IN (
        'draft',      -- Initial capture, not yet refined
        'chatting',   -- User is in active chat with Clarifying Agent
        'refined',    -- Chat completed, ready for promotion
        'promoted',   -- Converted to HITL session
        'archived'    -- Soft delete / completed elsewhere
    )),
    
    -- Chat context (when state = 'chatting' or after)
    chat_transcript JSONB DEFAULT '[]',  -- Array of {role, content, timestamp}
    chat_summary TEXT,  -- AI-generated summary of key decisions
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    promoted_at TIMESTAMP,  -- When converted to HITL session
    
    -- For quick lookups
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED
);

-- Indexes
CREATE INDEX idx_backlog_tenant ON backlog_items(tenant_id);
CREATE INDEX idx_backlog_state ON backlog_items(tenant_id, state);
CREATE INDEX idx_backlog_priority ON backlog_items(tenant_id, priority DESC, rank ASC);
CREATE INDEX idx_backlog_search ON backlog_items USING GIN(search_vector);
CREATE INDEX idx_backlog_labels ON backlog_items USING GIN(labels);
```

### Modified: `hitl_sessions`

Add source tracking:

```sql
ALTER TABLE hitl_sessions ADD COLUMN source_type VARCHAR(50) 
    DEFAULT 'direct' CHECK (source_type IN ('direct', 'backlog', 'api'));
ALTER TABLE hitl_sessions ADD COLUMN backlog_item_id UUID REFERENCES backlog_items(id);
```

---

## API Design

### Backlog Endpoints

```
POST   /api/backlog                    # Create backlog item
GET    /api/backlog                    # List items (filterable)
GET    /api/backlog/:id                # Get single item
PATCH  /api/backlog/:id                # Update item
DELETE /api/backlog/:id                # Archive item

POST   /api/backlog/:id/start-chat     # Begin Clarifying Agent chat
POST   /api/backlog/:id/chat           # Send message in chat
POST   /api/backlog/:id/end-chat       # End chat, save summary
POST   /api/backlog/:id/promote        # Convert to HITL session

POST   /api/backlog/reorder            # Bulk update ranks
POST   /api/backlog/bulk-label         # Add/remove labels from multiple
```

### Example: Create Backlog Item

```http
POST /api/backlog
Content-Type: application/json
Authorization: Bearer <jwt>

{
    "title": "Mobile app for inventory scanning",
    "description": "Warehouse workers need to scan barcodes and update stock levels. Should work offline.",
    "labels": ["mobile", "Q1-2025"],
    "priority": 2
}
```

Response:
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Mobile app for inventory scanning",
    "state": "draft",
    "priority": 2,
    "labels": ["mobile", "Q1-2025"],
    "created_at": "2024-12-23T10:30:00Z"
}
```

### Example: Start Chat

```http
POST /api/backlog/550e8400-e29b-41d4-a716-446655440000/start-chat
Authorization: Bearer <jwt>
```

Response:
```json
{
    "success": true,
    "state": "chatting",
    "initial_message": {
        "role": "assistant",
        "content": "I see you want to build a mobile inventory scanning app. Let me ask a few questions to clarify the requirements:\n\n1. What mobile platforms need support (iOS, Android, both)?\n2. How will offline data sync when connectivity returns?\n3. Are there existing inventory systems to integrate with?"
    }
}
```

### Example: Promote to HITL

```http
POST /api/backlog/550e8400-e29b-41d4-a716-446655440000/promote
Authorization: Bearer <jwt>

{
    "skip_clarification": false  // Set true to skip directly to reviewing
}
```

Response:
```json
{
    "success": true,
    "backlog_state": "promoted",
    "hitl_session": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "state": "input",
        "source_type": "backlog",
        "backlog_item_id": "550e8400-e29b-41d4-a716-446655440000"
    }
}
```

---

## State Machine

### Backlog Item States

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
┌────────┐    ┌──────────┐    ┌─────────┐    ┌─────────┐
│ draft  │───▶│ chatting │───▶│ refined │───▶│promoted │
└────────┘    └──────────┘    └─────────┘    └─────────┘
    │              │               │
    │              │               │
    ▼              ▼               ▼
┌──────────────────────────────────────────┐
│              archived                     │
└──────────────────────────────────────────┘
```

### Valid Transitions

| From | To | Trigger |
|------|-----|---------|
| draft | chatting | User clicks "Refine with AI" |
| draft | promoted | User clicks "Build Now" (skip chat) |
| draft | archived | User deletes item |
| chatting | refined | User ends chat or 30min timeout |
| chatting | draft | User abandons mid-chat |
| refined | promoted | User clicks "Promote to Build" |
| refined | chatting | User wants more refinement |
| refined | archived | User decides not to build |
| promoted | (terminal) | Item is now a HITL session |

---

## WebSocket Events

### New Events for Backlog

```javascript
// Client subscribes to backlog room
ws.send({ action: 'join', room: `backlog:${tenantId}` });

// Server broadcasts
{
    event: 'backlog:created',
    data: { id, title, state, priority }
}

{
    event: 'backlog:updated', 
    data: { id, changes: { state: 'chatting' } }
}

{
    event: 'backlog:chat_message',
    data: { backlogId, message: { role, content, timestamp } }
}

{
    event: 'backlog:promoted',
    data: { backlogId, hitlSessionId }
}
```

---

## UI Components

### Backlog Board View

```
┌─────────────────────────────────────────────────────────────────┐
│  Backlog                                        [+ New Item]    │
├─────────────────────────────────────────────────────────────────┤
│  Filter: [All ▼] [Priority ▼] [Labels ▼]        🔍 Search...   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⭐⭐⭐ HIGH PRIORITY                                      │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ 📝 Mobile inventory scanner          [refined]  │    │   │
│  │  │ 🏷️ mobile, Q1-2025                              │    │   │
│  │  │ [Promote ▶] [Edit] [Chat 💬]                    │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⭐⭐ MEDIUM PRIORITY                                     │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ 📝 Dashboard analytics overhaul       [draft]   │    │   │
│  │  │ 🏷️ frontend, analytics                          │    │   │
│  │  │ [Refine 💬] [Edit] [Build Now ▶]                │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Chat Interface (Inline or Modal)

```
┌─────────────────────────────────────────────────────────────────┐
│  💬 Refining: Mobile inventory scanner                    [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🤖 I see you want to build a mobile inventory scanning app.   │
│     Let me ask a few clarifying questions:                      │
│     1. What platforms? (iOS, Android, both)                     │
│     2. Offline sync strategy?                                   │
│     3. Existing integrations?                                   │
│                                                         10:30am │
│  ─────────────────────────────────────────────────────────────  │
│  👤 Both iOS and Android. When offline, queue scans locally     │
│     and sync when back online. We use SAP for inventory.        │
│                                                         10:32am │
│  ─────────────────────────────────────────────────────────────  │
│  🤖 Got it! Here's what I understand:                           │
│     - Cross-platform mobile app (React Native recommended)      │
│     - Offline-first with local queue + background sync          │
│     - SAP integration via RFC/BAPI or OData                     │
│                                                                 │
│     Should I add barcode scanning hardware requirements?        │
│                                                         10:32am │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Type your message...]                              [Send ▶]   │
│                                                                 │
│  [End Chat & Save Summary]              [Promote to Build ▶▶]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Backlog (Week 1)
- [ ] Database migration for `backlog_items` table
- [ ] CRUD API endpoints
- [ ] Basic UI: list view, create, edit, delete
- [ ] WebSocket events for real-time updates

### Phase 2: Promotion Flow (Week 1-2)
- [ ] `/promote` endpoint creating HITL session
- [ ] Backlog item → HITL session data transfer
- [ ] UI: "Promote" button and confirmation

### Phase 3: Chat Integration (Week 2-3)
- [ ] Chat transcript storage
- [ ] `/start-chat`, `/chat`, `/end-chat` endpoints
- [ ] Clarifying Agent integration (reuse existing)
- [ ] Chat UI component
- [ ] Auto-timeout returning to draft

### Phase 4: Organization Features (Week 3-4)
- [ ] Priority tiers with drag-drop reordering
- [ ] Labels/tags system with filtering
- [ ] Full-text search
- [ ] Bulk operations

---

## Migration Strategy

### Existing Sessions

No migration needed - existing HITL sessions continue to work. New sessions can be created from backlog OR directly (backwards compatible).

### Database Migration

```sql
-- Migration: 2024_12_23_create_backlog_items.sql

BEGIN;

CREATE TABLE backlog_items (
    -- [full schema from above]
);

ALTER TABLE hitl_sessions 
    ADD COLUMN source_type VARCHAR(50) DEFAULT 'direct',
    ADD COLUMN backlog_item_id UUID REFERENCES backlog_items(id);

-- Backfill existing sessions as 'direct' source
UPDATE hitl_sessions SET source_type = 'direct' WHERE source_type IS NULL;

COMMIT;
```

---

## Trade-offs & Considerations

### Why Separate Table (Not Just Session States)

| Option | Pros | Cons |
|--------|------|------|
| **Separate `backlog_items` table** | Clean separation, backlog-specific fields, no pollution of session logic | Two entities to manage, promotion requires data copy |
| **Add states to `hitl_sessions`** | Single entity, simpler queries | Bloated session table, unclear semantics, backlog features don't fit session model |

**Decision:** Separate table. The backlog has different semantics (priority, labels, lightweight chat) that don't belong in the session model.

### Chat Storage: Backlog vs Session

When user chats with Clarifying Agent from backlog, where does transcript live?

**Decision:** Store in `backlog_items.chat_transcript`. When promoted, copy relevant context to session's initial state, but keep original transcript in backlog for audit.

### What Happens to Backlog Item After Promotion?

**Decision:** Item stays in `promoted` state with link to session. This provides:
- Audit trail of where sessions originated
- Ability to see "this idea became that project"
- No orphaned data

---

## Security Considerations

1. **Tenant isolation** - All queries MUST include `tenant_id` filter
2. **Authorization** - Only backlog creator or workspace admins can promote
3. **Chat rate limiting** - Prevent abuse of Clarifying Agent via backlog chat
4. **Input validation** - Title/description length limits, XSS prevention

---

## Conclusion

The Backlog System provides a lightweight staging area that solves the "all-or-nothing" problem in the current HITL flow. The key architectural decision—allowing backlog items to engage in chat sessions with the Clarifying Agent before promotion—creates a natural refinement workflow while preserving resources.

This design:
- ✅ Reduces friction for idea capture
- ✅ Enables prioritization and organization
- ✅ Provides gradual refinement before commitment
- ✅ Maintains clean separation from existing HITL logic
- ✅ Preserves full audit trail

**Recommendation:** Implement in phases, starting with core CRUD, then promotion, then chat integration. This allows value delivery at each phase while building toward the complete vision.

---

*— Marcus Chen, Principal Web Systems Architect*
