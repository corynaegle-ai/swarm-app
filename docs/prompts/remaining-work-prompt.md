# Swarm Platform - Remaining Work Implementation Prompts

> **Location:** `/opt/swarm-specs/prompts/remaining-work-prompt.md`  
> **Last Updated:** 2025-12-13  
> **Usage:** Say "Read `/opt/swarm-specs/prompts/remaining-work-prompt.md` and execute Track X"

---

## Platform Overview

Swarm is a distributed AI agent coordination system using Firecracker microVMs to run Claude-powered coding agents in parallel. The platform follows "1 Ticket = 1 Agent = 1 VM = 1 PR" model.

### Current State (2025-12-13)
- ✅ Backend consolidated into `swarm-platform` (PM2 on port 8080)
- ✅ HITL Phases 1-5 complete (DB, middleware, dispatcher, clarification agent, UI)
- ✅ VM orchestration working (sub-10ms boot via snapshot restore)
- ✅ Auth system functional (JWT, roles, cookies)
- ✅ Dashboard UI foundation (login, projects, tickets, VMs pages)

### Key Locations
| Resource | Path |
|----------|------|
| Platform API | `/opt/swarm-platform` |
| Database | `/opt/swarm-tickets/data/swarm.db` |
| Dashboard Source | `~/swarm-dashboard/src` (local Mac) |
| Dashboard Build | `/opt/swarm-dashboard/dist` (droplet) |
| Specs/Docs | `/opt/swarm-specs` |
| SSH | `ssh -i ~/.ssh/swarm_key root@146.190.35.235` |

### Git-Native Workflow
```bash
# Local: Edit files, commit, push
cd ~/swarm-dashboard && git add -A && git commit -m "msg" && git push

# Droplet: Pull and restart if needed
ssh root@146.190.35.235 "cd /opt/swarm-dashboard && git pull && npm run build"
```

---

## Track 1: HITL Phase 6 - Review & Approval UI

### Goal
Build spec card review interface with Markdown editor and approval workflow.

### Context
- Spec cards stored in `hitl_sessions.spec_card` as JSON
- State transitions: `reviewing` → `approved` (on approve) or back to `clarifying` (on revision)
- Must support inline editing and AI-assisted revisions

### Tasks
1. Create `/src/pages/SpecReview.jsx`
   - Split pane layout: Markdown editor (left) | Live preview (right)
   - Load spec from session's `spec_card` field
   - "Request AI Revision" button with feedback input
   - "Approve Specification" button (transitions to approved state)
   - "Back to Chat" button (returns to clarification)

2. Create `/src/components/MarkdownEditor.jsx`
   - Textarea with syntax highlighting (optional: CodeMirror)
   - Line numbers
   - Auto-save draft to localStorage
   - Character/word count

3. Create `/src/components/MarkdownPreview.jsx`
   - Use `react-markdown` with `remark-gfm`
   - Support tables, code blocks, task lists
   - Styled to match dashboard theme

4. Update routing in `App.jsx`
   - Add route: `/review/:sessionId` → SpecReview

5. Add revision endpoint integration
   - `POST /api/hitl/:id/revise` with feedback body
   - Handle loading states and error display

### API Endpoints
```
GET  /api/hitl/:id           → Get session with spec_card
POST /api/hitl/:id/revise    → Request AI revision (needs implementation)
POST /api/hitl/:id/approve   → Approve spec (exists)
```

### Success Criteria
- [ ] Spec card renders as Markdown preview
- [ ] Editor allows inline changes
- [ ] AI revision requests update spec
- [ ] Approval transitions state correctly
- [ ] Draft auto-saves prevent data loss

---

## Track 2: HITL Phase 7 - Build Confirmation Modal

### Goal
Final gate before autonomous ticket execution with explicit user confirmation.

### Context
- Triggered from `approved` state before `building`
- Must show estimates, resource usage, and require explicit consent
- This is THE critical safety gate

### Tasks
1. Create `/src/components/BuildConfirmationModal.jsx`
   - Modal overlay with backdrop blur
   - Display: project name, ticket count, estimated time, VM resources
   - Checkbox: "I understand this will create X tickets and use Y VM hours"
   - "Start Build" button (disabled until checkbox checked)
   - "Cancel" button

2. Create `/src/hooks/useBuildEstimate.js`
   - Fetch ticket count from spec
   - Calculate estimated VM hours
   - Return loading/error states

3. Update DesignSession.jsx
   - Add "Start Build" button in `approved` state
   - Show modal on click
   - On confirm: call `/api/hitl/:id/start-build`

