# Ticketing System Architecture

> Agent-orchestrated ticketing system for the Swarm project - designed for human-agent collaboration at scale

**Status**: ✅ Design Complete, Implementation In Progress  
**Source**: Notion (migrated 2025-12-10)

---

## Executive Summary

This document defines the architecture for a ticketing system purpose-built for AI agent workflows. Unlike traditional project management tools, this system is designed with agents as first-class participants—creating tickets, executing work, and reviewing code—while maintaining human oversight and control.

**Key Design Principles:**
- Tickets are the atomic unit of work: one ticket = one agent = one branch = one PR
- Humans oversee, agents execute
- The system is the single source of truth for project state
- Event sourcing captures complete history—nothing is lost

---

## 1. Ticket Lifecycle & State Machine

### 1.1 Ticket States

| State | Description | Typical Trigger |
|-------|-------------|-----------------|
| Draft | Ticket created but not fully specified | Design Agent |
| Ready | Fully specified, available for assignment, all dependencies met | Design Agent / System |
| Blocked | Cannot proceed—dependencies incomplete (computed automatically) | System |
| On Hold | Human has paused for reasons outside the system | Human only |
| Assigned | Claimed by agent or human, work not yet started | Orchestrator / Human |
| In Progress | Active work happening | Worker Agent / Human |
| In Review | Work complete, awaiting validation (PR is open) | Worker Agent / Human |
| Changes Requested | Reviewer found issues, needs revision | Human / Review Agent |
| Done | Work accepted and merged | System (on PR merge) |
| Cancelled | Ticket abandoned, will not be completed | Human / Design Agent |

### 1.2 State Transition Rules

**Blocked vs On Hold:**
- **Blocked** is system-computed from dependencies. When dependencies complete, ticket auto-transitions to Ready.
- **On Hold** is human-initiated. Requires explicit human action to release.

**On Hold Requirements:**
- Human must provide a reason (free text)
- System sends time-based reminders (configurable, default 7 days)
- Cannot place a ticket On Hold while an agent is actively working

### 1.3 Dependencies

**Model:** Directed Acyclic Graph (DAG)

**Rules:**
- A ticket cannot move to Ready if any dependency is not Done
- Circular dependencies rejected at creation time
- When a ticket moves to Done, system checks all dependent tickets and auto-transitions those now unblocked
- When a ticket is Cancelled, dependent tickets are flagged for human review

---

## 2. Project State & Reporting

### 2.1 Event Sourcing

Every ticket change is an immutable event. Current state is derived; history is preserved forever.

**Event Schema:**
```
ticket_events
├── id (UUID)
├── ticket_id
├── timestamp
├── event_type (created, state_changed, assigned, modified, etc.)
├── actor_id (human_id, agent_id, or system)
├── actor_type (human, design_agent, worker_agent, review_agent, system)
├── previous_value (JSON)
├── new_value (JSON)
├── metadata (JSON)
└── rationale (text, optional)
```

### 2.2 Reporting Layers

| Layer | Purpose |
|-------|---------|
| Ticket Aggregates | Counts by state, epic, assignee; velocity metrics |
| Dependency Health | Critical path, bottleneck detection, orphan detection |
| Decision Log | Who decided what and when; searchable audit trail |
| Narrative Summary | AI-synthesized catch me up summaries |

---

## 3. Agent Types & Relationships

### 3.1 Agent Roles

| Agent Type | Responsibilities |
|------------|------------------|
| Design Agent | Creates tickets, maintains project plan, approves worker proposals, decomposes large work |
| Worker Agent | Executes tickets, writes code, proposes new tickets, one per VM |
| Review Agent | Automated PR review, enforces standards, can approve/reject/escalate |
| Orchestrator | Assigns tickets, manages VM lifecycle, routes messages, enforces limits |

### 3.2 Ticket Ownership

**Rule:** One ticket = one agent = one branch = one PR

No multi-agent collaboration on single tickets. If work needs parallelization, decompose into multiple tickets with dependencies.

### 3.3 Worker Ticket Proposals

Worker agents **cannot** directly create tickets. They can **propose** tickets.

