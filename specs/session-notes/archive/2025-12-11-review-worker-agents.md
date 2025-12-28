# Swarm Session Continuation Prompt

**Date**: December 11, 2025
**Last Session**: Review Agent + Worker Agent Implementation

---

## Copy/Paste This to Start New Session:

```
Continue Swarm development. Last session completed:

## Completed Work

1. **Review Agent Implementation** - `/opt/swarm-tickets/review-agent/review-agent.js` (580 lines)
   - SENTINEL persona loaded from `/opt/swarm-tickets/personas/sentinel.md`
   - Model: Opus 4.5 default (configurable per-project)
   - Acceptance criteria verification with VERIFIED/PARTIALLY_MET/NOT_MET
   - Enforces: cannot APPROVE if ANY criterion NOT_MET
   - Human escalation after 3 failed reviews or critical security issues
   - Creates revision tickets for failed reviews
   - Saves reviews to SQLite database
   - CLI: `swarm-review <ticket_id> <diff_file>`

2. **Worker Agent Implementation** - `/opt/swarm-tickets/worker-agent/worker-agent.js` (559 lines)
   - FORGE persona loaded from `/opt/swarm-tickets/personas/forge.md`
   - Model: Sonnet 4 default (configurable per-project)
   - Builds prompt with acceptance criteria
   - Reports criteria_status: SATISFIED/PARTIALLY_SATISFIED/BLOCKED
   - Self-verification before commit
   - Git operations: clone, branch, commit, push
   - Daemon mode: polls API for work
   - Single ticket mode: execute specific ticket
   - CLI: `swarm-worker --daemon` or `swarm-worker --ticket <id>`

3. **Symlinks Created**
   - `/usr/local/bin/swarm-review` → review-agent.js
   - `/usr/local/bin/swarm-worker` → worker-agent.js

4. **Both syntax-verified** with `node --check`

## Implementation Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Worker Agent   │────►│     GitHub      │────►│  Review Agent   │
│    (FORGE)      │     │       PR        │     │   (SENTINEL)    │
│  Sonnet 4       │     │                 │     │   Opus 4.5      │
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                               │
         │ criteria_status[]                             │ criteria_verification[]
         │ SATISFIED/PARTIAL/BLOCKED                     │ VERIFIED/PARTIAL/NOT_MET
         │                                               │
         ▼                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Ticket Store (SQLite)                       │
│  tickets.acceptance_criteria → criteria_status → review_status   │
└─────────────────────────────────────────────────────────────────┘
```

## What's Next?
Options:
1. **Integration testing** - Wire up the complete flow
2. **API endpoints** - Add /review endpoint to trigger reviews
3. **Design Agent spec** - Phase 1-3 ticket generation
4. **Dashboard integration** - Human review queue UI
5. **End-to-end test** - Create ticket → worker → review → approve/revise

What would you like to tackle?
```

---

## Key Files Reference

| File | Location | Lines |
|------|----------|-------|
| Review Agent | `/opt/swarm-tickets/review-agent/review-agent.js` | 580 |
| Worker Agent | `/opt/swarm-tickets/worker-agent/worker-agent.js` | 559 |
| FORGE Persona | `/opt/swarm-tickets/personas/forge.md` | 190 |
| SENTINEL Persona | `/opt/swarm-tickets/personas/sentinel.md` | 154 |
| Review Spec | `specs/review-agent-spec.md` | 1100+ |
| Worker Spec | `specs/worker-agent-spec.md` | 509 |

---

## Database Tables Added

```sql
-- reviews table for tracking all code reviews
CREATE TABLE reviews (
  id, ticket_id, pr_number, decision, score, summary,
  issues_json, criteria_verification, criteria_met, criteria_total, criteria_failed,
  reviewer_type, reviewer_id, created_at
);

-- project_settings for per-project model overrides
CREATE TABLE project_settings (
  project_id, review_model, worker_model, max_review_attempts, auto_merge_on_approve
);
```
