# Backlog System Integration Guide

## Overview

This guide shows how to integrate the backlog system into the existing Swarm platform **without breaking changes**.

---

## Step 1: Run Database Migration

```bash
# On the droplet
cd /opt/swarm
psql -U swarm -d swarm -f migrations/2024_12_23_001_create_backlog_items.sql
```

Or via the platform API if you have a migration runner.

---

## Step 2: Add Routes to Express App

In `apps/platform/index.js` (or wherever routes are mounted):

```javascript
// Existing routes
const hitlRoutes = require('./routes/hitl');
const ticketRoutes = require('./routes/tickets');
// ... other routes

// ADD: Backlog routes
const backlogRoutes = require('./routes/backlog');

// Mount routes
app.use('/api/hitl', hitlRoutes);
app.use('/api/tickets', ticketRoutes);
// ... other mounts

// ADD: Mount backlog routes
app.use('/api/backlog', backlogRoutes);
```

---

## Step 3: Add WebSocket Room Support

In `apps/platform/websocket.js`, add backlog room handling:

```javascript
// In the connection handler, add room join logic
socket.on('join', ({ room }) => {
  // Existing room handling...
  
  // ADD: Backlog room support
  if (room.startsWith('backlog:')) {
    const tenantId = room.split(':')[1];
    // Verify tenant access from JWT
    if (socket.user?.tenant_id === tenantId) {
      socket.join(room);
    }
  }
});
```

---

## Step 4: Verify Backwards Compatibility

### Test Existing HITL Flow Still Works

```bash
# Create session directly (existing flow)
curl -X POST http://localhost:3001/api/hitl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"project_name": "Test Project", "description": "Testing direct creation"}'

# Verify session created with source_type = 'direct'
```

### Test New Backlog Flow

```bash
# Create backlog item
curl -X POST http://localhost:3001/api/backlog \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title": "Mobile App Idea", "description": "Quick capture", "priority": 2}'

# Promote to HITL session
curl -X POST http://localhost:3001/api/backlog/{id}/promote \
  -H "Authorization: Bearer $TOKEN"

# Verify session created with source_type = 'backlog'
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backlog` | List items (filterable) |
| GET | `/api/backlog/:id` | Get single item |
| POST | `/api/backlog` | Create item |
| PATCH | `/api/backlog/:id` | Update item |
| DELETE | `/api/backlog/:id` | Archive item |
| POST | `/api/backlog/:id/start-chat` | Begin AI chat |
| POST | `/api/backlog/:id/chat` | Send chat message |
| POST | `/api/backlog/:id/end-chat` | End chat, save summary |
| POST | `/api/backlog/:id/promote` | Convert to HITL session |
| POST | `/api/backlog/reorder` | Bulk update ranks |
| POST | `/api/backlog/bulk-label` | Bulk add/remove labels |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXISTING FLOW (unchanged)                       │
│  ┌──────────────┐                                                       │
│  │ POST /hitl   │───▶ hitl_sessions (source_type = 'direct')           │
│  └──────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         NEW BACKLOG FLOW                                │
│  ┌────────────────┐    ┌─────────────────┐    ┌───────────────────────┐│
│  │ POST /backlog  │───▶│ backlog_items   │───▶│ POST /backlog/:id/    ││
│  │ (quick capture)│    │ (state: draft)  │    │ promote               ││
│  └────────────────┘    └────────┬────────┘    └───────────┬───────────┘│
│                                 │                         │             │
│                    ┌────────────▼────────────┐            │             │
│                    │ Optional: /start-chat   │            │             │
│                    │ /chat, /end-chat        │            │             │
│                    │ (state: chatting→refined)│           │             │
│                    └────────────┬────────────┘            │             │
│                                 │                         │             │
│                                 └─────────────────────────┘             │
│                                              │                          │
│                                              ▼                          │
│                    ┌─────────────────────────────────────────┐          │
│                    │ hitl_sessions (source_type = 'backlog') │          │
│                    │ (existing pipeline continues normally)  │          │
│                    └─────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Rollback Plan

If issues arise, the backlog system can be disabled without affecting existing functionality:

```javascript
// In index.js, simply comment out:
// app.use('/api/backlog', backlogRoutes);

// The hitl_sessions table continues to work
// source_type column defaults to 'direct'
// backlog_item_id can be NULL
```

---

## Files Created

| File | Purpose |
|------|---------|
| `migrations/2024_12_23_001_create_backlog_items.sql` | Database schema |
| `implementations/backlog-routes.js` | API routes |
| `designs/backlog-system.md` | Full design specification |

---

## Next Steps

1. ✅ Database migration
2. ✅ API routes  
3. ⬜ Copy `backlog-routes.js` to `apps/platform/routes/backlog.js`
4. ⬜ Mount routes in Express app
5. ⬜ Add WebSocket room support
6. ⬜ Create dashboard UI components
7. ⬜ End-to-end testing
