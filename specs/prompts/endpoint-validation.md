# Swarm API Endpoint Validation Prompt

## Objective
Validate all PROD API endpoints are functional and returning expected responses.

## Environment

| Item | Value |
|------|-------|
| PROD API | https://api.swarmstack.net |
| PROD Dashboard | https://dashboard.swarmstack.net |
| Droplet IP | 146.190.35.235 |
| Auth Token | (obtained via login endpoint) |

## Pre-Validation: Get Auth Token

```bash
# Get JWT token for authenticated requests
TOKEN=$(curl -s -X POST https://api.swarmstack.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' \
  | jq -r '.token')
echo "Token: ${TOKEN:0:50}..."
```

---

## Endpoint Validation Tests

### 1. Health Check
```bash
curl -s https://api.swarmstack.net/health | jq .
# Expected: {"status":"ok"} or similar
```

### 2. Auth Endpoints

#### 2a. Login
```bash
curl -s -X POST https://api.swarmstack.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq .
# Expected: {"token":"...", "user":{...}}
```

#### 2b. Get Current User
```bash
curl -s https://api.swarmstack.net/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"id":..., "email":"admin@swarmstack.net", ...}
```

### 3. Ticket Endpoints

#### 3a. List Tickets
```bash
curl -s https://api.swarmstack.net/api/tickets \
  -H "Authorization: Bearer $TOKEN" | jq '.tickets | length'
# Expected: Number of tickets
```

#### 3b. Get Single Ticket
```bash
curl -s https://api.swarmstack.net/api/tickets/1 \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: Ticket object with id, title, status, etc.
```

#### 3c. Create Ticket (optional - creates data)
```bash
curl -s -X POST https://api.swarmstack.net/api/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Validation Test Ticket","description":"Created by endpoint validation","priority":"low"}' | jq .
# Expected: New ticket object with id
```

#### 3d. Update Ticket Status
```bash
curl -s -X PATCH https://api.swarmstack.net/api/tickets/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' | jq .
# Expected: Updated ticket object
```

### 4. Agent Registry Endpoints

#### 4a. List Agents
```bash
curl -s https://api.swarmstack.net/api/agents \
  -H "Authorization: Bearer $TOKEN" | jq '.agents | length'
# Expected: Number of registered agents
```

#### 4b. Get Agent by ID
```bash
curl -s https://api.swarmstack.net/api/agents/1 \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: Agent object with id, name, status, etc.
```

### 5. VM Endpoints (if available)

#### 5a. List VMs
```bash
curl -s https://api.swarmstack.net/api/vms \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: List of VM objects or empty array
```

### 6. WebSocket Validation

#### 6a. Check WebSocket Upgrade Headers
```bash
curl -s -I https://api.swarmstack.net/socket.io/ \
  -H "Authorization: Bearer $TOKEN" 2>&1 | head -10
# Expected: HTTP response (WebSocket needs browser/wscat for full test)
```

#### 6b. WebSocket with wscat (if installed)
```bash
# Install: npm install -g wscat
wscat -c "wss://api.swarmstack.net/socket.io/?token=$TOKEN"
# Expected: Connection established, can send/receive events
```

---

## Automated Validation Script

Run this on the droplet or locally:

```bash
#!/bin/bash
API="https://api.swarmstack.net"

echo "=== Swarm API Endpoint Validation ==="
echo ""

# Get token
echo "[1/6] Auth: Login..."
TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' \
  | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Login failed"
  exit 1
else
  echo "✅ Login successful"
fi

# Health
echo "[2/6] Health check..."
HEALTH=$(curl -s $API/health | jq -r '.status // "unknown"')
[ "$HEALTH" == "ok" ] && echo "✅ Health: $HEALTH" || echo "⚠️  Health: $HEALTH"

# Auth me
echo "[3/6] Auth: Get current user..."
ME=$(curl -s $API/api/auth/me -H "Authorization: Bearer $TOKEN" | jq -r '.email // "failed"')
[ "$ME" == "admin@swarmstack.net" ] && echo "✅ User: $ME" || echo "❌ User: $ME"

# Tickets
echo "[4/6] Tickets: List..."
TICKETS=$(curl -s $API/api/tickets -H "Authorization: Bearer $TOKEN" | jq '.tickets | length // 0')
echo "✅ Tickets count: $TICKETS"

# Agents
echo "[5/6] Agents: List..."
AGENTS=$(curl -s $API/api/agents -H "Authorization: Bearer $TOKEN" | jq '.agents | length // 0')
echo "✅ Agents count: $AGENTS"

# Dashboard
echo "[6/6] Dashboard: Accessible..."
DASH=$(curl -s -o /dev/null -w "%{http_code}" https://dashboard.swarmstack.net)
[ "$DASH" == "200" ] && echo "✅ Dashboard: HTTP $DASH" || echo "❌ Dashboard: HTTP $DASH"

echo ""
echo "=== Validation Complete ==="
```

---

## Validation Checklist

| Endpoint | Method | Expected | Pass? |
|----------|--------|----------|-------|
| /health | GET | `{"status":"ok"}` | ☐ |
| /api/auth/login | POST | Returns JWT token | ☐ |
| /api/auth/me | GET | Returns user object | ☐ |
| /api/tickets | GET | Returns tickets array | ☐ |
| /api/tickets/:id | GET | Returns single ticket | ☐ |
| /api/tickets | POST | Creates new ticket | ☐ |
| /api/tickets/:id | PATCH | Updates ticket | ☐ |
| /api/agents | GET | Returns agents array | ☐ |
| /api/agents/:id | GET | Returns single agent | ☐ |
| WebSocket /socket.io | WS | Connects to room | ☐ |
| Dashboard / | GET | HTTP 200 | ☐ |

---

## Troubleshooting

### 401 Unauthorized
- Token expired - re-run login
- Wrong Authorization header format

### 404 Not Found
- Endpoint path incorrect
- Resource ID doesn't exist

### 500 Server Error
- Check PM2 logs: `pm2 logs swarm-platform --lines 50`

### Connection Refused
- Service not running: `pm2 list`
- Nginx not forwarding: `nginx -t && systemctl status nginx`
