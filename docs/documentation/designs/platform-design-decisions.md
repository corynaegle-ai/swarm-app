# Swarm Platform — Design Decisions Document

**Version**: 1.0  
**Date**: 2025-01-15  
**Status**: Locked for V1

---

## 1. Overview

Swarm is a multi-agent platform that autonomously builds software from customer specifications. The pipeline flows:

Interview → Spec → Decomposition → Orchestration → Coding → Review → Build → Deploy

---

## 2. Phase 1-2: Interview & Spec Generation

| Decision | Detail |
|----------|--------|
| State persistence | Interview state saved for session resume |
| Spec format | JSON, organized by sections/phases |
| Approval model | Partial approval by section/phase |

---

## 3. Phase 3: Decomposition

| Decision | Detail |
|----------|--------|
| Ticket granularity | One public interface per ticket |
| Token guardrail | 12K tokens max per ticket |
| Acceptance criteria | Required on every ticket |
| Cross-cutting concerns | Foundation tickets + shared_context.json |
| Dependency format | DAG with explicit edges |
| Schema coordination | Schema-first phase before code tickets |

### Ticket Hierarchy Example
```
[T001] Create database        → blocks all table tickets
  ├── [T002] Users table      → can run parallel
  ├── [T003] Orders table     → can run parallel
  └── [T004] Products table   → can run parallel
```

---

## 4. Phase 4: Orchestration

| Decision | Detail |
|----------|--------|
| Agent pool | Spawn-on-demand (sub-second boot) |
| Failure handling | 3 attempts → human escalation |
| Crash recovery | Structured checkpoint events |

### Checkpoint Event Format
```json
{
  "event": "code_block",
  "ticket_id": "T-00123",
  "file": "auth.ts",
  "lines": "1-45",
  "content": "...",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

Benefits:
- Crash recovery via event replay
- Real-time dashboard streaming
- Progress percentage tracking

---

## 5. Phase 5: Code Review (Sentinel)

| Decision | Detail |
|----------|--------|
| Scope | Tiered: diff → related files → shared context |
| Iteration cap | 3 passes before human escalation |
| Validation | Checks acceptance criteria satisfaction |

### Tiered Review Process
1. First pass: Diff + immediate file context
2. If cross-file patterns detected: fetch related files
3. Always inject shared_context.json for conventions

---

## 6. Phase 6: Build & Deploy

| Decision | Detail |
|----------|--------|
| Deploy target | VMs (Swarm platform) |
| Test strategy | AC-driven stubs → worker implements → build validates |
| Rollback | Ticket-level with DAG cascade |

### Schema Deprecation (Expand-Contract)
```
Phase 1: ADD new_field (old_field remains)
Phase 2: Deploy code using new_field
Phase 3: Validate all systems
Phase 4: DROP old_field (requires human approval)
```

Destructive schema changes auto-flagged:
```json
{ "requires_human_approval": true, "reason": "destructive_schema_change" }
```

---

## 7. Git Strategy

| Decision | Detail |
|----------|--------|
| Repository model | One repo per project |
| Branching | Branch-per-ticket: `ticket/<ticket-id>` |
| Merge target | PRs merge to `main` after Sentinel approval |

Aligns with: **1 ticket = 1 agent = 1 branch = 1 PR**

### Multi-Project Structure
```
Customer (tenant)
├── Project A → repo-a.git
├── Project B → repo-b.git
└── Project C → repo-c.git
```

Ticket payload determines repo:
```json
{
  "ticket_id": "T-00123",
  "tenant_id": "acme-corp",
  "project_id": "proj-xyz",
  "repo_url": "git@github.com:acme-corp/proj-xyz.git",
  "branch": "ticket/T-00123"
}
```


---

## 8. Multi-Tenancy

| Layer | Isolation Mechanism |
|-------|---------------------|
| Network | Per-tenant bridge network (br-tenant-<id>) |
| Namespace | Linux namespaces per tenant |
| Storage | Tenant-scoped: /workspace/<tenant-id>/<project-id>/ |

### Additional Isolation
- Agent-to-API auth: Tenant-scoped tokens
- Git credentials: Per-tenant deploy keys
- Secrets: Namespaced as tenant/<id>/secret/<name>
- Resource quotas: VM cap per tenant

### Architecture
```
┌─────────────────────────────────────────────┐
│            Orchestrator (global)            │
├─────────────────────────────────────────────┤
│  Tenant A Namespace    │  Tenant B Namespace │
│  ┌─────────────────┐   │  ┌─────────────────┐│
│  │ br-tenant-a     │   │  │ br-tenant-b     ││
│  │ 10.1.0.0/24     │   │  │ 10.2.0.0/24     ││
│  │ ┌────┐ ┌────┐   │   │  │ ┌────┐ ┌────┐   ││
│  │ │VM1 │ │VM2 │   │   │  │ │VM1 │ │VM2 │   ││
│  │ └────┘ └────┘   │   │  │ └────┘ └────┘   ││
│  └─────────────────┘   │  └─────────────────┘│
└─────────────────────────────────────────────┘
```

---

## 9. Human Interface

| Decision | Detail |
|----------|--------|
| Interface | Web IDE |
| Escalation flow | Ticket routes to human queue |
| Human actions | Edit ticket, complete manually, or requeue |

---

## 10. Dashboard & Visibility

Real-time dashboard displays:
- Ticket state progression
- Agent state (idle, working, error)
- Current ticket assignment per agent
- Iteration count per ticket
- Code review comments
- Live code streaming via checkpoint events

---

## 11. Supporting Systems

| System | Decision |
|--------|----------|
| Secrets | Existing injection system |
| Acceptance criteria | Validated by worker + Sentinel |

---

## Appendix: Decision Register

| # | Component | Decision |
|---|-----------|----------|
| 1 | State persistence | Interview state saved |
| 2 | Spec format | JSON with sections/phases |
| 3 | Approval model | Partial by section |
| 4 | Ticket granularity | One interface, 12K token cap |
| 5 | Cross-cutting | Foundation tickets + shared context |
| 6 | Dependencies | DAG explicit edges |
| 7 | Agent pool | Spawn-on-demand |
| 8 | Crash recovery | Structured checkpoints |
| 9 | Sentinel scope | Tiered review |
| 10 | Review iterations | 3 → human |
| 11 | Schema coordination | Schema-first phase |
| 12 | Testing | AC-driven + per-ticket |
| 13 | Deploy target | VMs |
| 14 | Rollback | Ticket-level + cascade |
| 15 | Schema deprecation | Expand-contract, human approval for drops |
| 16 | Git | Repo-per-project, branch-per-ticket |
| 17 | Multi-tenancy | Network + namespace + storage |
| 18 | Human interface | Web IDE |
| 19 | Dashboard | Real-time streaming |

---

*Document generated from design session.*
