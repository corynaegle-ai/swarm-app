# CLI Bug Fixes - Implementation Prompt

**Purpose:** Fix 5 bugs identified in swarm-agent and swarm-workflow CLIs
**Estimated Time:** 1 focused session (15-20 min)
**Prerequisites:** SSH access to droplet, familiarity with Node.js/ES modules

---

## Overview

The Swarm CLI tools (swarm-agent, swarm-workflow) are fully implemented but have 5 bugs discovered during code review.

## File Locations

| File | Path | Lines |
|------|------|-------|
| swarm-agent.js | /opt/swarm-engine/cli/swarm-agent.js | 333 |
| swarm-workflow.js | /opt/swarm-engine/cli/swarm-workflow.js | 410 |

---

## BUG-1: CRITICAL - Delete crashes on FK constraint

### Problem

When deleting an agent or workflow that has associated records, the delete command crashes:

```
SqliteError: FOREIGN KEY constraint failed
```

### Required Changes

Add `--force` option that cascades deletes:

**For swarm-agent.js:**
```sql
-- With --force:
DELETE FROM step_executions WHERE agent_id IN (SELECT id FROM agents WHERE name = ?)
DELETE FROM agents WHERE name = ?
```

**For swarm-workflow.js:**
```sql
-- With --force:
DELETE FROM step_executions WHERE run_id IN (SELECT id FROM workflow_runs WHERE workflow_id IN (SELECT id FROM workflows WHERE name = ?))
DELETE FROM workflow_runs WHERE workflow_id IN (SELECT id FROM workflows WHERE name = ?)
DELETE FROM workflows WHERE name = ?
```

### Testing

```bash
swarm-agent delete echo
swarm-workflow delete echo-test
swarm-agent delete echo --force
swarm-workflow delete echo-test --force
```

---

## BUG-2: MEDIUM - Separator line renders incorrectly

### Problem

Footer separator shows 60 separate lines instead of one line with 60 dashes.

### Fix

```javascript
// WRONG:
console.log(chalk.gray('\n─'.repeat(60)));

// CORRECT:
console.log(chalk.gray('\n' + '─'.repeat(60)));
```

---

## BUG-3: LOW - JSON output inconsistency

`list --json` returns JSON fields as strings, but `info --json` parses them to arrays/objects.

### Fix

Parse JSON fields in list command's --json handler before output.

---

## BUG-4: LOW - Templates in agent list (OPTIONAL)

Templates appear with `_template:` prefix. May be intentional for discoverability. Skip unless requested.

---

## BUG-5: COSMETIC - Missing mkdirSync import

### Problem

swarm-workflow.js imports cpSync and writeFileSync but not mkdirSync.

### Fix

```javascript
// Add mkdirSync to import
import { readFileSync, readdirSync, existsSync, cpSync, mkdirSync, writeFileSync } from 'fs';
```

---

## Implementation Order

1. BUG-5 (30 sec) - Add missing import
2. BUG-2 (2 min) - Fix separator rendering
3. BUG-1 (10 min) - Add --force cascade delete
4. BUG-3 (5 min) - Parse JSON in list output (optional)
5. BUG-4 - Skip unless requested

---

## Verification Checklist

- [ ] BUG-5: swarm-workflow.js has mkdirSync import
- [ ] BUG-2: swarm-agent info shows single separator line
- [ ] BUG-2: swarm-workflow info shows single separator line
- [ ] BUG-1: delete shows helpful FK error (no crash)
- [ ] BUG-1: delete --force cascades successfully
- [ ] BUG-3: list --json returns parsed arrays (optional)
- [ ] All changes committed to git