4. Implement backend endpoint
   - `POST /api/hitl/:id/start-build`
   - Validates state is `approved`
   - Transitions to `building`
   - Triggers ticket generation from spec

### Success Criteria
- [ ] Modal displays accurate estimates
- [ ] Checkbox required before proceeding
- [ ] Cancel returns to approved state
- [ ] Confirm initiates build process
- [ ] Audit log records user consent

---

## Track 3: Agent Execution Engine

### Goal
Complete the ticket → agent → VM → code → PR pipeline.

### Context
- Tickets stored in SQLite with DAG dependencies
- VMs spawn via `swarm-spawn-ns` with snapshot restore
- Agents pull work via HTTP (pull-based architecture)

### Tasks

#### Phase 1: Coordinator Service
1. Create `/opt/swarm-platform/services/coordinator.js`
   - Poll `tickets` table for `state = 'ready'` every 5 seconds
   - Check dependency completion before assignment
   - Assign tickets to available VMs
   - Update ticket state: `ready` → `assigned` → `in_progress`

2. Add coordinator routes
   ```
   GET  /api/coordinator/status    → Running/stopped, queue depth
   POST /api/coordinator/start     → Start polling
   POST /api/coordinator/stop      → Stop polling
   ```

3. Integrate with PM2
   - Add to swarm-platform startup
   - Graceful shutdown on SIGTERM

#### Phase 2: VM Health Monitoring
1. Create `/opt/swarm-platform/services/vm-health.js`
   - Ping VMs every 30 seconds via SSH
   - Track last_seen, health_status
   - Mark unhealthy after 3 missed pings

2. Add health check routes
   ```
   GET /api/vms/:id/health    → Current health status
   GET /api/vms/unhealthy     → List unhealthy VMs
   ```

3. Auto-recovery
   - Restart unhealthy VMs
   - Reassign in-progress tickets from dead VMs

#### Phase 3: Retry & Circuit Breaker
1. Add retry logic to agent execution
   - Max 3 retries with exponential backoff (1s, 5s, 30s)
   - Different retry strategies per error type
   - Log all retry attempts

2. Implement circuit breaker for Claude API
   - Track failure rate over 1-minute window
   - Open circuit at 50% failure rate
   - Half-open after 30 seconds
   - Close on 3 consecutive successes

3. Add failure metrics
   ```
   GET /api/metrics/failures    → Failure counts by type
   GET /api/metrics/circuit     → Circuit breaker states
   ```

#### Phase 4: Resource Cleanup
1. Create cleanup service
   - Run every 5 minutes
   - Kill VMs idle > 10 minutes
   - Remove orphaned network namespaces
   - Clean up stale ticket assignments

2. Add cleanup routes
   ```
   POST /api/cleanup/run        → Trigger manual cleanup
   GET  /api/cleanup/status     → Last run, items cleaned
   ```

### Success Criteria
- [ ] Coordinator automatically assigns ready tickets
- [ ] Unhealthy VMs detected and recovered
- [ ] Failed tasks retry with backoff
- [ ] Circuit breaker protects Claude API
- [ ] No orphaned resources after 24h operation

---

## Track 4: Auth System Completion

### Goal
Production-ready authentication with SSO and session management.

### Tasks

#### GitHub OAuth
1. Register OAuth app at github.com/settings/developers
2. Add routes in `/opt/swarm-platform/routes/auth.js`:
   ```
   GET  /api/auth/github          → Redirect to GitHub
   GET  /api/auth/github/callback → Handle OAuth callback
   ```
3. Create/link user on successful auth
4. Add "Sign in with GitHub" button to login page

#### Password Reset
1. Add database columns:
   ```sql
   ALTER TABLE users ADD reset_token TEXT;
   ALTER TABLE users ADD reset_expires TEXT;
   ```
2. Add routes:
   ```
   POST /api/auth/forgot-password  → Generate token, send email
   POST /api/auth/reset-password   → Validate token, update password
   ```
3. Create email service (SendGrid or similar)
4. Add UI pages: ForgotPassword.jsx, ResetPassword.jsx

#### Session Management
1. Add sessions table:
   ```sql
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT,
     device TEXT,
     ip TEXT,
     created_at TEXT,
     last_active TEXT
   );
   ```
2. Add routes:
   ```
   GET    /api/auth/sessions     → List active sessions
   DELETE /api/auth/sessions/:id → Revoke session
   ```
3. Add sessions page to dashboard settings

