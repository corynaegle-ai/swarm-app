# Swarm Engine Code Review - Issue Tracker

**Review Date:** 2025-12-10
**Reviewer:** Claude (Systems Architect)
**Scope:** `/opt/swarm-engine` - All CLI and Library files

---

## Summary Statistics

| Category | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 8 |
| MEDIUM | 12 |
| LOW | 14 |
| STYLE/COSMETIC | 9 |
| **TOTAL** | **46** |

---

## Files Reviewed

| File | Lines | Issues |
|------|-------|--------|
| `cli/swarm-agent.js` | 333 | 7 |
| `cli/swarm-workflow.js` | 410 | 6 |
| `cli/swarm-run.js` | 163 | 6 |
| `cli/init-registry.js` | 154 | 3 |
| `cli/register-templates.js` | 238 | 5 |
| `lib/dispatcher.js` | 185 | 7 |
| `lib/executor.js` | 268 | 7 |
| `lib/variable-resolver.js` | 135 | 4 |
| `lib/template-queries.js` | 104 | 3 |
| `test-template-queries.js` | 15 | 4 |

---

## 🔴 CRITICAL Issues (3)

### CRIT-01: Race Condition in VM Acquisition ✅ FIXED
- **File:** `lib/executor.js`
- **Function:** `acquireVm()`
- **Description:** Check-then-spawn is not atomic. Two concurrent calls could spawn VMs in same slot.
- **Fix Applied:** Atomic file-based locking using mkdir. Lock files in `/var/run/swarm-vm-locks/`. Added stale lock detection (60s timeout).
- **Commit:** `f06a297`
- **Status:** [x] FIXED 2025-12-10

### CRIT-02: Parallel Execution Not Implemented
- **File:** `lib/dispatcher.js`
- **Line:** ~21
- **Description:** Comment says "could parallelize here" but `for...of` loop executes sequentially. The `maxParallel` option is stored but never used.
- **Impact:** Performance degradation, advertised feature doesn't work
- **Fix:** Implement Promise.all with concurrency limit
- **Status:** [ ] Open

### CRIT-03: Missing Await Exception Handling
- **File:** `cli/swarm-run.js`
- **Line:** ~61
- **Description:** `dispatcher.close()` in finally block may not clean up properly if exception thrown before result assignment.
- **Impact:** Resource leaks, database connections left open
- **Fix:** Restructure try/catch/finally flow
- **Status:** [ ] Open

---

## 🟠 HIGH Issues (8)

### HIGH-01: SQL Injection Vulnerability ✅ ALREADY FIXED
- **File:** `cli/register-templates.js`
- **Description:** Code already uses parameterized queries via better-sqlite3 `db.prepare()`. Issue was logged during review but code was already secure.
- **Status:** [x] VERIFIED SECURE 2025-12-10

### HIGH-02: Command Injection Risk ✅ FIXED
- **File:** `lib/executor.js`
- **Function:** `runAgentInVm()`
- **Description:** Agent names interpolated into shell commands could execute arbitrary code.
- **Fix Applied:** Added `sanitizeForShell()` method that only allows alphanumeric, underscore, hyphen, colon, dot.
- **Commit:** `f06a297`
- **Status:** [x] FIXED 2025-12-10

### HIGH-03: VM Slot Exhaustion (PARTIAL)
- **File:** `lib/executor.js`
- **Function:** `acquireVm()`
- **Description:** No timeout/cleanup for stale VMs.
- **Fix Applied:** Added stale lock detection with 60s timeout and automatic cleanup.
- **Remaining:** Still needs VM health checks for slots with orphaned namespaces.
- **Status:** [~] PARTIAL 2025-12-10

### HIGH-04: JSON Parse Crash Risk
- **File:** `cli/swarm-run.js`
- **Line:** ~95
- **Description:** `JSON.parse(run.step_results)` with no try-catch. Will crash if `step_results` is null or malformed.
- **Status:** [ ] Open

### HIGH-05: Fragile Argument Parsing
- **File:** `cli/swarm-run.js`
- **Line:** ~90
- **Description:** `args.find(a => a.startsWith('{'))` matches any arg starting with `{`, including malformed flags.
- **Status:** [ ] Open

### HIGH-06: Infinite Loop Risk
- **File:** `lib/dispatcher.js`
- **Line:** ~67
- **Description:** Circular dependency check only catches when `ready.length === 0 && pending.length > 0`, doesn't handle self-referential dependencies.
- **Status:** [ ] Open

