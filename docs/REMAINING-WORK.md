# Swarm Platform - Remaining Work Tracker

**Last Updated**: 2025-12-14  
**Maintainer**: Neural / Cory Naegle  
**Repository**: https://github.com/corynaegle-ai/swarm-specs

---

## Executive Summary

Swarm is a distributed AI agent coordination system using Firecracker microVMs to run Claude-powered coding agents in parallel. The foundational infrastructure is operational (sub-10ms VM boot, 100+ VM orchestration). This document tracks all remaining work to reach production readiness.

**Recent Milestone (2025-12-12)**: Backend consolidation complete. All API services (`swarm-api`, `swarm-tickets` server) merged into unified `swarm-platform` running on port 8080. Single codebase, single PM2 process, simplified operations.

---

## Backend Architecture

**Current State (as of 2025-12-12):**

```
┌─────────────────────────────────────────────────────────────┐
│                     Caddy (HTTPS)                           │
│  swarmstack.net | api.swarmstack.net | dashboard.swarmstack │
└─────────────────────────────┬───────────────────────────────┘
                              │ All API traffic
                              ▼
                    ┌─────────────────────┐
                    │   swarm-platform    │
                    │   (PM2 on :8080)    │
                    │                     │
                    │ Routes:             │
                    │ • /health           │
                    │ • /api/auth/*       │
                    │ • /api/tickets/*    │
                    │ • /api/vms/*        │
                    │ • /api/projects/*   │
                    │ • /api/secrets/*    │
                    │ • /api/hitl/*       │
                    │ • /claim, /complete │
                    └─────────┬───────────┘
                              │
                              ▼
                    /opt/swarm-tickets/data/swarm.db
```

**PM2 Management:**
```bash
pm2 list                    # Show status
pm2 logs swarm-platform     # View logs
pm2 restart swarm-platform  # Restart server
```

---

## Work Tracks Overview

| Track | Priority | Status | Est. Effort |
|-------|----------|--------|-------------|
| 1. HITL Backend | P0 | In Progress | 2-3 days |
| 2. HITL Frontend | P0 | Not Started | 2-3 days |
| 3. Auth Completion | P1 | 90% Done | 0.5 days |
| 4. Agent Execution Engine | P0 | 60% Done | 3-4 days |
| 5. Design Agent Pipeline | P1 | 70% Done | 2 days |
| 6. Security Hardening | P1 | 70% Done | 2-3 days |
| 7. Observability | P2 | 10% Done | 2-3 days |
| 8. Dashboard UI | P1 | 40% Done | 3-4 days |
| 9. E2E Integration Testing | P0 | 20% Done | 2-3 days |
| 10. Documentation | P2 | 50% Done | 2 days |

---

## Track 1: HITL Backend (Human-in-the-Loop)

**Goal**: Enable human review/approval gates before agents execute critical actions.

| Phase | Task | Prompt File | Status |
|-------|------|-------------|--------|
| 1 | Database Schema | `prompts/ui-hitl-implementation.md#phase-1` | ✅ Done |
| 2 | Gate Middleware | `prompts/ui-hitl-implementation.md#phase-2` | ✅ Done |
| 3 | AI Dispatcher Service | `prompts/ui-hitl-implementation.md#phase-3` | ✅ Done |
| 4 | Clarification Agent | `prompts/ui-hitl-implementation.md#phase-4` | ✅ Done |
| 5 | WebSocket Server | N/A | ✅ Done |
| 6 | WebSocket Broadcasts | N/A | ✅ Done |

### Remaining Tasks

- [x] ~~Implement dispatcher service for routing decisions~~ ✅ Complete
- [x] ~~Build WebSocket server for real-time notifications~~ ✅ Complete
- [x] ~~Create clarification agent~~ ✅ Complete
- [x] ~~Wire up broadcast calls in backend~~ ✅ Complete
- [ ] Integrate WebSocket hooks in DesignSession.jsx (see `prompts/websocket-integration-prompt.md`)
- [ ] Add timeout handling for pending approvals

