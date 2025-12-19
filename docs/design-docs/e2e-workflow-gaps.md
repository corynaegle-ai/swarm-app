# E2E Workflow Gaps Analysis

**Date:** 2025-12-17
**Purpose:** Identify what's missing to run the new feature workflow end-to-end

---

## Current Status by Step

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1. Session Creation | HITL API | ✅ Working | POST /api/hitl |
| 2. Clarification | AI Dispatcher | ✅ Working | Claude integration active |
| 3. Spec Generation | AI Dispatcher | ✅ Working | executeGenerateSpec() |
| 4. Human Approval | HITL API | ✅ Working | POST /:id/approve |
| 5. Ticket Generation | ticket-generator.js | ✅ Working | executeGenerateTickets() |
| 6. Agent Execution | VM Orchestrator | ❌ **MISSING** | No trigger after tickets created |
| 7. Verification | Swarm Verifier | ✅ Running | Port 8090 |
| 8. Deployment | Deploy Agent | ✅ Running | Port 3457 |

---

## Critical Gap: Agent Execution Engine

### Problem

After `POST /api/hitl/:sessionId/start-build`:
1. ✅ State changes to 'building'
2. ✅ Project created
3. ✅ Tickets generated (state='ready')
4. ❌ **Nothing executes the tickets!**

The `/claim` endpoint exists, but nothing spawns VMs to claim work.

### Missing Components on DEV Droplet

| Component | Prod Location | Dev Status |
|-----------|---------------|------------|
| swarm-orchestrate-tickets | /usr/local/bin/ | ❌ Missing |
| swarm-spawn | /usr/local/bin/ | ❌ Missing |
| swarm-agent-v2 | /usr/local/bin/ | ❌ Missing |
| Firecracker VMM | /usr/bin/firecracker | ❌ Missing |
| VM snapshots | /var/lib/firecracker/ | ❌ Missing |
| VM kernel | /var/lib/firecracker/kernel/ | ❌ Missing |
| VM rootfs | /var/lib/firecracker/rootfs/ | ❌ Missing |

### Solution Options

**Option A: Port VM infrastructure to DEV** (2-3 days)
- Copy Firecracker binaries
- Copy/create VM snapshots
- Port swarm-* scripts
- Heavy infrastructure work

**Option B: Build lightweight Agent Execution Engine** (1 day)
- Node.js service that polls for 'ready' tickets
- Spawns worker processes (not VMs) 
- Each worker calls Claude API directly
- Simpler, testable, no Firecracker needed

**Option C: Manual Testing Without VMs** (immediate)
- Manually run agent workflow steps
- Use curl to claim/heartbeat/complete
- Validates workflow without full automation

---

## Other Gaps (Lower Priority)

### 1. Verifier Integration
- **Status:** Service running but not triggered
- **Gap:** No hook from ticket completion → verifier
- **Fix:** Add callback in `/complete` endpoint

### 2. Deploy Agent Trigger
- **Status:** Webhook receiver ready
- **Gap:** Not triggered after PR merge
- **Fix:** GitHub webhook already configured, needs real PR test

### 3. Dashboard Build UI
- **Status:** DesignSession.jsx exists
- **Gap:** May need BuildProgress component wiring
- **Fix:** Minor frontend work

---

## Recommended Path Forward

### Phase 1: Manual E2E Test (Today)
1. Create HITL session via dashboard
2. Go through clarification
3. Generate spec, approve
4. Start build (generates tickets)
5. Manually claim ticket via curl
6. Manually complete ticket
7. Verify deploy-agent gets notified

### Phase 2: Lightweight Execution Engine (Next)
Build simple Node.js orchestrator:
```
watch tickets (state='ready')
    → spawn worker process
    → worker claims ticket
    → worker calls Claude API
    → worker pushes code
    → worker completes ticket
```

### Phase 3: Full VM Infrastructure (Later)
Port Firecracker setup from PROD to DEV when needed for:
- True isolation
- Parallel execution at scale
- Production-like testing

---

## Summary

| Gap | Severity | Effort | Recommendation |
|-----|----------|--------|----------------|
| Agent Execution Engine | 🔴 Critical | 1 day | Build lightweight version |
| Verifier trigger | 🟡 Medium | 2 hours | Add callback hook |
| Dashboard wiring | 🟢 Low | 1 hour | Check existing components |

**Bottom Line:** The workflow is 90% complete. The missing piece is the trigger that spawns agents when tickets are created.
