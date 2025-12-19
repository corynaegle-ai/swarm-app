

## PR Auto-Creation Fix (Dec 18, 2024)

**Problem**: Engine's _createPR method relied on gh CLI which wasn't installed on droplet.

**Solution**: Replaced gh CLI with GitHub REST API calls.

**Changes** (commit 841c3cd in swarm repo):
- /opt/swarm/engine/lib/engine.js:
  - _createPR() - Now uses fetch() to call GitHub API directly
  - _buildPRBody() - Generates rich PR description with ticket details
  - _findExistingPR() - Handles duplicate PR attempts gracefully
  - _addPRLabels() - Tags PRs with swarm-generated label

**Features**:
- Parses acceptance_criteria as JSON array for checkbox format
- Handles 422 errors (PR already exists, no commits between branches)
- Adds scope-based labels when ticket has estimated_scope

**Audit Status**:
| Gap | Status |
|-----|--------|
| HITL → Engine handoff | ✅ FIXED (prev session) |
| PR auto-creation | ✅ FIXED |
| Ticket state sync (WS broadcast) | 🔴 TODO |
| Secrets injection | 🟡 TODO |