### HIGH-07: on_error Type Coercion Bug
- **File:** `lib/dispatcher.js`
- **Line:** ~77
- **Description:** `step.on_error || workflow.on_error` - workflow.on_error is JSON string from DB, step.on_error is object.
- **Status:** [ ] Open

### HIGH-08: No Input Sanitization
- **Files:** All CLI files
- **Description:** User-provided names, paths, and JSON not validated before database operations.
- **Status:** [ ] Open

---

## 🟡 MEDIUM Issues (12)

### MED-01 & MED-02: Database Connection Leak
- **Files:** `cli/swarm-agent.js`, `cli/swarm-workflow.js`
- **Description:** `getDb()` creates new connection per command but never closes it.
- **Status:** [ ] Open

### MED-03 & MED-04: No Transaction for Delete Cascade
- **Files:** `cli/swarm-agent.js`, `cli/swarm-workflow.js`
- **Description:** DELETE statements not wrapped in transaction - could leave orphans if interrupted.
- **Status:** [ ] Open

### MED-05: Temp File Race Condition
- **File:** `cli/register-templates.js`
- **Description:** `/tmp/swarm-sql-${Date.now()}.sql` could collide if called twice in same millisecond.
- **Status:** [ ] Open

### MED-06: No Error Handling for sqlite3
- **File:** `cli/register-templates.js`
- **Description:** `spawnSync('sqlite3', ...)` assumes sqlite3 is installed - no helpful error if missing.
- **Status:** [ ] Open

### MED-07: No Retry Logic
- **File:** `lib/dispatcher.js`
- **Description:** No retry mechanism for transient failures despite database schema having `retry_count` column.
- **Status:** [ ] Open

### MED-08: Handler Parsing Issue
- **File:** `lib/dispatcher.js`
- **Description:** `JSON.parse(workflow.on_success)` - field already loaded from DB, may already be parsed or null.
- **Status:** [ ] Open

### MED-09: Capabilities Schema Mismatch
- **File:** `lib/executor.js`
- **Description:** `JSON.parse(agent.capabilities || '{}').entry` expects object with entry key, but schema suggests capabilities is array.
- **Status:** [ ] Open

### MED-10: Prototype Pollution Risk
- **File:** `lib/variable-resolver.js`
- **Function:** `getNestedValue()`
- **Description:** Does not guard against `__proto__` or `constructor` paths.
- **Status:** [ ] Open

### MED-11: Unsafe Regex
- **File:** `lib/variable-resolver.js`
- **Description:** Template regex doesn't handle nested braces correctly.
- **Status:** [ ] Open

### MED-12: Hardcoded Test Values
- **File:** `test-template-queries.js`
- **Description:** Brittle test, fails if templates change.
- **Status:** [ ] Open

---

## 🟢 LOW Issues (14)

- LOW-01: JSON Output Inconsistency
- LOW-02: Missing YAML Validation
- LOW-03: Silent Catch Blocks
- LOW-04: Hardcoded Paths
- LOW-05: Missing Runs Path Info
- LOW-06: No Limit Bounds Check
- LOW-07: Missing Radix Parameter
- LOW-08: Missing Tables in Validation
- LOW-09: Foreign Keys Per-Connection
- LOW-10: Inconsistent on_error Handling
- LOW-11: Work Directory Not Cleaned
- LOW-12: Vague Error Messages
- LOW-13: Comparison Operator Order
- LOW-14: No AND/OR Support

---

## Priority Fix Order

### Phase 1: Security (Fix Immediately)
1. ✅ HIGH-01: SQL Injection - VERIFIED SECURE
2. ✅ HIGH-02: Command Injection - FIXED
3. ✅ CRIT-01: Race Condition - FIXED

### Phase 2: Stability (Fix Before Production)
1. CRIT-03: Missing Await Exception Handling
2. HIGH-06: Infinite Loop Risk
3. MED-01, MED-02: Database Connection Leaks
4. HIGH-04: JSON Parse Crash Risk

### Phase 3: Correctness
1. CRIT-02: Implement Parallel Execution
2. HIGH-07: on_error Type Coercion
3. MED-09: Capabilities Schema Mismatch

### Phase 4: Technical Debt
1. STYLE-02: Deduplicate CLI code
2. MED-07: Add Retry Logic
3. LOW-04: Make paths configurable
