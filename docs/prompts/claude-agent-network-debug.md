# Claude Agent Network Connectivity Debug

**Created**: 2025-12-11 ~01:30 UTC
**Status**: BLOCKED - VM cannot reach external APIs
**Priority**: HIGH - Blocks all AI-powered agent execution

---

## Problem Statement

Claude agent executes inside Firecracker VM but fails with Connection error when calling Anthropic API. The agent code runs, secrets are injected, but outbound HTTPS traffic from VM is blocked.

---

## What Has Been Verified ✅

### 1. Secrets Injection - WORKING


### 2. Claude Agent Template - WORKING


### 3. Agent Execution Flow - WORKING


### 4. Host IP Forwarding - ENABLED


### 5. Host NAT Rule - EXISTS


---

## What Needs Investigation ❓

### 1. Test VM Network Namespace Connectivity
/bin/sh: line 6: ip: command not found

### 2. Check Veth Pair Configuration


### 3. Verify VM Internal Network


### 4. Check Firewall Rules


### 5. DNS Resolution in VM


---

## Likely Root Causes (Ordered by Probability)

1. **FORWARD chain policy is DROP** - Host accepts packets but doesn't forward them
2. **Missing DNS in VM** - VM can't resolve api.anthropic.com
3. **Veth pair misconfigured** - Traffic not flowing between namespace and host
4. **VM default route missing** - VM doesn't know how to reach gateway
5. **Snapshot network config stale** - Restored VM has wrong network settings

---

## Quick Fix Attempts

### Fix 1: Allow FORWARD chain


### Fix 2: Add DNS to VM snapshot


### Fix 3: Test with simple curl from VM


---

## Test Ticket Details



---

## Success Criteria

1.  returns HTTP 200/401
2. Ticket 15 completes with status='done' and outputs containing haiku
3. No Connection error in agent output

---

## Related Files

| File | Purpose |
|------|---------|
| /opt/swarm/engine/lib/executor.js | Agent execution, secrets injection |
| /opt/swarm/bin/swarm-spawn-ns | VM namespace setup script |
| /opt/swarm-agents/_templates/claude-agent/main.js | Agent code |
| /root/.anthropic_key | API key file |
| /opt/swarm-registry/registry.db | Agent registry |
| /opt/swarm-tickets/tickets.db | Ticket queue |

---

## Commands to Resume


