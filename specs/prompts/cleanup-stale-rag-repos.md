# Prompt: Cleanup Stale RAG Repositories

## Context

The RAG service has indexed repositories that no longer exist on GitHub. These need to be removed to prevent confusion and wasted storage.

## Stale Repos to Remove

| Repo | ID | Reason |
|------|-----|--------|
| swarm-verifier | `235b2d05-0357-4c14-a8a4-859d525348ca` | Merged into swarm-app monorepo |
| swarm-specs | `20114995-3bf8-4058-a10e-2fc0268a3c6d` | Merged into swarm-app/docs |

## Valid Repos (Keep)

| Repo | ID | Chunks |
|------|-----|--------|
| swarm-app | `9387eefd-4d9b-45e6-aea9-fea46ee404ad` | 4,396 |
| swarm | `fc96524b-48af-40c4-85ed-b974fb72ddf4` | 335 |

## Execution Steps

### 1. Verify current state
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "curl -s http://localhost:8082/api/rag/repositories | jq '.repositories[] | {name, id, chunk_count}'"
```

### 2. Check if delete endpoint exists
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'delete\|DELETE' /opt/swarm-app/apps/services/rag/src/api.js"
```

### 3a. If DELETE endpoint exists
```bash
# Delete swarm-verifier
curl -X DELETE http://localhost:8082/api/rag/repositories/235b2d05-0357-4c14-a8a4-859d525348ca

# Delete swarm-specs
curl -X DELETE http://localhost:8082/api/rag/repositories/20114995-3bf8-4058-a10e-2fc0268a3c6d
```

### 3b. If DELETE endpoint doesn't exist - add it
Add to `/opt/swarm-app/apps/services/rag/src/api.js`:

```javascript
// Delete a repository and its chunks
app.delete('/api/rag/repositories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get repo first to confirm it exists
    const repo = await vectorStore.getRepository(id);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Delete chunks first, then repository
    await vectorStore.deleteRepositoryChunks(id);
    await vectorStore.deleteRepository(id);

    res.json({ 
      message: 'Repository deleted',
      id,
      name: repo.name
    });
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({ error: error.message });
  }
});
```

Add to `/opt/swarm-app/apps/services/rag/src/vector-store.js` if missing:

```javascript
async deleteRepositoryChunks(repoId) {
  await this.pool.query('DELETE FROM code_chunks WHERE repo_id = $1', [repoId]);
}

async deleteRepository(repoId) {
  await this.pool.query('DELETE FROM repositories WHERE id = $1', [repoId]);
}
```

### 4. Restart RAG service
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "pm2 restart swarm-rag"
```

### 5. Execute deletions
```bash
# On DEV droplet
curl -X DELETE http://localhost:8082/api/rag/repositories/235b2d05-0357-4c14-a8a4-859d525348ca
curl -X DELETE http://localhost:8082/api/rag/repositories/20114995-3bf8-4058-a10e-2fc0268a3c6d
```

### 6. Verify cleanup
```bash
curl -s http://localhost:8082/api/rag/repositories | jq '.repositories[] | {name, id}'
```

Expected result: Only `swarm-app` and `swarm` remain.

### 7. Re-index swarm-app (optional)
Since specs were merged into swarm-app, trigger a re-index:
```bash
curl -X POST http://localhost:8082/api/rag/repositories/9387eefd-4d9b-45e6-aea9-fea46ee404ad/index \
  -H "Content-Type: application/json" \
  -d '{"forceReindex": true}'
```

## Verification Checklist

- [ ] swarm-verifier removed from RAG
- [ ] swarm-specs removed from RAG
- [ ] swarm-app still indexed and searchable
- [ ] swarm still indexed and searchable
- [ ] Test search still works: `curl -X POST http://localhost:8082/api/rag/search -H "Content-Type: application/json" -d '{"query": "sentinel verification"}'`

---

*Created: 2025-12-28*
*Target: DEV droplet (134.199.235.140)*
