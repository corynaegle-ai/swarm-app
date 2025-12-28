# UI HITL Implementation Prompts

> **Location:** `/opt/swarm-specs/prompts/ui-hitl-implementation.md`
> **Reference:** To use in a new context window, say:
> "Read `/opt/swarm-specs/prompts/ui-hitl-implementation.md` and execute Phase X"

## Overview

This document contains implementation prompts for the Swarm UI Human-in-the-Loop (HITL) control system. Each phase is self-contained with enough context to complete independently.

**Full Specification:** `/opt/swarm-specs/design-docs/ui-hitl/specification.md`

---

## Prompt Phase 1: Database Schema & Migrations

### Goal
Create database tables for session state machine, message history, and audit logging.

### Context
- Database: SQLite at `/opt/swarm-api/swarm-api.db`
- Existing tables: `projects`, `design_sessions` (may need extension)
- Pattern: Use migrations in `/opt/swarm-api/migrations/`

### Tasks
1. Create migration file `XXX_hitl_state_machine.sql`
2. Add `session_states` table with allowed transitions
3. Extend `design_sessions` with: `state`, `clarification_context`, `spec_card`, `approved_at`, `approved_by`
4. Create `design_messages` table for conversation history
5. Create `state_transitions` table for audit logging
6. Create `approvals` table for approval audit trail
7. Run migration and verify schema

### Schema Reference
```sql
CREATE TABLE session_states (
  state TEXT PRIMARY KEY,
  allowed_ai_actions JSON,
  required_user_action TEXT,
  next_states JSON
);

CREATE TABLE design_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id),
  role TEXT,
  content TEXT,
  message_type TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE state_transitions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  from_state TEXT,
  to_state TEXT,
  action TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Success Criteria
- [ ] Migration runs without errors
- [ ] All tables created with correct schema
- [ ] Foreign keys properly defined
- [ ] Can insert/query test data

---

## Prompt Phase 2: API Gate Middleware

### Goal
Implement middleware that enforces state transitions and blocks invalid actions.

### Context
- API server: `/opt/swarm-api/server.js`
- Pattern: Express middleware
- Must reject actions not allowed in current state

### Tasks
1. Create `/opt/swarm-api/middleware/session-gate.js`
2. Define `ALLOWED_ACTIONS` map (state → permitted actions)
3. Implement `enforceGate()` middleware function
4. Add `logStateTransition()` for audit trail
5. Return helpful error messages with allowed actions
6. Wire middleware into design session routes

### Code Structure
```javascript
// middleware/session-gate.js
const ALLOWED_ACTIONS = {
  'input': ['submit_description'],
  'clarifying': ['respond', 'confirm_ready'],
  'ready_for_docs': ['generate_spec'],
  'reviewing': ['edit_spec', 'request_revision', 'approve'],
  'approved': ['start_build'],
};

async function enforceGate(req, res, next) {
  // Get session, derive action, check permission, log transition
}

module.exports = { enforceGate, ALLOWED_ACTIONS };
```

### Success Criteria
- [ ] Middleware blocks invalid state transitions
- [ ] Returns 403 with helpful error message
- [ ] Logs all transitions to `state_transitions` table
- [ ] Passes valid requests through

---

## Prompt Phase 3: AI Dispatcher Service

### Goal
Create single control point for all AI actions with approval checks.

### Context
- Service layer: `/opt/swarm-api/services/`
- Must check state permissions AND approval requirements
- Integrates with Claude API for AI responses

### Tasks
1. Create `/opt/swarm-api/services/ai-dispatcher.js`
2. Implement `AIDispatcher` class with:
   - `dispatch(sessionId, action, context)` - main entry point
   - `isAIAllowed(state, action)` - check state permissions
   - `requiresApproval(action)` - check if user approval needed
   - `execute(session, action, context)` - run the AI action
3. Define AI action permissions per state
4. Define which actions require explicit user approval
5. Return blocking status with UI hints when gated

### Code Structure
```javascript
class AIDispatcher {
  constructor(claudeClient) { this.claude = claudeClient; }
  
  async dispatch(sessionId, intendedAction, context) {
    // 1. Get session state
    // 2. Check AI allowed
    // 3. Check approval required
    // 4. Execute or return blocked status
  }
}
```

### Success Criteria
- [ ] All AI actions route through dispatcher
- [ ] Blocked actions return clear status
- [ ] Approval requirements enforced
- [ ] Integrates with existing Claude API setup

---

## Prompt Phase 4: Clarification Agent Integration

### Goal
Implement conversational Q&A flow that gathers project requirements.

### Context
- Uses AI Dispatcher from Phase 3
- Stores messages in `design_messages` table
- Updates `clarification_context` JSON as info gathered

### Tasks
1. Create `/opt/swarm-api/agents/clarification-agent.js`
2. Implement clarification prompt (see spec)
3. Handle user responses and extract structured data
4. Track completion percentage
5. Detect when ready for spec generation
6. Create `/api/design-sessions/:id/respond` endpoint

### Agent Behavior
```
User submits response
  → Agent analyzes response
  → Updates clarification_context
  → Calculates completeness %
  → Either: asks next question OR declares ready_for_spec
  → Returns { message, gathered, ready_for_spec, progress }
