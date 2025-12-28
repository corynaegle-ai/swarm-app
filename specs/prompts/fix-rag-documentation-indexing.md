# Fix RAG Documentation Indexing

## Problem Summary

The RAG system has two critical bugs preventing documentation from being searchable:

1. **Documentation files (.md) are never indexed** - Only code files are processed
2. **No GitHub webhook for auto-reindex** - Pushes don't trigger reindexing

## Bug 1: Documentation Files Not Indexed

### Location
`/opt/swarm-rag/src/indexer.js` line ~69

### Current (Broken)
```javascript
const codeFiles = await this.findFiles(localPath, config.chunking.codeExtensions);
console.log(`[Indexer] Found ${codeFiles.length} code files`);
```

### Problem
The config defines `docExtensions: ['.md', '.txt', '.rst']` but it's **never used**.
All markdown documentation in swarm-specs/prompts/* is invisible to RAG search.

### Fix Required
Update `indexer.js` to also find and process documentation files:

```javascript
// Find code files
const codeFiles = await this.findFiles(localPath, config.chunking.codeExtensions);
console.log(`[Indexer] Found ${codeFiles.length} code files`);

// Find documentation files
const docFiles = await this.findFiles(localPath, config.chunking.docExtensions);
console.log(`[Indexer] Found ${docFiles.length} documentation files`);

// Combine all files
const allFiles = [...codeFiles, ...docFiles];

await this.vectorStore.updateRepoProgress(repoId, {
  phase: 'chunking',
  files_total: allFiles.length,  // Changed from codeFiles.length
  files_processed: 0,
  percent: 15
});

// Chunk files with progress
const allChunks = [];

for (let i = 0; i < allFiles.length; i++) {  // Changed from codeFiles
  const file = allFiles[i];  // Changed from codeFiles[i]
  // ... rest of loop unchanged
```

---

## Bug 2: No GitHub Webhook Endpoint

### Location
`/opt/swarm-rag/src/api.js`

### Current State
- `.env` has `GITHUB_WEBHOOK_SECRET=swarm-rag-webhook-75f92c065fa7ac28331569e52db4826b`
- But **no webhook endpoint exists** in api.js

### Fix Required
Add webhook endpoint to `/opt/swarm-rag/src/api.js`:

```javascript
const crypto = require('crypto');

// GitHub Webhook - Auto-reindex on push
app.post('/api/rag/webhook/github', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    
    if (secret && signature) {
      const payload = JSON.stringify(req.body);
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(payload).digest('hex');
      
      if (signature !== digest) {
        console.warn('[Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Only process push events
    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      return res.json({ message: `Ignoring ${event} event` });
    }

    const { repository, ref } = req.body;
    const repoUrl = repository?.clone_url || repository?.html_url;
    const branch = ref?.replace('refs/heads/', '') || 'main';

    if (!repoUrl) {
      return res.status(400).json({ error: 'No repository URL in payload' });
    }

    console.log(`[Webhook] Push to ${repoUrl} branch ${branch}`);

    // Find matching repository
    const repo = await vectorStore.getRepositoryByUrl(repoUrl);
    
    if (!repo) {
      console.log(`[Webhook] Repository not registered: ${repoUrl}`);
      return res.json({ message: 'Repository not registered for indexing' });
    }

    // Only reindex if push is to the tracked branch
    if (branch !== repo.default_branch) {
      return res.json({ message: `Ignoring push to ${branch}, tracking ${repo.default_branch}` });
    }

    // Trigger reindex asynchronously
    res.json({ 
      message: 'Reindex triggered',
      repo_id: repo.id,
      repo_name: repo.name
    });

    // Run indexing in background
    indexer.indexRepository(repoUrl, { 
      branch: repo.default_branch,
      forceReindex: true 
    }).then(result => {
      console.log(`[Webhook] Reindex complete for ${repo.name}:`, result);
    }).catch(err => {
      console.error(`[Webhook] Reindex failed for ${repo.name}:`, err);
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## Bug 3: Chunker May Need Markdown-Specific Handling

### Location
`/opt/swarm-rag/src/chunker.js`

### Check Required
Verify the chunker handles `.md` files properly. The language detection at line 24 shows:
```javascript
'.md': 'markdown',
```

This looks correct, but verify the chunking logic works for markdown content (headers, code blocks, etc).

---

## Implementation Steps

### Step 1: Fix indexer.js
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Backup
cp /opt/swarm-rag/src/indexer.js /opt/swarm-rag/src/indexer.js.bak

# Edit indexer.js to include docExtensions
# See fix above - add docFiles search and combine with codeFiles
```

### Step 2: Add webhook to api.js
```bash
# Backup
cp /opt/swarm-rag/src/api.js /opt/swarm-rag/src/api.js.bak

# Add the webhook endpoint code above
# Make sure crypto is required at top of file
```

### Step 3: Restart RAG service
```bash
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
pm2 restart swarm-rag
pm2 logs swarm-rag --lines 20
```

### Step 4: Force reindex swarm-specs
```bash
# Get the repo ID
curl -s http://localhost:8082/api/rag/repositories | jq '.repositories[] | select(.name=="swarm-specs") | .id'

# Trigger reindex (repo ID: 20114995-3bf8-4058-a10e-2fc0268a3c6d)
curl -X POST http://localhost:8082/api/rag/repositories/20114995-3bf8-4058-a10e-2fc0268a3c6d/index \
  -H "Content-Type: application/json" \
  -d '{"forceReindex": true}'

# Monitor progress
watch -n 2 'curl -s http://localhost:8082/api/rag/repositories/20114995-3bf8-4058-a10e-2fc0268a3c6d | jq .repository.indexing_progress'
```

### Step 5: Configure GitHub Webhook
1. Go to https://github.com/corynaegle-ai/swarm-specs/settings/hooks
2. Add webhook:
   - Payload URL: `https://api.swarmstack.net/api/rag/webhook/github` (or dev URL)
   - Content type: `application/json`
   - Secret: `swarm-rag-webhook-75f92c065fa7ac28331569e52db4826b`
   - Events: Just the push event
3. Repeat for other repos: swarm-app, swarm, etc.

### Step 6: Verify Fix
```bash
# Search for backlog documentation
curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "backlog promote HITL session", "limit": 5}' | jq '.results[] | {filepath, similarity}'

# Should now return results from prompts/*.md files
```

---

## Expected Outcome

After fix:
- RAG search returns results from `.md` documentation files
- Queries like "backlog promote" return `prompts/build-backlog-ui.md`
- Git pushes automatically trigger reindexing within ~30 seconds
- Chunk count for swarm-specs increases significantly (was 449, should be 600+)

---

## Files Modified

| File | Change |
|------|--------|
| `/opt/swarm-rag/src/indexer.js` | Add docExtensions to file search |
| `/opt/swarm-rag/src/api.js` | Add GitHub webhook endpoint |

## Testing Checklist

- [ ] indexer.js processes both code and doc files
- [ ] Webhook endpoint responds to POST requests
- [ ] Webhook signature validation works
- [ ] Push events trigger reindex
- [ ] Non-push events are ignored
- [ ] swarm-specs reindexed with markdown files
- [ ] RAG search returns markdown content
- [ ] GitHub webhook configured for all repos
