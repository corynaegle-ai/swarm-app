# Test Harness Implementation Prompt

## Objective
Implement comprehensive test infrastructure for swarm-tickets following the test pyramid strategy.

## Reference Documents
- Design: `/design-docs/test-harness-design.md`
- Build Items: `/design-docs/BUILD-ITEMS-TEST-HARNESS.md`

## Implementation Phases

### Phase 1: Foundation ✅
- [x] Directory structure (`test/unit`, `test/integration`, `test/e2e`)
- [x] Jest config with multi-project setup
- [x] Custom matchers and globals
- [x] Placeholder tests verifying setup
- [x] npm scripts (`test`, `test:unit`, `test:integration`, `test:e2e`)

### Phase 2: Test Helpers ✅
- [x] Mock factories: `createMockTicket()`, `createMockAgent()`, `createMockVM()`
- [x] Claude API mocking with realistic responses
- [x] Database test utilities (setup/teardown, seeding)
- [x] HTTP mocking for external services
- [x] Enhanced async helpers

### Phase 3: Unit Tests
- [ ] TicketStore CRUD operations
- [ ] DAG dependency resolution
- [ ] Event sourcing logic
- [ ] Agent template parsing
- [ ] API request validation

### Phase 4: Integration Tests
- [ ] API → TicketStore → SQLite flow
- [ ] WebSocket event propagation
- [ ] Agent registration lifecycle
- [ ] Multi-ticket DAG operations

### Phase 5: E2E Tests (Droplet Only)
- [ ] VM spawn → agent execute → git commit flow
- [ ] Full ticket lifecycle with real Claude API
- [ ] Multi-VM coordination tests

## Test Commands
```bash
npm test              # Unit tests only (CI-safe)
npm run test:unit     # Explicit unit tests
npm run test:int      # Integration tests
npm run test:e2e      # E2E (droplet only)
npm run test:all      # Full suite
npm run test:watch    # Watch mode for TDD
npm run test:coverage # With coverage report
```

## Key Principles
1. **Unit tests are fast** - No I/O, mock everything
2. **Integration tests use real DB** - In-memory SQLite
3. **E2E tests need droplet** - Skip gracefully elsewhere
4. **Fixtures over mocks** - Realistic test data
5. **Cleanup always** - No test pollution

## Success Criteria
- All tests pass locally and on droplet
- Coverage > 80% for core modules
- E2E validates full ticket-to-PR workflow
- CI integration ready (unit + integration)
