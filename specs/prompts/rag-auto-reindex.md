# RAG Auto-Reindex Implementation

## Problem Statement

The RAG service requires manual API calls to reindex repositories after code changes. This leads to:
- Stale search results (code in RAG doesn't match deployed code)
- Manual intervention required after every deployment
- Risk of using outdated code patterns in AI-assisted development

**Current manual process:**
```bash
curl -X POST http://localhost:8082/api/rag/repositories/{repo_id}/index
```

## Goal

Implement automatic RAG reindexing when code is pushed to GitHub repositories.

## Architecture Context

**RAG Service Location:** `/opt/swarm-rag` on dev droplet (134.199.235.140)
**RAG API Port:** 8082
**Database:** PostgreSQL at `localhost:5432/swarmdb`

**Indexed Repositories:**
| Repo | GitHub URL | Repo ID |
|------|------------|---------|
| swarm-app | https://github.com/corynaegle-ai/swarm-app | 9387eefd-4d9b-45e6-aea9-fea46ee404ad |
| swarm-specs | https://github.com/corynaegle-ai/swarm-specs | 20114995-3bf8-4058-a10e-2fc0268a3c6d |
| swarm | https://github.com/corynaegle-ai/swarm | fc96524b-48af-40c4-85ed-b974fb72ddf4 |

**Existing RAG Endpoints:**
- `POST /api/rag/repositories/:id/index` - Trigger reindex by repo ID
- `POST /api/rag/index` - Register + index by URL
- `GET /api/rag/repositories` - List all repos with status

## Implementation Options

### Option A: GitHub Webhooks (Recommended)

**Pros:**
- Real-time updates on push
- No polling overhead
- Only reindexes when changes occur
- Industry standard approach

**Cons:**
- Requires public endpoint (or ngrok/tunnel for dev)
- Webhook secret management
- Need to handle webhook verification

**Implementation Steps:**

1. **Add webhook endpoint to RAG service** (`/opt/swarm-rag/src/api.js`):
```javascript
// POST /api/rag/webhook/github
app.post('/api/rag/webhook/github', async (req, res) => {
  // Verify GitHub signature
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Only process push events to main branch
  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    return res.json({ message: 'Ignored non-push event' });
  }
  
  const { ref, repository } = req.body;
  if (ref !== 'refs/heads/main') {
    return res.json({ message: 'Ignored non-main branch' });
  }
  
  // Find repo by URL and trigger reindex
  const repoUrl = repository.clone_url;
  const repo = await vectorStore.getRepositoryByUrl(repoUrl);
  
  if (repo) {
    // Trigger async reindex
    indexer.indexRepository(repoUrl, { forceReindex: true });
    console.log(`[Webhook] Triggered reindex for ${repository.name}`);
    res.json({ message: 'Reindex triggered', repo: repository.name });
  } else {
    res.status(404).json({ error: 'Repository not registered' });
  }
});
```

2. **Configure GitHub webhooks** for each repo:
   - URL: `https://api.dev.swarmstack.net/api/rag/webhook/github`
   - Content type: `application/json`
   - Secret: Generate and store in `.env`
   - Events: Just the `push` event

3. **Add environment variable:**
```bash
# /opt/swarm-rag/.env
GITHUB_WEBHOOK_SECRET=<generate-secure-secret>
```

4. **Expose endpoint via Caddy** (already proxying to platform, may need RAG route)

### Option B: Cron-Based Polling

**Pros:**
- Simple implementation
- No public endpoint needed
- Works behind firewalls

**Cons:**
- Delay between push and reindex (polling interval)
- Unnecessary API calls when no changes
- Wastes resources checking unchanged repos

**Implementation Steps:**

1. **Create cron script** (`/opt/swarm-rag/scripts/auto-reindex.sh`):
```bash
#!/bin/bash
# Check each repo for changes and reindex if needed

REPOS=(
  "9387eefd-4d9b-45e6-aea9-fea46ee404ad"
  "20114995-3bf8-4058-a10e-2fc0268a3c6d"
  "fc96524b-48af-40c4-85ed-b974fb72ddf4"
)

for repo_id in "${REPOS[@]}"; do
  curl -s -X POST "http://localhost:8082/api/rag/repositories/${repo_id}/index" \
    -H "Content-Type: application/json" \
    -d '{"forceReindex": false}'
done
```

2. **Add smart change detection** to indexer (check git remote HEAD vs last indexed commit)

3. **Configure cron** (`crontab -e`):
```cron
# Reindex every 15 minutes
*/15 * * * * /opt/swarm-rag/scripts/auto-reindex.sh >> /var/log/rag-reindex.log 2>&1
```

### Option C: Hybrid (Webhook + Fallback Cron)

Best of both worlds - webhook for immediate updates, cron as safety net.

## Recommended Implementation: Option A (GitHub Webhooks)

### Files to Modify

1. **`/opt/swarm-rag/src/api.js`** - Add webhook endpoint
2. **`/opt/swarm-rag/.env`** - Add webhook secret
3. **GitHub repo settings** - Configure webhooks for each repo

### RAG Query Before Implementation

```bash
curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "webhook github push event handler", "limit": 5}'
```

Check if similar patterns exist in swarm-app platform code.

## Success Criteria

1. [ ] Push to `main` branch triggers automatic reindex within 30 seconds
2. [ ] Webhook signature verification prevents unauthorized triggers
3. [ ] Failed reindex attempts are logged with error details
4. [ ] RAG status endpoint shows last reindex timestamp per repo
5. [ ] No manual intervention required for routine code updates

## Testing Plan

1. Make test commit to swarm-specs
2. Verify webhook received (check RAG logs)
3. Verify reindex triggered automatically
4. Search for content from new commit
5. Confirm chunk count updated

## Rollback Plan

If webhooks fail:
1. Disable webhook in GitHub settings
2. Fall back to manual reindex script
3. Investigate logs at `/root/.pm2/logs/swarm-rag-*.log`

## Environment Variables Required

```bash
# Add to /opt/swarm-rag/.env
GITHUB_WEBHOOK_SECRET=<generate-with-openssl-rand-hex-32>
```

## Security Considerations

- Webhook endpoint must verify GitHub signature (HMAC-SHA256)
- Rate limit webhook endpoint to prevent abuse
- Log all webhook events for audit trail
- Don't expose repo IDs in error messages