**Flow:**
1. Worker discovers need (I need a password hashing utility)
2. Worker sends proposal to Orchestrator
3. Design Agent (or rules) decides: approve (create ticket) or reject
4. Worker continues working while awaiting decision

---

## 4. GitHub Integration

### 4.1 Branch/PR Model

**One ticket = one branch = one PR**

**Branch naming:** `ticket-{id}-{slugified-title}`

Examples:
- `ticket-47-build-user-authentication`
- `ticket-123-fix-login-redirect-bug`

### 4.2 File Tracking

```
ticket_file_changes
├── ticket_id
├── pr_id
├── file_path
├── change_type (added, modified, deleted, renamed)
├── lines_added
├── lines_removed
└── captured_at
```

### 4.3 Sync Model

**GitHub → Ticket System (Strong):**
- PR opened/updated/merged/closed
- PR comments copied to ticket activity log
- PR review outcomes update ticket state
- Files changed captured on merge

**Ticket System → GitHub (Light):**
- Ticket state changes that affect PR post comment
- Human comments optionally sync to PR

---

## 5. Human Interaction Model

### 5.1 Modification During Work

**Default:** Notify agent, don't force-interrupt.

**Severity classification:**
- **Informational** (typos, clarifications): Agent continues
- **Significant** (acceptance criteria changed): Agent reviews, adapts
- **Critical** (dependencies changed, reassigned): Agent stops

### 5.2 Approval Gates

| Gate Type | Description |
|-----------|-------------|
| No gate | Review Agent auto-approves (low-risk) |
| Review Agent gate | Default for most tickets |
| Human gate | High-risk or policy-required |
| Multi-approval | Critical changes |

---

## 6. Context Window Management

**Problem:** Large project designs risk context overflow.

| Project Size | Single-Call Tokens | Risk |
|--------------|-------------------|------|
| Small (5 tickets) | ~5K | LOW |
| Medium (15 tickets) | ~17K | MEDIUM |
| Large (30+ tickets) | ~40K+ | HIGH |

**Solution: 3-Phase Hierarchical Generation**

1. **Phase 1 - Skeleton** (~2K tokens): Epic IDs, Ticket IDs, dependency graph only
2. **Phase 2 - Expansion** (N calls ~2K each): One epic at a time, add descriptions
3. **Phase 3 - Validation** (~600 tokens): Cycle detection, orphan checks

**Total: 6-8 API calls, ~13K tokens vs 40K+ single-call**

---

## 7. Infrastructure & Scale

### 7.1 Agent-VM Relationship

**One active ticket per VM.**

**VM lifecycle:**
1. Ticket becomes Ready
2. Orchestrator restores VM from snapshot (~8ms)
3. Assigns ticket to VM
4. VM works exclusively on that ticket
5. Work complete → VM returns to pool or destroyed

### 7.2 Deployment Architecture

```
┌─────────────────────────────────────────────┐
│           Stable Infrastructure             │
│  ┌───────────────────────────────────────┐  │
│  │         Ticketing System              │  │
│  │  (API, SQLite, Orchestrator, UI)      │  │
│  └───────────────────────────────────────┘  │
│                     │                       │
│                     ▼                       │
│  ┌───────────────────────────────────────┐  │
│  │         Firecracker Swarm             │  │
│  │  - Ephemeral VMs, stateless           │  │
│  │  - Scales 0 to 1000+                  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## State Transition Diagram

```
               Draft
                 │
                 ▼
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
     Ready ◄────────── Blocked
       │                   ▲
       │ (assign)          │
       ▼                   │
    Assigned ──────────────┘
       │
       │ (start work)
       ▼
  In Progress ◄───────────┐
       │                  │
       │ (PR opened)      │
       ▼                  │
   In Review              │
       │                  │
  ┌────┴────┐             │
  ▼         ▼             │
Done   Changes Req'd ─────┘

  On Hold: Human can place from Ready/Assigned/In Review
  Cancelled: Reachable from any state except Done
```

---

*Document created: December 6, 2024*  
*Migrated to git: December 10, 2024*
