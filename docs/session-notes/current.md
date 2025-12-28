## Infrastructure & Access
- **Dev Server SSH**: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
- **Postgres Password**: `swarm_dev_2024`

---

## Session: December 26, 2024 - Orchestrator Ticket Assignment Debugging

### Status: ✅ COMPLETED

---

## Fix Summary

### 1. Orchestrator Ticket Assignment Stuck
**Problem**: Ticket `TKT-E2E-IMPL-001` was stuck in `ready` state despite being assigned to `forge-agent-001`.
**Root Cause**:
1.  **Process Missing**: `forge-agent-001` process was not running on the Dev Server.
2.  **API Error**: Agent failed with `400 Bad Request` on `/claim` because it sent parameters in query string instead of body.
**Solution**:
- Patched `apps/agents/coder/index.js` to send `agent_id` in request body.
- Deployed fix to Dev Server.
- Manually verified agent claimed the ticket.

### 2. Fix Ticket Requeue Button
**Problem**: Frontend "Requeue" button clicked but did nothing.
**Root Cause**: Missing API hooks in `useTickets.js` (`requeueTicket`, `patchTicket`, `getTicketWithDetails`).
**Solution**: Implemented missing functions in `apps/dashboard/src/hooks/useTickets.js` to wire up UI to Backend.

### 3. Cleanup `swarm-platform` References
**Problem**: Legacy references to deprecated `swarm-platform` repository existed in the codebase.
**Solution**:
- Updated `apps/agents/coder/index.js` to use monorepo path (`/opt/swarm-app/...`).
- Updated `apps/agents/deploy/manifests/swarm-platform.yaml` to point to `corynaegle-ai/swarm-app`.
- Deleted obsolete `apps/platform/scripts/backup.sh`.

### 4. Engine Components Verification
**Verification**: Confirmed `packages/engine/lib/executor.js` and `packages/engine/lib/dispatcher.js` are active dependencies of `packages/engine/lib/engine.js`. `apps/platform/services/ai-dispatcher.js` is a separate active service.

---

## Session: December 26, 2024 - Ticket History Logging & RAG Workflow

### Status: ✅ COMPLETED

---

## Fix Summary

### 1. Ticket History Logging
**Problem**: Agents were not logging their activities (file changes, git operations, etc.) to the ticket history.
**Root Cause**: `forge-agent-v4.js` was missing calls to `activity-logger` for non-AI events.
**Solution**:
- Added calls to `activity.logTicketClaimed`, `activity.logGitOperation`, `activity.logFileCreated/Modified`, and `activity.logPrCreated` in `forge-agent-v4.js`.
- Verified changes with syntax check and code review.

### 2. RAG Workflow
**Problem**: Need a standardized way to query RAG for code snippets.
**Solution**:
- Created `scripts/rag-search.sh` to tunnel queries via SSH to the dev server.
- Documented workflow in `.agent/workflows/rag-query.md`.

---

## Commands Reference

```bash
# Query RAG
./scripts/rag-search.sh "query string"
```

---

## Session: December 26, 2024 - Forge-Sentinel Feedback Loop Fix

### Status: ✅ COMPLETED

---

## Fix Summary

### 1. Forge Agent Feedback Loop fix
**Problem**: Sentinel Feedback was ignored because Forge Agent created a new `forge/...` branch for every run, ignoring `branch_name` from previous attempts.
**Root Cause**: `forge-agent-v4.js` always generated a timestamped branch name and didn't check `ticket.branch_name`.
**Solution**:
- Modified `forge-agent-v4.js` to reuse `ticket.branch_name` if present.
- Updated `createBranch` logic to attempt `git fetch` and `git checkout` of existing branch first.
- Ensured `branch_name` is persisted to `tickets` table after run.
**Verification**:
- Mocked test `verify-mocks.js` confirmed branch reuse logic works as expected.

### 2. Sentinel Agent Prompt Refinement
**Problem**: Agent instructions were generic and didn't adapt to specific failure reasons (syntax vs logic vs timeout).
**Solution**:
- Enhanced `forge-agent-v4.js` to inject dynamic instructions based on `errorClassification` from Sentinel.
- Enforced a "Thinking Step" (`root_cause_analysis`) in the agent's JSON response to force reasoning.

---

## Commands Reference

```bash
# Verify Log Output
# (Mocked Logic)
node apps/platform/tests/verify-mocks.js (deleted after verification)
```

## Session: December 25, 2024 - Sentinel Integration & Backlog Fix
...

---

## Session: December 27, 2024 - Generate Spec Button Fix

### Status: ✅ COMPLETED

---

## Fix Summary

### 1. "Generate Spec" Button Non-Functional
**Problem**: The "Generate Spec" button on the DEV dashboard was not working (UI would reset instantly).
**Root Cause**:
- Frontend (`DesignSession.jsx`) allowed clicking "Generate Spec" in `clarifying` state.
- Backend (`ai-dispatcher.js`) **blocked** the `generate_spec` action in `clarifying` state, returning a `blocked` status.
- Frontend treated the `blocked` response as a generic failure and reset the UI.
**Solution**:
- Updated `apps/platform/services/ai-dispatcher.js` to explicitly allow `generate_spec` in `clarifying` state.
- Verified fix by manually triggering the API on DEV.

### 2. Missing Agent Activity Logs
**Problem**: Activity logs for Verifier/Sentinel agent were missing from Dashboard (e.g., for `TKT-814ACEDC`).
**Root Cause**:
- `swarm-verifier` (Sentinel) service logged events only to a local SQLite database (`verification_attempts`) and did NOT call the Platform API (`/api/tickets/:id/activity`).
- Dashboard relies on `ticket_events` table in Platform DB, which was empty for verifier actions.
**Solution**:
- Patched `/opt/swarm-verifier/server.js` on DEV.
- Added `logActivity` helper function using Platform API.
- Injected `logActivity` calls at start, phase completion/failure, and final verification key points.
- Restarted `swarm-verifier` service.

### 3. Rate Limit Removal
**Problem**: User encountered "Too many requests" on Tickets/Kanban pages.
**Root Cause**: Global `apiLimiter` (100 req/15min) was applied to `/api/tickets` and `/api/backlog`, which load heavy data for dashboards.
**Solution**:
- Updated `apps/platform/server.js` on DEV.
- Removed `apiLimiter` middleware from `/api/tickets` and `/api/backlog` routes.
- Restarted platform service.

---

## Session: December 27, 2024 - Display RAG Info on Dashboard

### Status: ✅ COMPLETED

---

## Fix Summary

### 1. Dashboard RAG Context
**Problem**: Users could not see what RAG context (files, snippets) was being used by the Forge Agent, making it hard to verify if the agent had the right information.
**Root Cause**: `rag_context` data existed in the database but was not exposed in the Dashboard UI.
**Solution**:
- Updated `apps/dashboard/src/pages/Tickets.jsx` to render a new "🤖 RAG Context" section in the ticket detail modal.
- Added display for:
  - Files to Modify/Create
  - Reference Code Snippets (collapsible)
  - Implementation Notes
- Updated `apps/dashboard/src/pages/Tickets.css` with dark-mode compatible styles for the new section.

## Session: December 27, 2024 - Forge-Sentinel Data Flow Fix
Status: ✅ COMPLETED

Fixed 2 critical bugs:
1. Engine now writes sentinel_feedback on verification failure (was writing to verification_evidence)
2. Forge agent now handles multiple feedback data formats (feedback_for_agent, issues, feedback string, message)

Files: engine.js, forge-agent-v4.js
Services restarted: swarm-platform-dev, swarm-engine
