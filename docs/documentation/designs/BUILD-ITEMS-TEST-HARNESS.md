# Test Harness Build Items

**Document ID:** BUILD-TEST-001  
**Status:** Active  
**Related:** DESIGN-TEST-001 (test-harness-design.md)  
**Created:** 2024-12-11

---

## Overview

Implementation checklist for Swarm test harness. Items ordered by dependency and priority.

---

## Phase 1: Foundation (P0)

### 1.1 Directory Structure
- [ ] Create `test/` directory structure in swarm-tickets
- [ ] Create subdirectories: `unit/`, `integration/`, `e2e/`, `fixtures/`, `mocks/`, `helpers/`, `config/`
- [ ] Create `scripts/` directory for test runners

### 1.2 Dependencies
- [ ] Add Jest to package.json devDependencies
- [ ] Add better-sqlite3 for test database
- [ ] Add supertest for HTTP testing
- [ ] Add @faker-js/faker for test data generation
- [ ] Add husky for git hooks

### 1.3 Configuration Files
- [ ] Create `test/config/jest.config.js` (base config)
- [ ] Create `test/config/jest.unit.config.js`
- [ ] Create `test/config/jest.integration.config.js`
- [ ] Create `test/config/jest.e2e.config.js`
- [ ] Create `test/helpers/setup.js` (global test setup)

### 1.4 NPM Scripts
- [ ] Add `test:unit` script to package.json
- [ ] Add `test:integration` script to package.json
- [ ] Add `test:e2e` script to package.json
- [ ] Add `test:all` script to package.json
- [ ] Add `test:coverage` script to package.json

---

## Phase 2: Test Helpers (P0)

### 2.1 Core Helpers
- [ ] Implement `helpers/wait-for.js` - async condition waiter
- [ ] Implement `helpers/test-db.js` - in-memory SQLite factory
- [ ] Implement `helpers/test-repo.js` - temp Git repo factory
- [ ] Implement `helpers/assertions.js` - custom Jest matchers

### 2.2 Test Lifecycle
- [ ] Implement `helpers/setup.js` - global beforeAll/afterAll
- [ ] Implement cleanup utilities for temp files/repos
- [ ] Implement test isolation helpers

---

## Phase 3: Mocks (P0)

### 3.1 External Service Mocks
- [ ] Implement `mocks/claude-api.mock.js`
  - [ ] Basic complete() method
  - [ ] Fixture-based responses
  - [ ] Call tracking
  - [ ] Error simulation
- [ ] Implement `mocks/github-api.mock.js`
  - [ ] createBranch()
  - [ ] createPR()
  - [ ] mergePR()
  - [ ] Call tracking
- [ ] Implement `mocks/ssh.mock.js`
  - [ ] exec() simulation
  - [ ] Response fixtures

### 3.2 Infrastructure Mocks
- [ ] Implement `mocks/firecracker.mock.js`
  - [ ] spawn()
  - [ ] terminate()
  - [ ] restore()
  - [ ] State tracking

---

## Phase 4: Fixtures (P1)

### 4.1 Ticket Fixtures
- [ ] Create `fixtures/tickets/simple-task.json`
- [ ] Create `fixtures/tickets/code-gen-task.json`
- [ ] Create `fixtures/tickets/review-task.json`
- [ ] Create `fixtures/tickets/dag-project.json` (multi-ticket with deps)

### 4.2 Claude Response Fixtures
- [ ] Create `fixtures/claude-responses/code-generation.json`
- [ ] Create `fixtures/claude-responses/review-response.json`
- [ ] Create `fixtures/claude-responses/error-response.json`
- [ ] Create `fixtures/claude-responses/timeout-response.json`

### 4.3 Repository Fixtures
- [ ] Create `fixtures/repos/test-repo-setup.sh`
- [ ] Create `fixtures/repos/sample-project/` template

---

## Phase 5: Unit Tests (P0)

### 5.1 Ticket Store Tests
- [ ] Create `unit/ticket-store.test.js`
  - [ ] Test create ticket
  - [ ] Test read ticket
  - [ ] Test update ticket status
  - [ ] Test delete ticket
  - [ ] Test list tickets with filters
  - [ ] Test upsert behavior

### 5.2 DAG Resolver Tests
- [ ] Create `unit/dag-resolver.test.js`
  - [ ] Test topological sort
  - [ ] Test circular dependency detection
  - [ ] Test execution order with multiple roots
  - [ ] Test partial completion handling
  - [ ] Test dependency satisfaction check

### 5.3 Agent Registry Tests
- [ ] Create `unit/agent-registry.test.js`
  - [ ] Test register agent template
  - [ ] Test get agent by type
  - [ ] Test list agents
  - [ ] Test template validation

### 5.4 Token Budget Tests
- [ ] Create `unit/token-budget.test.js`
  - [ ] Test token estimation
  - [ ] Test budget allocation
  - [ ] Test chunking decisions
  - [ ] Test overflow handling

### 5.5 Event Store Tests
- [ ] Create `unit/event-store.test.js`
  - [ ] Test append event
  - [ ] Test get events by ticket
  - [ ] Test event replay
  - [ ] Test event ordering

---

## Phase 6: Integration Tests (P1)

