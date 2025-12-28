# Configure GitHub Webhooks for RAG Auto-Reindex

## Purpose

Configure GitHub webhooks so that pushes to swarm-specs and swarm-app automatically trigger RAG reindexing. This ensures documentation and code changes are immediately searchable.

## Prerequisites

- RAG webhook endpoint deployed: `https://api.dev.swarmstack.net/api/rag/webhook/github` ✅
- Webhook secret configured in `.env`: `GITHUB_WEBHOOK_SECRET` ✅

## Webhook Configuration

| Setting | Value |
|---------|-------|
| Payload URL | `https://api.dev.swarmstack.net/api/rag/webhook/github` |
| Content type | `application/json` |
| Secret | `swarm-rag-webhook-75f92c065fa7ac28331569e52db4826b` |
| SSL verification | Enable |
| Events | Just the push event |
| Active | ✅ |

## Repositories to Configure

### 1. swarm-specs
URL: https://github.com/corynaegle-ai/swarm-specs/settings/hooks

1. Click "Add webhook"
2. Enter Payload URL: `https://api.dev.swarmstack.net/api/rag/webhook/github`
3. Set Content type: `application/json`
4. Enter Secret: `swarm-rag-webhook-75f92c065fa7ac28331569e52db4826b`
5. Select "Just the push event"
6. Ensure "Active" is checked
7. Click "Add webhook"

### 2. swarm-app
URL: https://github.com/corynaegle-ai/swarm-app/settings/hooks

1. Click "Add webhook"
2. Enter Payload URL: `https://api.dev.swarmstack.net/api/rag/webhook/github`
3. Set Content type: `application/json`
4. Enter Secret: `swarm-rag-webhook-75f92c065fa7ac28331569e52db4826b`
5. Select "Just the push event"
6. Ensure "Active" is checked
7. Click "Add webhook"

## Verification Steps

After configuring each webhook:

### 1. Check GitHub delivery status
- Go to webhook settings → Recent Deliveries
- Should show green checkmark for test ping

### 2. Test with a real push
```bash
# Make a trivial change and push
cd /opt/swarm-specs
echo "" >> README.md
git add README.md
git commit -m "Test webhook trigger"
git push
```

### 3. Verify RAG received the webhook
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
pm2 logs swarm-rag --lines 20 --nostream
```

Expected log output:
```
[Webhook] Push to https://github.com/corynaegle-ai/swarm-specs branch main
[Webhook] Reindex complete for swarm-specs: { status: 'complete', ... }
```

### 4. Confirm reindex happened
```bash
curl -s http://localhost:8082/api/rag/repositories | jq '.repositories[] | select(.name=="swarm-specs") | {name, chunk_count, last_indexed: .updated_at}'
```

## Troubleshooting

### Webhook shows 401 Unauthorized
- Verify secret matches exactly (no trailing spaces)
- Check RAG service is running: `pm2 status swarm-rag`

### Webhook shows 404 Not Found
- Verify Caddy is proxying `/api/rag/*` to port 8082
- Check: `curl -X POST https://api.dev.swarmstack.net/api/rag/webhook/github -d '{}'`

### No reindex triggered
- Check branch matches: webhook only triggers for `main` branch
- Verify repo is registered: `curl http://localhost:8082/api/rag/repositories`

## Completion Checklist

- [ ] swarm-specs webhook configured
- [ ] swarm-specs webhook test ping successful
- [ ] swarm-app webhook configured
- [ ] swarm-app webhook test ping successful
- [ ] Real push triggers reindex (verified in logs)
- [ ] Search returns updated content after push