#### API Key Management
1. Add api_keys table:
   ```sql
   CREATE TABLE api_keys (
     id TEXT PRIMARY KEY,
     user_id TEXT,
     name TEXT,
     key_hash TEXT,
     last_used TEXT,
     created_at TEXT
   );
   ```
2. Add routes:
   ```
   GET    /api/keys        → List user's API keys
   POST   /api/keys        → Generate new key (show once)
   DELETE /api/keys/:id    → Revoke key
   ```
3. Add API key auth middleware
4. Add API keys section to settings page

### Success Criteria
- [ ] GitHub OAuth creates/links accounts
- [ ] Password reset emails delivered
- [ ] Users can view/revoke sessions
- [ ] API keys work for programmatic access

---

## Track 5: Security Hardening

### Goal
Production-ready security posture for enterprise deployment.

### Tasks

#### Secrets Management
1. Remove all hardcoded secrets from codebase
2. Create `/opt/swarm-platform/services/secrets.js`
   - Load from environment variables
   - Support .env file for development
   - Validate required secrets on startup
3. Update VM agent to receive secrets via orchestrator
4. Add secrets rotation support

#### Rate Limiting
1. Install `express-rate-limit`
2. Configure limits:
   ```javascript
   // Global: 100 req/min
   // Auth endpoints: 5 req/min
   // AI endpoints: 20 req/min
   ```
3. Add rate limit headers to responses
4. Store rate limit state in memory (upgrade to Redis for multi-node)

#### Input Validation
1. Install `express-validator` or `zod`
2. Add validation middleware to all routes
3. Sanitize all user inputs
4. Validate file uploads (size, type, content)

#### Code Scanning
1. Create `/opt/swarm-platform/services/code-scanner.js`
2. Basic regex patterns for:
   - Hardcoded secrets
   - SQL injection patterns
   - Command injection patterns
3. Optional: Integrate semgrep for deeper analysis
4. Block commits with critical findings

#### Audit Logging
1. Create audit_logs table:
   ```sql
   CREATE TABLE audit_logs (
     id TEXT PRIMARY KEY,
     timestamp TEXT,
     user_id TEXT,
     action TEXT,
     resource_type TEXT,
     resource_id TEXT,
     details JSON,
     ip TEXT
   );
   ```
2. Add audit middleware
3. Log: auth events, ticket changes, VM operations, approvals
4. Add audit log viewer for admins

### Success Criteria
- [ ] No secrets in codebase (verified by scan)
- [ ] Rate limits enforced on all endpoints
- [ ] All inputs validated and sanitized
- [ ] Code scanning blocks dangerous patterns
- [ ] Complete audit trail for compliance

---

## Track 6: Observability

### Goal
Understand system behavior and debug issues quickly.

### Tasks

#### Structured Logging
1. Install `pino` or `winston`
2. Configure JSON log format with fields:
   - timestamp, level, message
   - correlation_id, request_id
   - user_id, tenant_id
3. Add correlation ID middleware
4. Update all console.log to use logger

#### Prometheus Metrics
1. Install `prom-client`
2. Expose `/metrics` endpoint
3. Track metrics:
   - `swarm_tickets_total` (by state)
   - `swarm_vms_active`
   - `swarm_api_requests_total` (by endpoint, status)
   - `swarm_api_latency_seconds` (histogram)
   - `swarm_claude_calls_total`
   - `swarm_claude_latency_seconds`

#### Grafana Dashboards
1. Deploy Grafana (Docker or managed)
2. Create dashboards:
   - System Overview: VM count, ticket throughput, API latency
   - Agent Performance: success rate, execution time
   - Error Analysis: failures by type, retry rates

#### Alerting
1. Configure alert rules:
   - VM failures > 5/hour
   - API error rate > 5%
   - Queue depth > 100 tickets
   - Circuit breaker open
2. Integrate with Slack/PagerDuty

### Success Criteria
- [ ] All logs have correlation IDs
- [ ] Prometheus metrics exposed
- [ ] Grafana dashboards deployed
- [ ] Alerts firing for critical conditions

---

## Track 7: Dashboard UI Completion

### Goal
Complete React dashboard for full platform management.

### Tasks

#### Ticket Board Enhancement
1. Add drag-drop with `@dnd-kit/core`
2. Implement column filters (assignee, priority, tags)
3. Add bulk actions (assign, change state, delete)
4. Add ticket detail modal with full info
5. Implement real-time updates via WebSocket

#### Agent Monitor
1. Create `/src/pages/AgentMonitor.jsx`
2. Display running agents with:
   - Current ticket
   - VM assignment
   - Execution progress
   - Log tail (last 20 lines)
