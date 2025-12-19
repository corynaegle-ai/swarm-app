# Test Harness Design Document

**Document ID:** DESIGN-TEST-001  
**Status:** Draft  
**Author:** Neural Systems Architect  
**Created:** 2024-12-11  
**Last Updated:** 2024-12-11

---

## 1. Executive Summary

This document defines the test automation architecture for Project Swarm. The test harness provides comprehensive coverage across infrastructure, orchestration, agent, and integration layers while maintaining fast feedback loops for developers.

### Goals

| Goal | Description |
|------|-------------|
| **Confidence** | Catch regressions before they reach production |
| **Speed** | Unit tests < 10s, integration < 2min, E2E < 10min |
| **Isolation** | Tests don't pollute each other or production |
| **Determinism** | Same inputs = same outputs (mock AI when needed) |
| **Coverage** | 80%+ on business logic, critical paths 100% |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TEST HARNESS                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Unit Tests  │  │ Integration  │  │   E2E Tests  │          │
│  │   (Jest)     │  │   Tests      │  │  (Droplet)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼─────────────────▼─────────────────▼───────┐          │
│  │              Test Infrastructure                  │          │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │          │
│  │  │  Mocks  │  │Fixtures │  │ Helpers │          │          │
│  │  └─────────┘  └─────────┘  └─────────┘          │          │
│  └──────────────────────────────────────────────────┘          │
│         │                 │                 │                   │
│  ┌──────▼─────────────────▼─────────────────▼───────┐          │
│  │              System Under Test                    │          │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │          │
│  │  │ Tickets │  │   VMs   │  │ Agents  │          │          │
│  │  └─────────┘  └─────────┘  └─────────┘          │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
swarm-tickets/
├── test/
│   ├── unit/                    # Fast, isolated tests
│   │   ├── ticket-store.test.js
│   │   ├── dag-resolver.test.js
│   │   ├── agent-registry.test.js
│   │   ├── token-budget.test.js
│   │   └── event-store.test.js
│   │
│   ├── integration/             # Component interaction tests
│   │   ├── api-contract.test.js
│   │   ├── vm-lifecycle.test.js
│   │   ├── git-operations.test.js
│   │   ├── agent-assignment.test.js
│   │   └── setup/
│   │       ├── docker-compose.yml
│   │       └── integration-setup.js
│   │
│   ├── e2e/                     # Full workflow tests
│   │   ├── single-ticket.test.js
│   │   ├── multi-ticket-dag.test.js
│   │   ├── scaling.test.js
│   │   └── setup/
│   │       ├── e2e-config.js
│   │       └── droplet-helpers.js
│   │
│   ├── fixtures/                # Test data
│   │   ├── tickets/
│   │   │   ├── simple-task.json
│   │   │   ├── code-gen-task.json
│   │   │   └── dag-project.json
│   │   ├── claude-responses/
│   │   │   ├── code-generation.json
│   │   │   ├── review-response.json
│   │   │   └── error-response.json
│   │   └── repos/
│   │       └── test-repo-setup.sh
│   │
│   ├── mocks/                   # Test doubles
│   │   ├── claude-api.mock.js
│   │   ├── github-api.mock.js
│   │   ├── firecracker.mock.js
│   │   └── ssh.mock.js
│   │
│   ├── helpers/                 # Test utilities
│   │   ├── wait-for.js
│   │   ├── test-db.js
│   │   ├── test-repo.js
│   │   ├── vm-helpers.js
│   │   └── assertions.js
│   │
│   └── config/                  # Test configuration
│       ├── jest.config.js
│       ├── jest.unit.config.js
│       ├── jest.integration.config.js
│       └── jest.e2e.config.js
│
├── scripts/
│   ├── test-unit.sh
│   ├── test-integration.sh
│   ├── test-e2e.sh
│   └── test-all.sh
│
└── package.json                 # Test dependencies
```

---

## 4. Test Categories

### 4.1 Unit Tests

**Scope:** Individual functions and classes in isolation  
**Runtime:** < 10 seconds total  
**Dependencies:** None (all mocked)  
**Triggers:** Every commit, pre-push hook

#### Test Modules

| Module | File | Coverage Target |
|--------|------|-----------------|
| Ticket Store | `ticket-store.test.js` | 90% |
| DAG Resolver | `dag-resolver.test.js` | 95% |
| Agent Registry | `agent-registry.test.js` | 85% |
| Token Budget | `token-budget.test.js` | 90% |
| Event Store | `event-store.test.js` | 85% |

### 4.2 Integration Tests

**Scope:** Component combinations with real (but isolated) services  
**Runtime:** < 2 minutes total  
**Dependencies:** SQLite, local Git, Docker (optional)  
**Triggers:** PR creation, merge to main

#### Test Modules

| Module | File | Description |
|--------|------|-------------|
| API Contract | `api-contract.test.js` | Validate HTTP API shape |
| VM Lifecycle | `vm-lifecycle.test.js` | Spawn/cleanup with mock Firecracker |
| Git Operations | `git-operations.test.js` | Branch/commit/push with local repo |
| Agent Assignment | `agent-assignment.test.js` | Ticket → Agent matching |

### 4.3 End-to-End Tests

**Scope:** Complete workflows on real infrastructure  
**Runtime:** < 10 minutes total  
**Dependencies:** Droplet, Firecracker, Claude API  
**Triggers:** Nightly, release branches, manual

#### Test Modules

| Module | File | Description |
|--------|------|-------------|
| Single Ticket | `single-ticket.test.js` | One ticket → one PR |
| Multi-Ticket DAG | `multi-ticket-dag.test.js` | Project with dependencies |
| Scaling | `scaling.test.js` | 100 concurrent VMs |

---

## 5. Mock Strategy

### 5.1 Claude API Mock

```javascript
// mocks/claude-api.mock.js
class MockClaudeAPI {
  constructor(fixtures = {}) {
    this.fixtures = fixtures;
    this.calls = [];
  }