### WebSocket Implementation (2025-12-14)

**Backend:** `/opt/swarm-platform/websocket.js` - JWT auth, room subscriptions, heartbeat
**Broadcasts:** sessionUpdate, sessionMessage, approvalRequested, approvalResolved, specGenerated, ticketsGenerated
**React Hooks:** `/opt/swarm-dashboard/src/hooks/useWebSocket.js`, `useSessionWebSocket.js`

---

## Track 2: HITL Frontend

**Goal**: React UI for human reviewers to approve/reject/clarify agent actions.

| Phase | Task | Prompt File | Status |
|-------|------|-------------|--------|
| 5 | Submit + Chat Pages | `prompts/ui-hitl-implementation.md#phase-5` | ✅ Done |
| 6 | Review + Approval Pages | `prompts/ui-hitl-implementation.md#phase-6` | 🔲 TODO |
| 7 | Confirmation Modal | `prompts/ui-hitl-implementation.md#phase-7` | 🔲 TODO |
| 8 | WebSocket Integration | `prompts/websocket-integration-prompt.md` | 🔄 In Progress |
| 9 | E2E Testing | `prompts/ui-hitl-implementation.md#phase-8` | 🔲 TODO |

### Remaining Tasks
- [ ] Build approval queue dashboard
- [ ] Create diff viewer for code changes
- [ ] Integrate useSessionWebSocket hook in DesignSession.jsx (hooks ready)
- [ ] Add connection status indicator
- [ ] Add notification system for pending approvals

---

## Track 3: Auth System Completion

**Goal**: Production-ready authentication with SSO and session management.

| Task | Description | Status |
|------|-------------|--------|
| Core Auth | JWT tokens, login/logout, registration | ✅ Done |
| Role-based Access | Admin/User roles with permissions | ✅ Done |
| Backend Consolidation | Unified into swarm-platform | ✅ Done |
| Frontend Integration | Connect React dashboard to auth endpoints | ✅ Done |
| GitHub OAuth | SSO via GitHub for developers | 🔲 TODO |
| Password Reset | Forgot password email flow | 🔲 TODO |
| Session Management | View/revoke active sessions | 🔲 TODO |
| API Key Management | Generate/revoke API keys for programmatic access | 🔲 TODO |

---

## Track 4: Agent Execution Engine

**Goal**: Complete the ticket → agent → VM → code → PR pipeline.

| Component | Description | Status |
|-----------|-------------|--------|
| Ticket Store | SQLite with DAG dependencies, event sourcing | ✅ Done |
| VM Orchestration | Firecracker spawn/restore with networking | ✅ Done |
| Agent Templates | Basic, Claude API, HTTP operation templates | ✅ Done |
| Git Integration | Clone, branch, commit, push from VMs | ✅ Done |
| Execution Loop | Coordinator polling for ready tickets | 🟡 Partial |
| Error Recovery | Retry logic, VM failure handling | 🔲 TODO |
| Resource Limits | CPU/memory quotas per agent | 🔲 TODO |
| Parallel Execution | Multi-VM concurrent ticket processing | 🔲 TODO |

### Critical Remaining Tasks
- [ ] Implement coordinator service that polls ticket queue
- [ ] Add VM health checks and automatic restart
- [ ] Build retry logic with exponential backoff
- [ ] Implement resource cleanup for orphaned VMs
- [ ] Add circuit breaker for Claude API failures
- [ ] Create agent output validation layer


---

## Track 5: Design Agent Pipeline

**Goal**: Break project specs into tickets using hierarchical chunked generation.

