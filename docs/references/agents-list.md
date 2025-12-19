# Agents List

Comprehensive inventory of all Swarm agents - specified and built.

**Source:** Notion (migrated 2025-12-11)

---

## Core Agent Types

| Agent | Responsibilities | Status |
|-------|------------------|--------|
| **Design Agent** | Creates tickets, maintains project plan, approves worker proposals, decomposes large work. Uses 3-phase hierarchical generation | BUILT |
| **Worker Agent** | Executes tickets, writes code, proposes new tickets. One per VM. Pull-based architecture | BUILT |
| **Review Agent** | Automated PR review, enforces standards, can approve/reject/escalate | NOT BUILT |
| **Orchestrator** | Assigns tickets, manages VM lifecycle, routes messages, enforces limits | BUILT |

---

## Agent Factory Vision Agents (Future)

| Agent Type | Responsibilities | Phase | Status |
|------------|------------------|-------|--------|
| **Workflow Spec Parser** | Parse natural language or structured workflow specs | Phase 4 | NOT STARTED |
| **Testing Swarm Agents** | Parallel test execution for validating generated agents | Phase 5 | NOT STARTED |
| **Supervisor Agent** | Monitors quality across multiple worker agents | Phase 4+ | NOT STARTED |

---

## Implementation Details

### Design Agent - BUILT
**Location**: /opt/swarm-tickets/design-agent/

| File | Lines | Purpose |
|------|-------|---------|
| design-agent.js | 310 | Master orchestrator |
| phase1-skeleton.js | 225 | Skeleton generator (~2K tokens) |
| phase2-expansion.js | 279 | Chunked expansion per epic |
| phase3-validation.js | 321 | Validation + execution plan |
| **Total** | **1,135** | Complete pipeline |

**Key Capability**: Breaks 40K+ token single-call designs into ~13K across 5-9 calls.

### Worker Agent v2 - BUILT
**Location**: /usr/local/bin/swarm-agent-v2 (6.4KB)

**Features**:
- Pull-based claim (polls API for work)
- Heartbeat loop (30s interval)
- Idle timeout (300s then self-terminate)
- Exponential backoff (5s to 60s max)
- Execute workflow: clone, branch, claude-api, commit, push

### Orchestrator Components - BUILT

**API Server**: /opt/swarm-tickets/api-server.js (11.7KB)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /health | GET | Health check |
| /claim | POST | Agent claims next available ticket |
| /heartbeat | POST | Agent reports progress |
| /complete | POST | Agent submits result |
| /tickets | GET | Dashboard query |
| /stats | GET | Active agent count |

**Ticket Orchestrator**: /usr/local/bin/swarm-orchestrate-tickets (453 lines)
**VM Spawner**: /usr/local/bin/swarm-spawn (4.9KB)

### Review Agent - NOT BUILT (Priority: HIGH)

**Specified Capabilities**:
- Automated PR review against coding standards
- Approve/reject/escalate decisions
- Configurable approval gates
- Rejection feedback with structured format
- File pattern rules

---

## Summary

| Category | Specified | Built | Pending |
|----------|-----------|-------|---------|
| Core Agents | 4 | 3 | 1 (Review Agent) |
| Factory Agents | 3 | 0 | 3 |
| **Total** | **7** | **3** | **4** |