3. Add WebSocket for real-time updates
4. Actions: pause, resume, terminate

#### VM Dashboard Enhancement
1. Add resource graphs (CPU, memory over time)
2. Add VM console (SSH terminal in browser)
3. Add batch operations (boot N, cleanup by age)
4. Add cost estimation display

#### Settings Page
1. Create `/src/pages/Settings.jsx`
2. Sections:
   - Profile (name, email, avatar)
   - Security (password, 2FA, sessions)
   - API Keys
   - Notifications preferences
   - Theme (dark/light toggle)

#### Admin Panel Enhancement
1. Add system config page
2. Add tenant management
3. Add usage analytics
4. Add system health overview

### Success Criteria
- [ ] Ticket board supports drag-drop
- [ ] Agent monitor shows real-time status
- [ ] VM dashboard has resource graphs
- [ ] Settings page fully functional
- [ ] Admin panel has all management features

---

## Track 8: E2E Integration Testing

### Goal
Validate complete workflow from spec to PR.

### Tasks

#### Test Harness
1. Create `/opt/swarm-platform/tests/e2e/` directory
2. Install Jest or Vitest
3. Create test utilities:
   - API client helpers
   - Database seeding
   - VM mock/real toggle
   - Assertion helpers

#### Test Scenarios
1. **Single Agent Flow**
   - Create project → clarify → approve → execute → verify PR
2. **Multi-Agent Parallel**
   - 10 tickets executing simultaneously
3. **Failure Recovery**
   - Kill VM mid-execution, verify retry
4. **Full Pipeline**
   - Spec → Design Agent → Tickets → Execution → PRs
5. **Auth Flows**
   - Login, logout, token refresh, password reset

#### CI/CD Pipeline
1. Create `.github/workflows/test.yml`
2. Run on PR and merge to main
3. Steps: lint, unit tests, e2e tests, build
4. Deploy to staging on merge

#### Load Testing
1. Install k6 or Artillery
2. Create load test scripts
3. Test scenarios:
   - 100 concurrent API requests
   - 50 simultaneous design sessions
   - 1000 ticket queue processing

### Success Criteria
- [ ] All test scenarios passing
- [ ] CI/CD pipeline runs on every PR
- [ ] Load tests pass with acceptable latency
- [ ] Chaos tests verify recovery

---

## Track 9: Documentation

### Goal
Comprehensive docs for users, developers, and operators.

### Tasks

#### Quick Start Guide
- 5-minute setup for new users
- First project walkthrough
- Common use cases

#### API Reference
- OpenAPI/Swagger spec
- All endpoints documented
- Request/response examples
- Error codes explained

#### Architecture Overview
- System diagram
- Component responsibilities
- Data flow documentation
- Technology choices explained

#### Operator Runbook
- Deployment procedures
- Monitoring setup
- Common issues and fixes
- Backup/restore procedures
- Scaling guidelines

#### Agent Development Guide
- Creating custom agents
- Agent template structure
- Testing agents locally
- Publishing to marketplace

#### Troubleshooting Guide
- Common errors and solutions
- Debug logging
- Support escalation

### Success Criteria
- [ ] New user can start in < 5 minutes
- [ ] API fully documented with examples
- [ ] Operators can deploy and maintain
- [ ] Developers can create custom agents

---

## Priority Order

| Priority | Track | Est. Effort | Dependencies |
|----------|-------|-------------|--------------|
| P0 | Track 3: Agent Execution Engine | 3-4 days | None |
| P0 | Track 8: E2E Testing | 2-3 days | Track 3 |
| P1 | Track 1: HITL Phase 6 | 1-2 days | None |
| P1 | Track 2: HITL Phase 7 | 1 day | Track 1 |
| P1 | Track 5: Security | 2-3 days | None |
| P1 | Track 7: Dashboard UI | 3-4 days | None |
| P2 | Track 4: Auth Completion | 2 days | None |
| P2 | Track 6: Observability | 2-3 days | None |
| P2 | Track 9: Documentation | 2 days | All others |

---

## Quick Commands

```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@146.190.35.235

# Platform logs
pm2 logs swarm-platform --lines 50

# Restart platform
pm2 restart swarm-platform

# Database queries
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT * FROM tickets LIMIT 10;"

# Build dashboard
cd /opt/swarm-dashboard && npm run build

# Check VM status
curl -s localhost:8080/api/swarm/status | jq

# Run single ticket
swarm-engine run-ticket <id> --wait
```

---

*Generated 2025-12-13 by Claude*
