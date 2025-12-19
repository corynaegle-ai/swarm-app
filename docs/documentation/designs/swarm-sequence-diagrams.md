# Swarm Sequence Diagrams

## Full Pipeline
Interview → Spec → Decompose → Orchestrate → Code → Review → Build → Deploy

## Interview Flow
User ↔ Dashboard ↔ Interview API ↔ Claude
- Create project → Start interview session
- Answer questions → Generate next Q (per section)
- Approve sections → Save spec
- Complete → Lock spec, status='spec'

## Decomposition Flow
Orchestrator loads spec → Spawns Decomposer VM → Generates tickets + DAG → Insert to DB → Terminate VM

## Ticket Execution Flow
1. Query ready_tickets (DAG-aware)
2. Spawn Coder VM (~8ms)
3. Agent polls GET /internal/work
4. Clone repo, checkout branch
5. Implement, POST /checkpoint events
6. Commit, push, POST /internal/complete
7. Ticket → review state

## Sentinel Review Flow
1. Spawn Sentinel, assign review
2. Fetch diff, load shared_context
3. Pass 1: diff only
4. If approved → Create PR, done
5. If changes_requested → Back to coder (attempt 2)
6. If Pass 3 still fails → Escalate, requires_human=true

## Human Escalation Flow
User views escalated queue → Reviews ticket + logs → Resolves (approve/reject) → Ticket unblocked

## Real-Time Dashboard (SSE)
Dashboard connects GET /checkpoints/stream → Agent emits events → UI updates live

## E2E Summary
Interview (gather reqs) → Spec (JSON) → Decompose (tickets+DAG) → Orchestrate (assign agents) → Code (implement) → Review (Sentinel 3-pass) → Build (CI/CD) → Deploy (live URL)
