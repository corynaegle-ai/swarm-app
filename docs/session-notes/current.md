## Infrastructure & Access
- **Dev Server SSH**: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
- **Postgres Password**: `swarm_dev_2024`

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
