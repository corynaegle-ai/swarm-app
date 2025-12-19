# Future Enhancements

Improvements identified during development that are not blocking E2E but would improve the system.

---

## Sentinel Agent - Tiered Review Passes

**Component:** swarm-verifier  
**File:** /opt/swarm-verifier/lib/phases/sentinel.js  
**Priority:** Low (not blocking E2E)

### Current State
Single-pass review using git diff only.

### Desired State
Tiered context loading for complex reviews:

| Pass | Context | When to Use |
|------|---------|-------------|
| Pass 1 | Diff only | Quick changes, simple fixes |
| Pass 2 | Diff + related files | Changes touching multiple modules |
| Pass 3 | Full repo context | Architectural changes, new features |

### Implementation Notes
```javascript
// Proposed additions to sentinel.js

async function getRelatedFiles(repoPath, changedFiles) {
  // For each changed file, find:
  // - Files that import it
  // - Files it imports
  // - Associated test files
  // - Type definition files
}

async function runTieredReview(repoPath, ticketId, baseBranch) {
  // Pass 1: Quick diff review
  const pass1 = await reviewDiffOnly(diff);
  if (pass1.decision === 'APPROVE' && pass1.score > 90) {
    return pass1; // Fast path for clean changes
  }
  
  // Pass 2: Include related files
  const relatedFiles = await getRelatedFiles(repoPath, changedFiles);
  const pass2 = await reviewWithContext(diff, relatedFiles);
  if (pass2.decision !== 'REQUEST_CHANGES') {
    return pass2;
  }
  
  // Pass 3: Full context for complex issues
  const fullContext = await getFullRepoContext(repoPath);
  return await reviewWithFullContext(diff, fullContext);
}
```

### Benefits
- Faster reviews for simple changes (Pass 1 only)
- Better accuracy for complex changes (Pass 2-3)
- Reduced Claude API token usage for trivial PRs

---

## Additional Future Enhancements

### 1. Review Agent (PR Automation)
- Auto-approve PRs that pass Sentinel with score > 95
- Auto-request-changes for score < 60
- Human escalation for 60-95 range

### 2. Agent Learning System
- Track which patterns cause failures
- Adjust prompts based on historical success
- Per-repo coding conventions

### 3. Cost Tracking
- Token usage per ticket
- API costs per project
- Budget alerts and limits
