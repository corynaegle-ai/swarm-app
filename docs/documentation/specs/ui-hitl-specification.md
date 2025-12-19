# UI Human-in-the-Loop (HITL) Control Architecture

> **Source:** Migrated from Notion Design Interface Specification + HITL Architecture additions

## Overview

User-facing interface for project submission and AI-assisted documentation workflow with **explicit gating** to prevent autonomous AI actions without user approval.

## Core Principle: State Machine with Hard Gates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SESSION STATE MACHINE                                     │
│                                                                             │
│   ┌─────────┐    ┌───────────┐    ┌────────────┐    ┌──────────┐           │
│   │  INPUT  │───▶│ CLARIFYING │───▶│ DOCUMENTING │───▶│ REVIEWING │          │
│   └─────────┘    └───────────┘    └────────────┘    └──────────┘           │
│        │              │                  │                │                 │
│        ▼              ▼                  ▼                ▼                 │
│   user_action    user_response      ai_generates     user_approves         │
│   required       required           (auto)           required              │
│                                                           │                 │
│                                          ┌────────────────┘                 │
│                                          ▼                                  │
│                                   ┌────────────┐    ┌───────────┐          │
│                                   │ APPROVED   │───▶│ GENERATING │          │
│                                   └────────────┘    └───────────┘          │
│                                        │                  │                 │
│                                        ▼                  ▼                 │
│                                   GATE: explicit      ai_executes          │
│                                   user click          (only now!)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Conversation style | Chat back-and-forth | Natural, iterative refinement |
| Document depth | Spec Cards (MVP) | Fast to generate/review, add full PRD later |
| Edit mode | Markdown | Easier to implement, revisit after testing |
| Approval | Two-step (Approve Spec → Start Build) | Explicit gates prevent runaway automation |
| AI Control | Dispatcher pattern | Single control point for all AI actions |

---

## Gating Strategy

| Gate | State Transition | Requires | UI Element |
|------|------------------|----------|------------|
| Gate 1 | input → clarifying | User submits description | "Start Design" button |
| Gate 2 | clarifying → ready_for_docs | AI ready + user confirms | "Looks Complete" button |
| Gate 3 | ready_for_docs → documenting | User clicks generate | "Generate Spec Card" button |
| Gate 4 | reviewing → approved | User clicks approve | "Approve Spec" button |
| Gate 5 | approved → generating | User clicks build + checkbox | "Start Build" with confirmation |

---

## AI Behavior Types

| Behavior Type | When Allowed | Example |
|---------------|--------------|---------|
| **Reactive** | Always | AI responds to user message |
| **Proactive** | Only in specific states | AI asks clarifying question |
| **Autonomous** | Only after explicit approval | AI generates tickets, starts agents |

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: INPUT                                                             │
│  User submits initial description (natural language or structured form)     │
│  GATE: User must click "Start Design Session"                               │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: CLARIFICATION (AI-Driven Chat)                                    │
│  - AI asks targeted questions (tech stack, integrations, scale, etc.)       │
│  - ~3-5 rounds of dialogue                                                  │
│  - Progress indicator shows completion percentage                           │
│  GATE: User must respond to each question                                   │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: SPEC CARD GENERATION                                              │
│  GATE: User must click "Generate Spec Card" button                          │
│  AI produces: Summary, Components, Entities, Endpoints                      │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: REVIEW & APPROVAL                                                 │
│  User reviews spec card, can edit or request AI revisions                   │
│  GATE: User must click "Approve Spec Card"                                  │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: BUILD CONFIRMATION                                                │
│  Shows: estimated tickets, VMs, cost, duration                              │
│  GATE: User must check confirmation box + click "Start Build"               │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: TICKET GENERATION (Autonomous - approved)                         │
│  Design Agent Pipeline executes (Skeleton → Expansion → Validation)         │
│  AI can now spawn VMs and execute autonomously                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema


```sql
-- Session states with allowed transitions
CREATE TABLE session_states (
  state TEXT PRIMARY KEY,
  allowed_ai_actions JSON,
  required_user_action TEXT,
  next_states JSON
);

-- State definitions
INSERT INTO session_states VALUES
('input', '["wait"]', 'submit_description', '["clarifying"]'),
('clarifying', '["ask_question", "suggest_pattern", "confirm"]', 'respond_or_confirm', '["clarifying", "ready_for_docs"]'),
('ready_for_docs', '["wait"]', 'click_generate', '["documenting"]'),
('documenting', '["generate_spec_card"]', NULL, '["reviewing"]'),
('reviewing', '["revise_on_request"]', 'approve_or_request_revision', '["reviewing", "approved"]'),
('approved', '["wait"]', 'click_generate_tickets', '["generating"]'),
('generating', '["generate_tickets", "spawn_agents"]', NULL, '["complete"]');

-- Design sessions table (extended)
CREATE TABLE design_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  state TEXT DEFAULT 'input',
  initial_description TEXT,
  clarification_context JSON,
  spec_card TEXT,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Conversation history
CREATE TABLE design_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id),
  role TEXT,              -- 'user' or 'assistant'
  content TEXT,
  message_type TEXT,      -- 'question', 'answer', 'suggestion', 'confirmation'
  created_at TEXT DEFAULT (datetime('now'))
);

-- State transition audit log
CREATE TABLE state_transitions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id),
  from_state TEXT,
  to_state TEXT,
  action TEXT,
  user_id TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Approval audit log
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id),
  user_id TEXT,
  spec_card_hash TEXT,
  approved_at TEXT,
  ip_address TEXT
);
```