  async complete(prompt, options = {}) {
    this.calls.push({ prompt, options, timestamp: Date.now() });
    
    // Return fixture based on prompt pattern
    if (prompt.includes('generate code')) {
      return this.fixtures.codeGeneration || DEFAULT_CODE_RESPONSE;
    }
    if (prompt.includes('review')) {
      return this.fixtures.review || DEFAULT_REVIEW_RESPONSE;
    }
    return this.fixtures.default || DEFAULT_RESPONSE;
  }

  getCallCount() { return this.calls.length; }
  getLastCall() { return this.calls[this.calls.length - 1]; }
  reset() { this.calls = []; }
}
```

### 5.2 Firecracker Mock

```javascript
// mocks/firecracker.mock.js
class MockFirecracker {
  constructor() {
    this.vms = new Map();
    this.nextId = 1;
  }

  async spawn(config) {
    const id = this.nextId++;
    const vm = {
      id,
      state: 'running',
      ip: `10.0.0.${id + 1}`,
      config,
      createdAt: Date.now()
    };
    this.vms.set(id, vm);
    return vm;
  }

  async terminate(id) {
    const vm = this.vms.get(id);
    if (vm) {
      vm.state = 'terminated';
      this.vms.delete(id);
    }
    return { success: true };
  }

  async restore(snapshotId) {
    // Simulate 8ms restore time
    await new Promise(r => setTimeout(r, 8));
    return this.spawn({ snapshot: snapshotId });
  }
}
```

### 5.3 GitHub API Mock

```javascript
// mocks/github-api.mock.js
class MockGitHubAPI {
  constructor() {
    this.prs = [];
    this.branches = new Set(['main']);
  }

  async createBranch(name, fromRef = 'main') {
    this.branches.add(name);
    return { ref: `refs/heads/${name}` };
  }

  async createPR(title, head, base = 'main') {
    const pr = { 
      id: this.prs.length + 1, 
      title, head, base, 
      state: 'open' 
    };
    this.prs.push(pr);
    return pr;
  }

  async mergePR(id) {
    const pr = this.prs.find(p => p.id === id);
    if (pr) pr.state = 'merged';
    return pr;
  }
}
```

---

## 6. Fixtures

### 6.1 Ticket Fixtures

```json
// fixtures/tickets/code-gen-task.json
{
  "id": "test-ticket-001",
  "type": "code-gen",
  "status": "pending",
  "spec": {
    "task": "Create a utility function that validates email addresses",
    "language": "javascript",
    "outputFile": "src/utils/validate-email.js",
    "requirements": [
      "Handle edge cases like missing @ or domain",
      "Return boolean",
      "Export as named function"
    ]
  },
  "dependencies": [],
  "metadata": {
    "priority": "medium",
    "estimatedTokens": 500
  }
}
```

### 6.2 Claude Response Fixtures

```json
// fixtures/claude-responses/code-generation.json
{
  "id": "msg_test_001",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "```javascript\n/**\n * Validates an email address format\n * @param {string} email - The email to validate\n * @returns {boolean} - True if valid\n */\nexport function validateEmail(email) {\n  if (!email || typeof email !== 'string') return false;\n  const pattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return pattern.test(email.trim());\n}\n```"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 150,
    "output_tokens": 89
  }
}
```

---

## 7. Test Helpers

### 7.1 Wait For Condition

```javascript
// helpers/wait-for.js
async function waitFor(conditionFn, options = {}) {
  const { timeout = 30000, interval = 500, message = 'Condition not met' } = options;
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const result = await conditionFn();
      if (result) return result;
    } catch (e) {
      // Condition threw, keep waiting
    }
    await new Promise(r => setTimeout(r, interval));
  }
  
  throw new Error(`Timeout: ${message} (waited ${timeout}ms)`);
}
```

### 7.2 Test Database

```javascript
// helpers/test-db.js
const Database = require('better-sqlite3');