| Component | Description | Status |
|-----------|-------------|--------|
| Spec Parser | Parse project specifications | ✅ Done |
| Skeleton Generation | High-level ticket structure | ✅ Done |
| Ticket Expansion | Detail each ticket with subtasks | ✅ Done |
| Dependency Graph | DAG creation with proper ordering | ✅ Done |
| Token Budget | Chunked generation to stay under limits | ✅ Done |
| Validation Pass | Verify ticket completeness | 🔲 TODO |
| Estimation | Story points / time estimates | 🔲 TODO |

### Remaining Tasks
- [ ] Add validation pass to check ticket completeness
- [ ] Implement circular dependency detection
- [ ] Build ticket estimation using historical data
- [ ] Add spec versioning for change tracking

---

## Track 6: Security Hardening

**Goal**: Production-ready security posture.

| Area | Task | Status |
|------|------|--------|
| Secrets | Replace hardcoded API keys with vault/env injection | 🔲 TODO |
| VM Isolation | Validate network namespace isolation | 🟡 Partial |
| API Security | Rate limiting, input validation | 🔲 TODO |
| Code Scanning | Scan agent-generated code before commit | 🔲 TODO |
| Audit Logging | Track all agent actions for compliance | 🔲 TODO |
| TLS | HTTPS for all external endpoints | ✅ Done |

### Critical Security Tasks
- [ ] Implement secrets injection via environment variables
- [ ] Add rate limiting to API endpoints (100 req/min default)
- [ ] Create code scanning integration (basic regex + semgrep)
- [ ] Build audit log with immutable event store
- [ ] Validate VM network isolation prevents cross-talk
- [ ] Implement API key rotation mechanism

---

## Track 7: Observability

**Goal**: Understand system behavior and debug issues quickly.

| Component | Description | Status |
|-----------|-------------|--------|
| Structured Logging | JSON logs with correlation IDs | 🟡 Partial |
| Metrics | VM count, ticket throughput, latency | 🔲 TODO |
| Tracing | Distributed traces across agent calls | 🔲 TODO |
| Dashboards | Grafana dashboards for ops | 🔲 TODO |
| Alerting | PagerDuty/Slack alerts for failures | 🔲 TODO |

### Implementation Plan
- [ ] Add correlation IDs to all log entries
- [ ] Implement Prometheus metrics endpoint
- [ ] Deploy Grafana with pre-built dashboards
- [ ] Create alert rules for: VM failures, API errors, queue depth
- [ ] Add OpenTelemetry tracing spans

---

## Track 8: Dashboard UI (swarm-ui)

**Goal**: React dashboard for project management and monitoring.

| Page | Description | Status |
|------|-------------|--------|
| Login/Register | Auth flow with session persistence | ✅ Done |
| Project List | View all projects | ✅ Done |
| Ticket Board | Kanban view of tickets | 🟡 Partial |
| Agent Monitor | Real-time agent status | 🔲 TODO |
| VM Dashboard | VM health and resource usage | 🔲 TODO |
| Settings | User preferences, API keys | 🔲 TODO |
| Admin Panel | User management, system config | 🔲 TODO |

### Remaining UI Tasks
- [ ] Complete ticket board with drag-drop
- [ ] Build agent monitor with WebSocket updates
- [ ] Create VM dashboard with resource graphs
- [ ] Add dark mode support
- [ ] Implement keyboard shortcuts
- [ ] Add export functionality (CSV, JSON)

---

## Track 9: End-to-End Integration Testing

**Goal**: Validate complete workflow from spec → PR.

| Test Scenario | Description | Status |
|---------------|-------------|--------|
| Single Agent | One ticket → one VM → one commit | 🟡 Manual tested |
| Multi-Agent | 10 tickets in parallel | 🔲 TODO |
| Scale Test | 100 VMs concurrent | ✅ Done (806ms) |
| Failure Recovery | Kill VM mid-execution | 🔲 TODO |
| Full Pipeline | Spec → Design Agent → Execution → PR | 🔲 TODO |

