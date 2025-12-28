# Deploy FORGE Coding Agent & Wire Execution Engine

## Context

Investigation confirmed the execution engine EXISTS but is not operational:

| Component | Location | Status |
|-----------|----------|--------|
| Engine Core | `/opt/swarm/engine/lib/engine.js` | ✅ Built |
| Step Executor | `/opt/swarm/engine/lib/executor.js` | ✅ Built |
| CLI | `/opt/swarm/engine/cli/swarm-engine.js` | ✅ Built |
| Pull Agent (FORGE) | `/opt/swarm-agents/forge-agent/main.js` | ✅ Deployed (v3) |
| Engine Running | PM2 | ❌ Not started |
| Coding Agent Registered | registry.db | ✅ Registered |

## Objective

Deploy the FORGE coding agent and make the execution engine operational so tickets can be automatically executed by VMs.

## Tasks

### 1. Deploy FORGE Agent ✅ COMPLETE (Dec 12, 2025)
- Agent directory exists: `/opt/swarm-agents/forge-agent/`
- Agent code deployed: `main.js` (FORGE Agent v3 - File-Mode Compatible)
- Package.json present

### 2. Register Agent in Registry ✅ COMPLETE (Dec 12, 2025)
- Agent ID: `forge-agent-001`
- Name: `forge`
- Version: `2.0.0`
- Path: `/opt/swarm-agents/forge-agent`
- Capabilities: `{"entry": "main.js", "tags": ["coding", "github", "pr-creation"]}`

### 3. Verify Schema Alignment ✅ COMPLETE (Dec 12, 2025)
Tickets table has all required columns:
- `assignee_id` ✅
- `assignee_type` ✅ (CHECK constraint: 'agent', 'human')
- `vm_id` ✅
- `agent_id` ✅
- `state` ✅ (includes 'ready', 'assigned', 'in_progress', etc.)

### 4. Create FORGE Persona ✅ COMPLETE (Dec 12, 2025)
- Persona file exists: `/opt/swarm-tickets/personas/forge.md` (6475 bytes)
- Also found: `sentinel.md` persona

### 4.5 Verify Prerequisites ✅ COMPLETE (Dec 13, 2025)
Pre-flight checks before starting engine:
- Engine CLI executable: `/opt/swarm/engine/cli/swarm-engine.js` ✅
- Engine lib exists: `/opt/swarm/engine/lib/engine.js` (18031 bytes) ✅
- Executor lib exists: `/opt/swarm/engine/lib/executor.js` (15504 bytes) ✅
- PM2 status: Only `swarm-platform` running, engine not started ✅
- Registry verified: `forge-agent-001|forge|2.0.0|/opt/swarm-agents/forge-agent` ✅

### 5. Start Engine ⏳ PENDING
```bash
# Test single ticket first
swarm-engine run-ticket <ticket-id> --wait

# If works, start daemon
swarm-engine start --max-vms=5 --foreground
```

### 6. End-to-End Test ⏳ PENDING
1. Create a test ticket with `state='ready'`, `assignee_type='agent'`
2. Run engine
3. Verify VM boots, agent executes, PR created

## Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/engine.js` | Main orchestration loop |
| `/opt/swarm/engine/lib/executor.js` | VM execution with security fixes |
| `/opt/swarm-agents/forge-agent/main.js` | FORGE coding agent (v3) |
| `/opt/swarm-registry/registry.db` | Agent registry, VM assignments |
| `/opt/swarm-tickets/data/swarm.db` | Tickets, projects |

## SSH Access
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
```

## Success Criteria
- [x] FORGE agent deployed to `/opt/swarm-agents/forge-agent/`
- [x] Agent registered in registry.db
- [x] FORGE persona file created
- [ ] `swarm-engine status` shows engine running
- [ ] Test ticket executed successfully
- [ ] PR created on GitHub (or mock test passes)
