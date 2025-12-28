# Prompt: Validate Surgical Edit Implementation

## Context
Session: December 23, 2025
Surgical edit support deployed to DEV droplet in commit `53293e8`.

**Goal:** Verify FORGE agents now output search/replace patches instead of regenerating entire files.

---

## Pre-Flight Checks

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Verify surgical edit code is deployed
grep -c "action.*modify.*patches" /opt/swarm/agents/coder/index.js
# Expected: 2+ matches

# Verify fetchExistingFileContent exists
grep -c "fetchExistingFileContent" /opt/swarm/agents/coder/index.js
# Expected: 3+ matches

# Check engine is running
pm2 list | grep swarm-engine
```

---

## Step 1: Create Test Ticket with files_to_modify

```bash
# Create a simple modification ticket
sudo -u postgres psql -d swarmdb << 'EOF'
INSERT INTO tickets (
  id, title, description, state, tenant_id, project_id,
  acceptance_criteria, rag_context, created_at, updated_at
) VALUES (
  'TKT-SURGICAL-TEST',
  'Add console.log to healthcheck endpoint',
  'Add a simple console.log statement at the start of the healthcheck handler to verify surgical edits work correctly.',
  'ready',
  'tenant-swarm',
  'cf61a32b-b45f-448c-b9fa-4e566e1855af',
  '[{"id": "AC-001", "description": "Add console.log(\"Healthcheck called\") as first line in handler"}]',
  '{
    "repository": "https://github.com/corynaegle-ai/swarm-app",
    "files_to_modify": ["apps/platform/routes/health.js"],
    "files_to_create": []
  }',
  NOW(),
  NOW()
);
EOF

# Verify ticket created
sudo -u postgres psql -d swarmdb -c "
SELECT id, title, state, 
       rag_context->>'files_to_modify' as files_to_modify
FROM tickets 
WHERE id = 'TKT-SURGICAL-TEST';"
```

---

## Step 2: Monitor Agent Processing

```bash
# Restart engine to pick up ticket
pm2 restart swarm-engine

# Watch logs for surgical edit indicators
pm2 logs swarm-engine --lines 0 | grep -E "(TKT-SURGICAL|patches|modify|Fetched existing|Applied patches)"
```

### Expected Log Patterns (SUCCESS)

```
✅ "Fetched existing file for modification" { path: "apps/platform/routes/health.js" }
✅ "Applied patches to file" { path: "...", patchesApplied: 1 }
```

### Failure Indicators

```
❌ "Wrote file" { path: "apps/platform/routes/health.js", bytes: 5000+ }
   → Agent regenerated entire file instead of patching
   
❌ "Patch search text not found"
   → Claude's search string didn't match file content
   
❌ "No patches applied to file"
   → All patches failed to apply
```

---

## Step 3: Verify Branch Diff

```bash
# Wait for ticket to reach needs_review state
watch -n 5 'sudo -u postgres psql -d swarmdb -c "
SELECT state, branch_name FROM tickets WHERE id = '\''TKT-SURGICAL-TEST'\'';"'

# Once branch exists, check the diff
cd /opt/swarm-app
git fetch origin

# Get branch name from DB
BRANCH=$(sudo -u postgres psql -d swarmdb -t -c "
SELECT branch_name FROM tickets WHERE id = 'TKT-SURGICAL-TEST';" | tr -d ' ')

# Show diff stats
git diff --stat main...origin/$BRANCH

# Show actual changes
git diff main...origin/$BRANCH
```

### Success Criteria

| Check | Expected | Failure |
|-------|----------|---------|
| Lines changed | < 10 lines | 100+ lines changed |
| Deletions | 0-2 lines | Many deletions |
| File structure | Preserved | Completely rewritten |
| Console.log added | Yes, at correct location | Missing or wrong location |

### Example Good Diff
```diff
diff --git a/apps/platform/routes/health.js b/apps/platform/routes/health.js
index abc123..def456 100644
--- a/apps/platform/routes/health.js
+++ b/apps/platform/routes/health.js
@@ -5,6 +5,7 @@ const router = express.Router();
 
 router.get('/health', (req, res) => {
+  console.log("Healthcheck called");
   res.json({ status: 'ok', timestamp: new Date().toISOString() });
 });
```

### Example Bad Diff (FAILURE)
```diff
- 200 lines of original code deleted
+ 50 lines of regenerated code
```

---

## Step 4: Cleanup Test Ticket

```bash
# Delete test branch if created
git push origin --delete $BRANCH 2>/dev/null || true

# Reset or delete test ticket
sudo -u postgres psql -d swarmdb -c "
DELETE FROM tickets WHERE id = 'TKT-SURGICAL-TEST';"
```

---

## Troubleshooting

### If patches don't apply:

```bash
# Check what Claude actually returned
pm2 logs swarm-engine --lines 200 | grep -A 50 "TKT-SURGICAL"

# Verify file exists in repo
ls -la /opt/swarm-app/apps/platform/routes/health.js

# Check file content matches what's in prompt
head -30 /opt/swarm-app/apps/platform/routes/health.js
```

### If agent regenerates entire file:

1. Check `rag_context` has `files_to_modify` (not `files_to_create`)
2. Verify `buildPrompt()` is including file content in `<file>` tags
3. Check Claude's response has `"action": "modify"` with `patches` array

### Debug query:

```sql
SELECT id, 
       rag_context->>'files_to_modify' as modify,
       rag_context->>'files_to_create' as create
FROM tickets 
WHERE id = 'TKT-SURGICAL-TEST';
```

---

## Environment Reference

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| Node Path | /root/.nvm/versions/node/v22.21.1/bin |
| Database | `sudo -u postgres psql -d swarmdb` |
| Engine Logs | `pm2 logs swarm-engine` |
| Swarm Repo | `/opt/swarm-app` |

---

## Success Summary

After completing validation:

- [ ] Test ticket created with `files_to_modify`
- [ ] Agent logs show "Fetched existing file for modification"
- [ ] Agent logs show "Applied patches to file"
- [ ] Branch diff shows < 10 lines changed
- [ ] Original file structure preserved
- [ ] Only the console.log line added

If all checks pass, surgical edits are working correctly and ready for PROD deployment.
