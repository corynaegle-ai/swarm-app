# Claude Agent End-to-End Test

## Context

VM network connectivity has been fixed and verified. Claude SDK calls now work from inside Firecracker VMs. The next phase is validating the complete agent execution pipeline.

## What Has Been Verified ✅

| Component | Status | Evidence |
|-----------|--------|----------|
| swarm-spawn-ns fixes | ✅ | Commit 26717be |
| DNS in namespace | ✅ | /etc/netns/vmX/resolv.conf created |
| NAT rule (10.0.0.0/8) | ✅ | iptables verified |
| No veth bridge conflict | ✅ | Bridge attachment removed |
| External connectivity | ✅ | curl api.anthropic.com works |
| Claude SDK call | ✅ | "Hello there, how are you?" |

## What Needs Testing ❌

### 1. End-to-End Agent Execution

Test the full pipeline: ticket → executor → VM spawn → agent run → Claude API → result

```bash
# Create test ticket
curl -X POST http://localhost:3001/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Agent E2E Test", "description": "Write a haiku about distributed systems", "agent_id": "_template:claude-agent", "priority": 1}'

# Check executor logs
tail -f /opt/swarm/logs/executor.log

# Or manually trigger
cd /opt/swarm && node executor.js
```

**Success Criteria:**
- [ ] Ticket created with agent_id
- [ ] Executor picks up ticket
- [ ] VM spawns successfully
- [ ] Agent runs with ANTHROPIC_API_KEY injected
- [ ] Claude generates haiku
- [ ] Result stored in ticket output

### 2. VM Rootfs Corruption Investigation

Boot logs show EXT4 filesystem errors:

```
EXT4-fs error (device vda): ext4_lookup:1758: inode #13151: deleted inode referenced
EXT4-fs error (device vda): Corrupt filesystem
EXT4-fs error (device vda): Corrupt inode bitmap
```

**Investigation Steps:**
```bash
# Check current snapshot age
ls -la /opt/swarm/snapshots/production/

# Boot a VM and check dmesg
/opt/swarm/bin/swarm-spawn-ns 5
ip netns exec vm5 ssh root@10.0.0.2 'dmesg | grep -i ext4 | tail -20'

# If corruption confirmed, rebuild snapshot:
# 1. Create fresh rootfs
# 2. Install dependencies (node, npm, etc)
# 3. Take new snapshot
```

### 3. Parallel VM Network Test

Verify multiple VMs can connect simultaneously:

```bash
# Spawn 3 VMs
for i in 5 6 7; do
  /opt/swarm/bin/swarm-spawn-ns $i &
done
wait

# Test connectivity from each
for i in 5 6 7; do
  echo "=== VM$i ==="
  ip netns exec vm$i ssh -o ConnectTimeout=3 root@10.0.0.2 \
    'curl -s -o /dev/null -w "%{http_code}" https://api.anthropic.com' 2>/dev/null || echo "failed"
done

# Cleanup
for i in 5 6 7; do
  /opt/swarm/bin/swarm-cleanup-ns $i
done
```

**Success Criteria:**
- [ ] All 3 VMs spawn without conflict
- [ ] Each VM has unique namespace (vm5, vm6, vm7)
- [ ] Each VM can reach api.anthropic.com
- [ ] NAT handles multiple source IPs

## Files & Locations

| Item | Path |
|------|------|
| Executor | /opt/swarm/executor.js |
| Spawn script | /opt/swarm/bin/swarm-spawn-ns |
| Claude agent template | /opt/swarm-agents/_templates/claude-agent |
| API key | /root/.anthropic_key |
| Production snapshot | /opt/swarm/snapshots/production/ |
| Executor logs | /opt/swarm/logs/executor.log |

## Quick Commands

```bash
# Check executor status
systemctl status swarm-executor

# View recent tickets
sqlite3 /opt/swarm-tickets/tickets.db "SELECT id, title, status, agent_id FROM tickets ORDER BY id DESC LIMIT 5"

# Manual agent test in VM
/opt/swarm/bin/swarm-spawn-ns 5
API_KEY=$(cat /root/.anthropic_key)
ip netns exec vm5 scp -r /opt/swarm-agents/_templates/claude-agent root@10.0.0.2:/tmp/
ip netns exec vm5 ssh root@10.0.0.2 "cd /tmp/claude-agent && ANTHROPIC_API_KEY='$API_KEY' node main.js 'Write a haiku'"
/opt/swarm/bin/swarm-cleanup-ns 5
```

## Priority Order

1. **E2E Test** - Most important, validates full system
2. **Parallel VMs** - Quick test, important for scaling
3. **Rootfs Fix** - Can defer if not blocking execution