function createTestDb() {
  const db = new Database(':memory:');
  
  // Apply migrations
  db.exec(`
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      spec TEXT NOT NULL,
      dependencies TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  return db;
}
```

### 7.3 Test Repository

```javascript
// helpers/test-repo.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function createTestRepo() {
  const repoPath = path.join(os.tmpdir(), `test-repo-${Date.now()}`);
  fs.mkdirSync(repoPath, { recursive: true });
  
  execSync('git init', { cwd: repoPath });
  execSync('git config user.email "test@test.com"', { cwd: repoPath });
  execSync('git config user.name "Test"', { cwd: repoPath });
  
  // Initial commit
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Repo');
  execSync('git add . && git commit -m "Initial commit"', { cwd: repoPath });
  
  return {
    path: repoPath,
    cleanup: () => fs.rmSync(repoPath, { recursive: true, force: true })
  };
}
```

---

## 8. Configuration

### 8.1 Jest Base Config

```javascript
// config/jest.config.js
module.exports = {
  testEnvironment: 'node',
  rootDir: '../',
  modulePathIgnorePatterns: ['<rootDir>/test/fixtures'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/index.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/helpers/setup.js'],
  testTimeout: 10000
};
```

### 8.2 Unit Test Config

```javascript
// config/jest.unit.config.js
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/test/unit/**/*.test.js'],
  testTimeout: 5000,
  coverageDirectory: '<rootDir>/coverage/unit'
};
```

### 8.3 Integration Test Config

```javascript
// config/jest.integration.config.js
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/test/integration/**/*.test.js'],
  testTimeout: 60000,
  coverageDirectory: '<rootDir>/coverage/integration',
  globalSetup: '<rootDir>/test/integration/setup/global-setup.js',
  globalTeardown: '<rootDir>/test/integration/setup/global-teardown.js'
};
```

### 8.4 E2E Test Config

```javascript
// config/jest.e2e.config.js
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/test/e2e/**/*.test.js'],
  testTimeout: 300000, // 5 minutes per test
  coverageDirectory: '<rootDir>/coverage/e2e',
  maxWorkers: 1, // Sequential execution for E2E
  bail: true // Stop on first failure
};
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/unit/lcov.info
          flags: unit

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:integration
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/integration/lcov.info
          flags: integration

  e2e-tests:
    runs-on: self-hosted  # Droplet runner
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:e2e
        env:
          DROPLET_HOST: ${{ secrets.DROPLET_HOST }}
          CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
```

---

## 10. Test Scripts

### 10.1 Run Unit Tests

```bash
#!/bin/bash
# scripts/test-unit.sh
set -e

echo "🧪 Running unit tests..."
npx jest --config test/config/jest.unit.config.js --coverage "$@"
echo "✅ Unit tests passed!"
```

### 10.2 Run Integration Tests

```bash
#!/bin/bash
# scripts/test-integration.sh
set -e

echo "🔗 Running integration tests..."

# Start test services if needed
if [ -f test/integration/setup/docker-compose.yml ]; then
  docker-compose -f test/integration/setup/docker-compose.yml up -d
  trap "docker-compose -f test/integration/setup/docker-compose.yml down" EXIT
fi

npx jest --config test/config/jest.integration.config.js --coverage "$@"
echo "✅ Integration tests passed!"
```

### 10.3 Run E2E Tests

```bash
#!/bin/bash
# scripts/test-e2e.sh
set -e

echo "🚀 Running E2E tests..."
echo "⚠️  Requires access to Swarm droplet"

# Verify droplet connectivity
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes root@146.190.35.235 echo "connected" 2>/dev/null; then
  echo "❌ Cannot connect to droplet. Skipping E2E tests."
  exit 0
fi

npx jest --config test/config/jest.e2e.config.js "$@"
echo "✅ E2E tests passed!"
```

---

## 11. Quality Gates

### 11.1 Pre-Commit Hook

```bash
#!/bin/bash
# .husky/pre-commit
npm run lint
npm run test:unit -- --bail --findRelatedTests $(git diff --cached --name-only)
```

### 11.2 Pre-Push Hook

```bash
#!/bin/bash
# .husky/pre-push
npm run test:unit
npm run test:integration -- --bail
```

### 11.3 Coverage Requirements

| Layer | Lines | Branches | Functions |
|-------|-------|----------|-----------|
| Unit | 80% | 70% | 80% |
| Integration | 60% | 50% | 60% |
| E2E | N/A | N/A | N/A |

---

## 12. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Unit test runtime | < 10s | CI timing |
| Integration test runtime | < 2min | CI timing |
| E2E test runtime | < 10min | CI timing |
| Flaky test rate | < 1% | Failed/total over 30 days |
| Coverage (unit) | > 80% | Codecov |
| Time to first feedback | < 30s | Commit to unit test result |

---

## 13. Appendix: Build Items

See `BUILD-ITEMS-TEST-HARNESS.md` for implementation checklist.