---

## API Design

### Core Endpoints

```javascript
// Start new design session
POST /api/design-sessions
{ description: string, attachments?: File[] }
→ { session_id, state: "clarifying", next_question }

// Continue clarification dialogue
POST /api/design-sessions/:id/respond
{ response: string }
→ { state, next_question?, messages[], progress_percent }

// Generate spec card (GATED - requires button click)
POST /api/design-sessions/:id/generate-spec
→ { spec_card: string, state: "reviewing" }

// Update spec card
PATCH /api/design-sessions/:id/spec-card
{ content?: string, feedback?: string }
→ { spec_card: string }

// Approve spec (GATED)
POST /api/design-sessions/:id/approve
{ user_confirmed: boolean }
→ { state: "approved", next_action: "start_build" }

// Start build (FINAL GATE)
POST /api/design-sessions/:id/start-build
{ user_confirmed: boolean, confirmation_checkbox: boolean }
→ { project_id, status: "generating", estimated_tickets }
```

### Gate Enforcement Middleware

```javascript
const ALLOWED_ACTIONS = {
  'input':          ['submit_description'],
  'clarifying':     ['respond', 'confirm_ready'],
  'ready_for_docs': ['generate_spec'],
  'documenting':    [],
  'reviewing':      ['edit_spec', 'request_revision', 'approve'],
  'approved':       ['start_build'],
  'generating':     [],
};

function enforceGate(req, res, next) {
  const session = await getSession(req.params.id);
  const action = deriveActionFromEndpoint(req);
  
  if (!ALLOWED_ACTIONS[session.state]?.includes(action)) {
    return res.status(403).json({
      error: 'action_not_allowed',
      current_state: session.state,
      allowed_actions: ALLOWED_ACTIONS[session.state]
    });
  }
  next();
}
```

---

## AI Dispatcher Service

```javascript
class AIDispatcher {
  async dispatch(sessionId, intendedAction, context) {
    const session = await getSession(sessionId);
    
    // Check if AI is allowed to act
    if (!this.isAIAllowed(session.state, intendedAction)) {
      return { blocked: true, waiting_for: this.getWaitingFor(session.state) };
    }
    
    // Check if action requires user approval
    if (this.requiresApproval(intendedAction) && !session.user_approved_action) {
      return { blocked: true, ui_action: 'show_approval_modal' };
    }
    
    return this.execute(session, intendedAction, context);
  }
  
  isAIAllowed(state, action) {
    const AI_ACTIONS = {
      'clarifying':  ['ask_question', 'analyze_response'],
      'documenting': ['generate_spec_card'],
      'reviewing':   ['revise_spec'],
      'generating':  ['create_tickets', 'spawn_agents']
    };
    return AI_ACTIONS[state]?.includes(action) || false;
  }
  
  requiresApproval(action) {
    return {
      'generate_spec_card': 'click_generate_button',
      'create_tickets': 'click_start_build',
      'spawn_agents': 'click_start_build'
    }[action];
  }
}
```

---

## UI Components

### 1. Project Submission (`/create-project`)
- Large text area for description
- File upload (optional)
- "Start Design Session" button

### 2. Clarification Chat (`/design/:id`)
- Chat message list
- User input field
- Progress indicator (0-100%)
- "Generate Spec Card" button (appears when ready)

### 3. Spec Review (`/design/:id/review`)
- Split view: Markdown editor | Preview
- "Request AI Revision" input
- "Approve Spec Card" button

### 4. Build Confirmation Modal
- Estimated tickets count
- Estimated VMs needed
- Estimated cost
- Confirmation checkbox
- "Start Build" button (disabled until checkbox)

### 5. Build Progress (`/project/:id/build`)
- Ticket generation progress
- VM spawn status
- Real-time logs

---

## Spec Card Template

```markdown
# Project: {name}

## Summary
- **What:** One-sentence description
- **Why:** Problem being solved
- **Who:** Primary users/personas
- **Platform:** Web / Mobile / API / CLI

## Constraints
- Tech stack requirements
- Timeline
- Compliance/security

## Core Features
1. **Feature Name** - Description. MVP/Future.

## Key Entities
### Entity Name
- **Purpose:** What this represents
- **Key Fields:** Important attributes
- **Relationships:** Links to other entities

## API Outline
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/x | Description |

## Open Questions
- Items needing human decision
```

---

## Clarification Agent Prompt

See `/opt/swarm-specs/prompts/clarification-agent.md`

## Spec Generation Prompt

See `/opt/swarm-specs/prompts/spec-generation-agent.md`

---

## Implementation Priority

| Phase | Component | Effort | Dependencies |
|-------|-----------|--------|--------------|
| 1 | Database schema + migrations | 2h | None |
| 2 | API endpoints + gate middleware | 4h | Phase 1 |
| 3 | AI Dispatcher service | 3h | Phase 2 |
| 4 | Clarification Agent integration | 4h | Phase 3 |
| 5 | UI: Submission + Chat | 6h | Phase 2 |
| 6 | UI: Review + Approval | 4h | Phase 4 |
| 7 | UI: Build confirmation modal | 2h | Phase 6 |
| 8 | Integration testing | 4h | All |

**Total: ~29 hours**

---

*Created: December 11, 2025*
*Source: Notion Design Interface Specification + HITL Architecture*
