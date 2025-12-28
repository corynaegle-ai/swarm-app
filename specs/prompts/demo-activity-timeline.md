# Demo: Real-Time Activity Timeline

## Objective
Demonstrate the Activity Timeline feature by triggering a Forge agent to process a ticket and watching real-time activity appear in the dashboard.

## Prerequisites
- DEV Droplet: 134.199.235.140
- SSH Key: ~/.ssh/swarm_key
- Node Path: /root/.nvm/versions/node/v22.21.1/bin
- Dashboard: http://134.199.235.140:3000
- Platform API: http://134.199.235.140:8080

## Demo Steps

### Step 1: Create a Test Ticket
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
curl -s -X POST http://localhost:8080/api/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '\''{"email":"admin@swarmstack.net","password":"AdminTest123!"}'\'' | jq -r .token)" \
  -d '\''{"title":"Demo: Activity Timeline Test","description":"A simple test ticket to demo real-time activity logging","scope":"small","state":"ready"}'\'' | jq .'
```

### Step 2: Open Dashboard
Open browser to: `http://134.199.235.140:3000/tickets`
- Login: admin@swarmstack.net / AdminTest123!
- Find the new ticket and click to open TicketDetail page
- Watch the Activity Timeline panel on the right side

### Step 3: Trigger Forge Agent
Option A - Direct Engine Trigger:
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
curl -s -X POST http://localhost:8080/api/engine/trigger \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: agent-internal-key-dev" \
  -d '\''{"ticket_id":"<TICKET_ID>"}'\'''
```

Option B - Simulate Activity (for testing UI without full agent run):
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
TICKET_ID="<TICKET_ID>" && \
for event in "ticket_claimed:Starting work" "code_generation:Calling Claude API" "file_created:Created index.js" "git_operation:Committed changes" "pr_created:Opened PR #42"; do \
  cat=$(echo $event | cut -d: -f1); \
  msg=$(echo $event | cut -d: -f2); \
  curl -s -X POST "http://localhost:8080/api/tickets/$TICKET_ID/activity" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Key: agent-internal-key-dev" \
    -d "{\"category\":\"$cat\",\"message\":\"$msg\",\"metadata\":{\"demo\":true}}"; \
  sleep 2; \
done'
```

### Step 4: Verify in Dashboard
Watch the Activity Timeline for:
- ✅ New entries appear without page refresh (WebSocket)
- ✅ Color-coded by category (blue/cyan/green/purple/emerald)
- ✅ Lucide icons for each category
- ✅ Auto-scroll to newest entry
- ✅ "Live" connection indicator (green)
- ✅ Click entry to expand metadata

### Step 5: Verify via API
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '\''{"email":"admin@swarmstack.net","password":"AdminTest123!"}'\'' | jq -r .token) && \
curl -s "http://localhost:8080/api/tickets/<TICKET_ID>/activity" \
  -H "Authorization: Bearer $TOKEN" | jq ".activity | length"'
```

## Expected Activity Sequence
When Forge agent processes a ticket, you should see:
1. 🎫 **ticket_claimed** (blue) - Agent claims the ticket
2. 🖥️ **code_generation** (cyan) - Claude API called
3. 📁 **file_created** (green) - Files written
4. 🔀 **git_operation** (purple) - Branch/commit/push
5. 🔄 **pr_created** (emerald) - PR opened on GitHub

## Troubleshooting

### No Activity Appearing
1. Check WebSocket connection status in dashboard (should say "Live")
2. Check PM2 logs: `pm2 logs swarm-platform-dev --lines 20`
3. Verify ticket exists and has correct tenant_id

### WebSocket Disconnected
```bash
pm2 restart swarm-platform-dev
```

### Check Database Directly
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb \
  -c "SELECT * FROM ticket_events WHERE ticket_id='<TICKET_ID>' ORDER BY created_at DESC LIMIT 10;"
```

## Success Criteria
- [ ] Activity entries appear in real-time (< 1 second delay)
- [ ] Correct colors and icons for each category
- [ ] Metadata expands on click
- [ ] Connection status shows "Live"
- [ ] Auto-scrolls to new entries

---
*Prompt for: Activity Timeline Demo*
*Created: 2024-12-23*
