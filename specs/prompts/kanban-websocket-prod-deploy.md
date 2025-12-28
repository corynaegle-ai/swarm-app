# Kanban WebSocket - PROD Deployment Prompt

## Objective
Deploy the verified Kanban WebSocket changes from DEV to PROD droplet.

## Pre-Deployment Checklist
- [x] Code tested on DEV (134.199.235.140)
- [x] WebSocket connects and shows 🟢 indicator
- [x] Cross-tab sync verified (Tickets ↔ Kanban)
- [x] No polling code present
- [x] Changes committed to git (swarm-app commit 83edb14)

## PROD Environment
| Item | Value |
|------|-------|
| Droplet IP | 146.190.35.235 |
| Node Path | /root/.nvm/versions/node/v22.12.0/bin |
| Dashboard URL | https://dashboard.swarmstack.net |
| API URL | https://api.swarmstack.net |
| SSH Key | ~/.ssh/swarm_key |

## Deployment Steps

### Step 1: Pull Latest Code
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 'export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH && cd /opt/swarm-app && git pull origin main 2>&1 | tail -10'
```

### Step 2: Rebuild Dashboard
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 'export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH && cd /opt/swarm-app/apps/dashboard && npm run build 2>&1 | tail -15'
```

### Step 3: Verify Services
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 'export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH && pm2 list 2>&1 | grep -E "platform|dashboard"'
```

## Validation Tests

### Test 1: Page Loads
1. Open https://dashboard.swarmstack.net/kanban
2. Login with test credentials
3. **Expected**: Page loads, 🟢 indicator visible next to "Kanban Board"

### Test 2: WebSocket Connection
1. Open browser console (F12 → Console)
2. Look for `[WebSocket] Connected` message
3. **Expected**: WebSocket connects to tenant room

### Test 3: Real-time Updates
1. Keep Kanban page open with console visible
2. Drag a card to a new column
3. **Expected**: Console shows `[WS] Kanban ticket update`

### Test 4: Cross-Tab Sync
1. Open Tickets page in Tab 1: https://dashboard.swarmstack.net/tickets
2. Open Kanban page in Tab 2: https://dashboard.swarmstack.net/kanban
3. Change a ticket state in Tickets page
4. **Expected**: Kanban board updates automatically (no manual refresh)
5. Drag a card in Kanban
6. **Expected**: Tickets page updates automatically

### Test 5: No Polling (Network Tab)
1. Open Network tab in DevTools
2. Filter by "tickets" or "api"
3. Wait 30 seconds
4. **Expected**: No repeated API calls (only initial load + WebSocket frames)

## Validation Checklist

| Test | Expected | Pass? |
|------|----------|-------|
| 🟢 indicator visible | ✅ | ☐ |
| WebSocket connects | ✅ | ☐ |
| Console shows [WS] messages | ✅ | ☐ |
| Cross-tab sync works | ✅ | ☐ |
| No polling in Network tab | ✅ | ☐ |

## Rollback (if needed)
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 'cd /opt/swarm-app && git checkout HEAD~1 -- apps/dashboard/src/pages/KanbanBoard.jsx && cd apps/dashboard && npm run build'
```

## Success Criteria
- [ ] PROD Kanban page shows 🟢 live indicator
- [ ] Both Tickets and Kanban use WebSocket push
- [ ] No API polling occurring
- [ ] All open tabs sync via single broadcast

## Test Credentials
- admin@swarmstack.net / AdminTest123!