```

### Success Criteria
- [ ] Agent asks relevant follow-up questions
- [ ] Progress percentage increases as info gathered
- [ ] Correctly detects when ready for spec
- [ ] Conversation history persisted

---

## Prompt Phase 5: UI - Submission & Chat Pages

### Goal
Build React components for project input and clarification chat.

### Context
- Frontend: `/opt/swarm-web/src/`
- Routing: React Router
- Styling: Tailwind CSS
- State: React hooks (or Zustand if preferred)

### Tasks
1. Create `/src/pages/CreateProject.jsx`
   - Text area for description
   - File upload (optional)
   - "Start Design Session" button
2. Create `/src/pages/DesignSession.jsx`
   - Message list component
   - User input with send button
   - Progress bar (0-100%)
   - "Generate Spec Card" button (conditionally shown)
3. Create `/src/components/ChatMessage.jsx`
4. Create `/src/hooks/useDesignSession.js`
5. Wire up API calls to backend

### UI States
- `input`: Show submit form
- `clarifying`: Show chat + progress + input
- `ready_for_docs`: Show chat + "Generate" button enabled

### Success Criteria
- [ ] Can create new design session
- [ ] Chat displays AI questions and user responses
- [ ] Progress bar reflects completion
- [ ] Generate button appears when ready

---

## Prompt Phase 6: UI - Review & Approval Pages

### Goal
Build spec card review interface with editing and approval flow.

### Context
- Uses Markdown editor (react-markdown + textarea)
- Split view: edit | preview
- Must enforce approval gate

### Tasks
1. Create `/src/pages/SpecReview.jsx`
   - Split pane: Markdown editor | Preview
   - "Request AI Revision" input
   - "Approve Spec Card" button
2. Create `/src/components/MarkdownEditor.jsx`
3. Create `/src/components/MarkdownPreview.jsx`
4. Handle revision requests via AI Dispatcher
5. Implement approval flow with confirmation

### UI Flow
```
User reviews spec card
  → Can edit markdown directly
  → Can request AI revision (natural language)
  → Must click "Approve" to proceed
  → Approval logged to audit trail
```

### Success Criteria
- [ ] Spec card displays and is editable
- [ ] Preview updates live
- [ ] AI revision requests work
- [ ] Approval transitions state to "approved"

---

## Prompt Phase 7: Build Confirmation Modal

### Goal
Final gate before autonomous execution with explicit confirmation.

### Context
- Modal component triggered from approved state
- Must show estimates and require checkbox
- This is THE critical gate - build cannot start without it

### Tasks
1. Create `/src/components/BuildConfirmationModal.jsx`
2. Display:
   - Estimated ticket count
   - Estimated VMs needed
   - Estimated cost (if calculable)
   - Estimated duration
3. Add confirmation checkbox (required)
4. "Start Build" button disabled until checkbox checked
5. Call `/api/design-sessions/:id/start-build` on confirm
6. Handle loading/error states

### Modal Content
```
⚠️ Ready to Build?

You're about to start autonomous agent execution:
• 15 tickets will be generated
• Up to 10 VMs will be spawned
• Estimated time: 45 minutes

☐ I have reviewed the spec and approve starting autonomous build

[Cancel]  [Start Build] (disabled until checked)
```

### Success Criteria
- [ ] Modal shows accurate estimates
- [ ] Checkbox required to enable button
- [ ] Build only starts after explicit confirmation
- [ ] Audit log captures approval

---

## Prompt Phase 8: Integration Testing

### Goal
End-to-end testing of complete HITL flow.

### Context
- Test entire flow from input to build start
- Verify all gates enforce correctly
- Test error cases and edge cases

### Tasks
1. Create test script or use existing test framework
2. Test happy path: input → clarify → generate → review → approve → build
3. Test gate enforcement:
   - Try to generate spec before ready
   - Try to start build without approval
   - Try to skip clarification
4. Test error handling:
   - Invalid state transitions
   - Missing required fields
   - API failures
5. Test audit logging:
   - All transitions logged
   - Approvals captured

### Test Cases
```
✅ Happy path complete flow
✅ Cannot generate spec from 'input' state
✅ Cannot start build from 'reviewing' state
✅ Cannot approve without spec card
✅ Build requires checkbox confirmation
✅ All state transitions logged
✅ Approvals have full audit trail
```

### Success Criteria
- [ ] All happy path tests pass
- [ ] All gate enforcement tests pass
- [ ] Audit trail complete and accurate
- [ ] Error messages helpful and clear

---

## Quick Reference

| Phase | Focus | Key Files |
|-------|-------|-----------|
| 1 | Database | `/opt/swarm-api/migrations/` |
| 2 | Gate Middleware | `/opt/swarm-api/middleware/session-gate.js` |
| 3 | AI Dispatcher | `/opt/swarm-api/services/ai-dispatcher.js` |
| 4 | Clarification Agent | `/opt/swarm-api/agents/clarification-agent.js` |
| 5 | UI: Submit + Chat | `/opt/swarm-web/src/pages/` |
| 6 | UI: Review + Approve | `/opt/swarm-web/src/pages/SpecReview.jsx` |
| 7 | Build Modal | `/opt/swarm-web/src/components/BuildConfirmationModal.jsx` |
| 8 | Testing | End-to-end validation |

---

*Created: December 11, 2025*
