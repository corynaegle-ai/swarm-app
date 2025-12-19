# Agent-Pull Architecture

HTTP-based pull model where agents request work instead of orchestrator pushing tasks via SSH.

**Status**: ✅ Complete  
**Source**: Notion (migrated 2025-12-10)

---

## Why This Architecture

### Problems with Push Model (Original)

| Issue | Severity | Description |
|-------|----------|-------------|
| Broken Background Jobs | CRITICAL | `$!` captures stale PID, `wait()` blocks everything |
| SSH Timeout Nesting | CRITICAL | 300s inner timeout inside 60s outer SSH = guaranteed hang |
| Silent API Key Failure | HIGH | `$ANTHROPIC_API_KEY` expands empty on droplet |
| Fire-and-Forget VMs | HIGH | Boot failures invisible, no health checks |
| Race Condition | HIGH | Result files read before written |
| State Machine Corruption | MEDIUM | Crash leaves tickets stuck in assigned state |
| Monolithic Architecture | CRITICAL | Single process, any failure blocks all |

### Pull Model Benefits

- No SSH from orchestrator → VMs (eliminates timeout nesting)
- Agents self-report status (no polling/blocking)
- Stateless orchestrator (crash-safe)
- Natural backpressure (agents take work when ready)
- Easy to scale (just boot more VMs)

## Architecture Diagram

```
CONTROL PLANE (Droplet)              VM AGENTS
┌─────────────────┐                  ┌─────────────┐
│  HTTP API       │◄────GET /claim──│  Agent 0    │
│  + SQLite       │                  │  (pulls)    │
│  (10.0.0.1:8080)│──────work───────►│             │
│                 │◄───POST /result──│             │
└─────────────────┘                  └─────────────┘
```

## Components

### Phase 1: HTTP Ticket API Server ✅ COMPLETE

**File**: `/opt/swarm-tickets/api-server.js` (11.7KB)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /health | GET | Health check |
| /claim | POST | Agent claims next available ticket |
| /heartbeat | POST | Agent reports progress |
| /complete | POST | Agent submits result |
| /tickets | GET | Dashboard query |
| /stats | GET | Active agent count |

**Systemd**: `swarm-api.service` (running on port 8080)

### Phase 2: Self-Managing Agent ✅ COMPLETE

**File**: `/usr/local/bin/swarm-agent-v2` (6.4KB)

| Feature | Description |
|---------|-------------|
| Pull-based claim | Polls API for work |
| Heartbeat loop | 30s interval background process |
| Idle timeout | 300s then self-terminate |
| Exponential backoff | 5s → 60s max when no work |
| Execute ticket | Clone, branch, claude-api, commit, push |

### Phase 3: VM Spawner ✅ COMPLETE

**File**: `/usr/local/bin/swarm-spawn` (4.9KB)

| Feature | Description |
|---------|-------------|
| Parallel boot | Spawns N VMs concurrently |
| Cold boot fallback | Works without snapshot |
| Project filter | `--project` flag for targeted spawning |

## Database Schema Changes

```sql
-- Added to tickets table
ALTER TABLE tickets ADD COLUMN lease_expires TEXT;
ALTER TABLE tickets ADD COLUMN last_heartbeat TEXT;

-- New heartbeats table
CREATE TABLE heartbeats (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);
```

## API Usage

**Agent claims work**:
```bash
curl -X POST http://10.0.0.1:8080/claim -H Content-Type: application/json -d '{agent_id:vm-001}'
```

**Agent sends heartbeat**:
```bash
curl -X POST http://10.0.0.1:8080/heartbeat -H Content-Type: application/json -d '{agent_id:vm-001,ticket_id:HT-001,progress:50}'
```

**Agent completes work**:
```bash
curl -X POST http://10.0.0.1:8080/complete -H Content-Type: application/json -d '{agent_id:vm-001,ticket_id:HT-001,status:done,pr_url:...}'
```

## Commands

```bash
# API management
swarm-api start|stop|status|health|stats|tickets

# Spawn VMs (agents auto-pull work)
swarm-spawn 5                    # Boot 5 VMs
swarm-spawn --cold 3             # Cold boot without snapshot
swarm-spawn --project habit-tracker 5

# Reset stale tickets
cd /opt/swarm-tickets
node src/cli.js transition HT-001 ready
node src/cli.js transition HT-002 ready
```

## Current State

**API Server**: Running on port 8080
```bash
curl http://10.0.0.1:8080/health
```

## Gaps to Address

| Component | Status | Notes |
|-----------|--------|-------|
| Production snapshot | ❌ Missing | Need at /var/lib/firecracker/snapshots/prod/ |
| Agent-v2 in rootfs | ❓ Unknown | Needs verification |
| Cold boot fallback | ✅ Implemented | Works in swarm-spawn |