### Test Automation Tasks
- [ ] Create automated test harness
- [ ] Build test fixtures (sample specs, expected outputs)
- [ ] Implement CI/CD pipeline for automated testing
- [ ] Add load testing with k6 or similar
- [ ] Create chaos testing for failure scenarios

---

## Track 10: Documentation

**Goal**: Comprehensive docs for users, developers, and operators.

| Document | Audience | Status |
|----------|----------|--------|
| Quick Start Guide | New Users | 🔲 TODO |
| API Reference | Developers | 🟡 Partial |
| Architecture Overview | Engineers | ✅ Done |
| Operator Runbook | DevOps | 🔲 TODO |
| Agent Development Guide | Agent Authors | 🔲 TODO |
| Troubleshooting Guide | Support | 🔲 TODO |


---

## Future Roadmap (Post-MVP)

These items are planned but not blocking initial release:

| Feature | Description | Priority |
|---------|-------------|----------|
| Agent Marketplace | Share/sell custom agents | P3 |
| Multi-Cloud | AWS/GCP deployment options | P3 |
| Policy Engine | Cedar-like permission rules | P2 |
| Code Quality Metrics | Automated quality scoring | P2 |
| Team Collaboration | Multi-user project access | P2 |
| Webhooks | Event notifications to external systems | P2 |
| GraphQL API | Alternative to REST | P3 |
| Mobile App | iOS/Android monitoring | P3 |

---

## Quick Reference

### SSH to Droplet
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

### Key Locations
| What | Where |
|------|-------|
| Swarm Core | `/opt/swarm` |
| **Unified Platform** | `/opt/swarm-platform` ← **All APIs** |
| Database | `/opt/swarm-tickets/data/swarm.db` |
| Specs & Docs | `/opt/swarm-specs` |
| Dashboard Build | `/opt/swarm-dashboard/dist` |
| UI Source | `~/Projects/swarm-ui` (local Mac) |
| Archive (deprecated) | `/opt/archive/` |

### API Endpoints
| Endpoint | Purpose |
|----------|---------|
| `localhost:8080` | **Unified swarm-platform** (all APIs) |
| `api.swarmstack.net` | Public API (proxied to 8080) |
| `dashboard.swarmstack.net` | Dashboard + API (proxied to 8080) |
| `swarmstack.net` | Landing page (static files) |

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🟡 | In Progress / Partial |
| 🔲 | Not Started |

---

## Development Workflow

### Git-Native File Sync Pattern

**Always use this pattern for file changes to droplet:**

```bash
# 1. Write files locally (Mac)
cd ~/repos/swarm-specs  # or swarm-platform
# create/edit files
git add . && git commit -m "description" && git push origin main

# 2. Pull on droplet (SSH)
ssh root@146.190.35.235 "cd /opt/swarm-specs && git pull"

# 3. If code needs restart
ssh root@146.190.35.235 "cd /opt/swarm-platform && git pull && npm install && pm2 restart swarm-platform"
```

**Why this matters:**
- Single source of truth (GitHub)
- No encoding hacks (base64, heredocs)
- Atomic updates
- Works for executable code (just add install/restart)
- Audit trail via git history

**Anti-patterns to avoid:**
- ❌ scp directly to droplet (key issues in containers)
- ❌ SSH heredocs for large files (quoting nightmares)
- ❌ base64 encoding/decoding (fragile)
- ❌ Writing to droplet then committing from there

**Repository mapping:**
| Local Clone | Droplet Path | Status |
|-------------|--------------|--------|
| `~/repos/swarm-platform` | `/opt/swarm-platform` | ✅ Active |
| `~/repos/swarm-specs` | `/opt/swarm-specs` | ✅ Active |
| `~/repos/swarm-tickets` | `/opt/swarm-tickets` | ⚠️ DB only |
| `~/repos/swarm-api` | `/opt/archive/swarm-api-deprecated` | 🗄️ Archived |

---

*Last updated: 2025-12-12 by Claude*  
*Backend consolidation complete - swarm-platform is now the single API server*
