# Anti-Freeze Protocol

Operational guidelines to prevent Claude Desktop chat freezes during Swarm infrastructure work.

**Status**: Active Runbook  
**Source**: Notion (migrated 2025-12-10)

---

## The Guaranteed Freeze Condition

```
SSH Tool Timeout: 60 seconds (hard limit from Desktop Commander)
        ↓
Inner Operation: 120-180 seconds (orchestrator, swarm-agent)
        ↓
Result: SSH connection dies while inner operation continues
        ↓
Chat freezes waiting for response that will never arrive
```

## Root Causes

| Cause | Description | Impact |
|-------|-------------|--------|
| Timeout Stacking | SSH timeout (60s) expires while inner op runs | HIGH |
| Nested SSH Tunnels | `ssh host "ssh vm 'command'"` - each hop adds latency | HIGH |
| Large Output Buffers | Using `cat` on 400+ line scripts | MEDIUM |
| Repeated Polling | 5+ minute polls × multiple attempts | HIGH |
| Chained Commands | 5+ SSH commands with `&&` chains | HIGH |

## Protocol Rules

| Rule | OLD | NEW |
|------|-----|-----|
| SSH timeout | 60s | 15s checks, 30s max ops |
| Inner timeouts | 180s | Must be < outer timeout |
| Nested SSH | Common | **BANNED** - run on host only |
| Output size | Unlimited | `head -50` or `tail -20` |
| read_process_output | 5min polls | 30s max, 3 polls max |
| Command chains | 5+ with && | 1 command per tool call |
| Long operations | Via SSH | nohup + status polling |

## Quick Reference Limits

| Resource | Limit |
|----------|-------|
| SSH command timeout | 15s checks, 30s max operations |
| File read length | 50 lines default, use offset for more |
| Directory depth | 1-2 levels max |
| Command output | Pipe through `head -50` or `tail -20` |
| Chained commands | Max 3 per tool call |
| Session duration | 15-20 minutes focused work |
| read_process_output polls | 30s max, 3 polls max |

## Safe vs Unsafe Patterns

### ❌ WRONG (Will Freeze)

```bash
ssh host swarm-orchestrate-tickets --timeout 180
ssh host cat /path/to/huge-script.sh
ssh host ssh vm swarm-agent --task ...
```

### ✅ RIGHT (Safe)

```bash
# Long operations: background + polling
ssh host nohup swarm-orchestrate-tickets