### 6.1 API Contract Tests
- [ ] Create `integration/api-contract.test.js`
  - [ ] Test GET /tickets
  - [ ] Test GET /tickets/:id
  - [ ] Test POST /tickets
  - [ ] Test PUT /tickets/:id
  - [ ] Test POST /tickets/:id/complete
  - [ ] Test GET /tickets/next
  - [ ] Test error responses

### 6.2 VM Lifecycle Tests
- [ ] Create `integration/vm-lifecycle.test.js`
  - [ ] Test spawn VM
  - [ ] Test spawn from snapshot
  - [ ] Test VM networking (IP assignment)
  - [ ] Test VM cleanup
  - [ ] Test concurrent VM spawning

### 6.3 Git Operations Tests
- [ ] Create `integration/git-operations.test.js`
  - [ ] Test create branch
  - [ ] Test commit files
  - [ ] Test push changes
  - [ ] Test branch from ticket ID naming

### 6.4 Agent Assignment Tests
- [ ] Create `integration/agent-assignment.test.js`
  - [ ] Test assign ticket to agent
  - [ ] Test dependency blocking
  - [ ] Test reassignment on failure
  - [ ] Test concurrent assignment

---

## Phase 7: E2E Tests (P2)

### 7.1 Single Ticket Workflow
- [ ] Create `e2e/single-ticket.test.js`
  - [ ] Test ticket creation to PR completion
  - [ ] Test with real Claude API (rate-limited)
  - [ ] Test with real GitHub push
  - [ ] Verify artifacts (branch, commit, files)

### 7.2 Multi-Ticket DAG
- [ ] Create `e2e/multi-ticket-dag.test.js`
  - [ ] Test project breakdown
  - [ ] Test dependency resolution
  - [ ] Test parallel execution
  - [ ] Test completion aggregation

### 7.3 Scaling Tests
- [ ] Create `e2e/scaling.test.js`
  - [ ] Test 10 concurrent VMs
  - [ ] Test 50 concurrent VMs
  - [ ] Test 100 concurrent VMs
  - [ ] Measure success rate and timing

---

## Phase 8: CI/CD Integration (P1)

### 8.1 GitHub Actions
- [ ] Create `.github/workflows/test.yml`
  - [ ] Unit test job
  - [ ] Integration test job
  - [ ] E2E test job (main branch only)
  - [ ] Coverage reporting

### 8.2 Git Hooks
- [ ] Configure husky
- [ ] Create pre-commit hook (lint + related unit tests)
- [ ] Create pre-push hook (full unit + integration)

### 8.3 Coverage Reporting
- [ ] Configure Codecov or similar
- [ ] Set coverage thresholds
- [ ] Add coverage badges to README

---

## Phase 9: Documentation (P2)

### 9.1 Test Documentation
- [ ] Create `test/README.md` with usage instructions
- [ ] Document mock usage patterns
- [ ] Document fixture management
- [ ] Document E2E test requirements

### 9.2 Runbook Updates
- [ ] Add test troubleshooting to runbooks
- [ ] Document CI/CD debugging
- [ ] Document local test environment setup

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] `npm run test:unit` executes without errors
- [ ] Jest configuration loads correctly
- [ ] All directories exist

### Phase 2-4 Complete When:
- [ ] Helpers are importable and functional
- [ ] Mocks pass their own unit tests
- [ ] Fixtures load correctly

### Phase 5 Complete When:
- [ ] Unit tests achieve 80% coverage on target modules
- [ ] Tests run in < 10 seconds
- [ ] All tests pass reliably (no flakes)

### Phase 6 Complete When:
- [ ] Integration tests pass with isolated services
- [ ] Tests run in < 2 minutes
- [ ] API contract validated

### Phase 7 Complete When:
- [ ] E2E test completes full ticket workflow
- [ ] Tests run in < 10 minutes
- [ ] Success rate > 95%

### Phase 8 Complete When:
- [ ] CI pipeline runs on all PRs
- [ ] Coverage reports generated
- [ ] Git hooks prevent bad commits

---

## Dependencies

```
Phase 1 (Foundation)
    │
    ├── Phase 2 (Helpers)
    │       │
    │       └── Phase 5 (Unit Tests)
    │
    ├── Phase 3 (Mocks)
    │       │
    │       ├── Phase 5 (Unit Tests)
    │       │
    │       └── Phase 6 (Integration Tests)
    │
    └── Phase 4 (Fixtures)
            │
            ├── Phase 5 (Unit Tests)
            │
            ├── Phase 6 (Integration Tests)
            │
            └── Phase 7 (E2E Tests)

Phase 8 (CI/CD) depends on: Phases 5, 6
Phase 9 (Docs) can run in parallel
```

---

## Estimated Effort

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 1 | 2 hours | Day 1 |
| Phase 2 | 3 hours | Day 1 |
| Phase 3 | 4 hours | Day 1-2 |
| Phase 4 | 2 hours | Day 2 |
| Phase 5 | 6 hours | Day 2-3 |
| Phase 6 | 6 hours | Day 3-4 |
| Phase 7 | 4 hours | Day 4-5 |
| Phase 8 | 3 hours | Day 5 |
| Phase 9 | 2 hours | Day 5 |
| **Total** | **32 hours** | **5 days** |
