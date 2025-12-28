# Swarm Alerting Runbooks

**Document:** `/opt/swarm-specs/design-docs/observability/alerting/runbooks.md`  
**Created:** 2025-12-15

---

## Overview

This document provides operational procedures for responding to Swarm platform alerts.
Each runbook follows a consistent format:

| Section | Purpose |
|---------|---------|
| Severity | Impact level (Critical/Warning) |
| Impact | What is affected |
| Diagnosis | How to investigate |
| Resolution | Steps to fix |
| Escalation | When to involve others |

---

## Alert 1: SwarmHighErrorRate

**Severity:** Critical  
**Threshold:** API 5xx > 5% for 5m  
**Team:** Platform

### Impact
- Users experience failed requests
- Agent workflows may be disrupted
- Data consistency risks

### Diagnosis

```bash
# 1. Check recent errors
pm2 logs swarm-platform --lines 100 | grep -i error

# 2. Check database connectivity
curl -s http://localhost:3001/api/v1/health | jq

# 3. View error rate by endpoint
sqlite3 /opt/swarm-platform/data/metrics.db \
  "SELECT endpoint, COUNT(*) FROM requests 
   WHERE status >= 500 AND timestamp > datetime('now', '-10 minutes')
   GROUP BY endpoint ORDER BY 2 DESC"
```

### Resolution

1. **Database connection issues**: Restart platform service
   ```bash
   pm2 restart swarm-platform
   ```

2. **Memory exhaustion**: Check and clear if needed
   ```bash
   free -h
   pm2 monit
   ```

3. **Code bug**: Check recent deployments, rollback if needed

### Escalation
- If error rate persists > 15 minutes: Page on-call engineer
- If database corruption suspected: Contact database team

---

## Alert 2: SwarmClaudeAPIDown

**Severity:** Critical  
**Threshold:** No API calls for 5 minutes while VMs are active  
**Team:** Platform

### Impact
- All agent code generation halted
- No tickets can be processed
- Complete workflow stoppage

### Diagnosis

```bash
# 1. Check Claude API status
curl -s https://status.anthropic.com/api/v2/status.json | jq '.status'

# 2. Verify API key is set
grep ANTHROPIC_API_KEY /opt/swarm/.env | head -c 20

# 3. Test API connectivity
curl -s -H "x-api-key: $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'

# 4. Check agent logs
pm2 logs swarm-agent --lines 50 | grep -i "claude\|api\|error"
```

### Resolution

1. **API key issue**: Verify and update API key
2. **Network issue**: Check DNS, firewall rules
3. **Rate limiting**: Wait and reduce concurrent requests
4. **Anthropic outage**: Monitor status page, wait for resolution

### Escalation
- If API key compromised: Rotate immediately
- If outage > 30 minutes: Consider customer notification

---

## Alert 3: SwarmVMBootSlow

**Severity:** Warning  
**Threshold:** P95 boot time > 100ms for 5 minutes  
**Team:** Infrastructure

### Impact
- Ticket processing delays
- Reduced throughput
- Longer queue wait times

### Diagnosis

```bash
# 1. Check disk I/O
iostat -x 1 5

# 2. Check memory pressure
free -h && cat /proc/meminfo | grep -i swap

# 3. Verify snapshot integrity
ls -la /opt/swarm/snapshots/

# 4. Check recent boot times
sqlite3 /opt/swarm-registry/registry.db \
  "SELECT AVG(boot_time_ms), MAX(boot_time_ms) 
   FROM vm_boots WHERE timestamp > datetime('now', '-10 minutes')"
```

### Resolution

1. **Disk I/O saturation**: Reduce parallel boots, upgrade storage
2. **Memory pressure**: Reduce active VMs, add memory
3. **Corrupt snapshot**: Regenerate snapshot from clean state
4. **Host overload**: Scale horizontally

---

## Alert 4: SwarmNoActiveVMs

**Severity:** Critical  
**Threshold:** Active VMs = 0 for 5 minutes  
**Team:** Infrastructure

### Impact
- Complete system halt
- No tickets being processed
- All agent work stopped

### Diagnosis

```bash
# 1. Check Firecracker process
pgrep -a firecracker

# 2. Check VM manager service
pm2 status | grep -i vm

# 3. Verify disk space
df -h /opt/swarm

# 4. Check system resources
free -h && uptime
```

### Resolution

1. **Service crashed**: Restart VM manager
   ```bash
   pm2 restart swarm-vm-manager
   ```

2. **Disk full**: Clear old logs, snapshots
   ```bash
   rm -rf /opt/swarm/logs/*.log.old
   ```

3. **Kernel issue**: Check dmesg, may need host reboot

### Escalation
- If VMs cannot start after troubleshooting: Escalate to infrastructure lead
- Consider spinning up backup host

---

## Alert 5: SwarmAgentSuccessLow

**Severity:** Critical  
**Threshold:** Success rate < 90% for 15 minutes  
**Team:** Engineering

### Impact
- Poor code quality output
- High rework rate
- Customer dissatisfaction

### Diagnosis

```bash
# 1. Check verifier results
sqlite3 /opt/swarm-platform/data/swarm.db \
  "SELECT phase, result, COUNT(*) FROM verification_attempts 
   WHERE created_at > datetime('now', '-1 hour') 
   GROUP BY phase, result"

# 2. Review recent failed PRs
gh pr list --repo corynaegle-ai/swarm-agent \
  --state closed --label "verification-failed" --limit 10

# 3. Check for pattern in failures
pm2 logs swarm-sentinel --lines 100 | grep -i "failed\|error"
```

### Resolution

1. **Prompt drift**: Review and update agent prompts
2. **Context issues**: Check ticket quality, add clarification
3. **API instability**: Check Claude API response quality
4. **Verifier too strict**: Tune verification thresholds

---

## Alert 6: SwarmTicketQueueBacklog

**Severity:** Warning  
**Threshold:** Pending tickets > 100 for 15 minutes  
**Team:** Platform

### Impact
- Increased delivery times
- Potential SLA breaches
- Customer wait times increase

### Diagnosis

```bash
# 1. Check queue depth by state
sqlite3 /opt/swarm-platform/data/swarm.db \
  "SELECT state, COUNT(*) FROM tickets GROUP BY state"

# 2. Check for blocked tickets
sqlite3 /opt/swarm-platform/data/swarm.db \
  "SELECT id, title FROM tickets WHERE state = 'blocked' LIMIT 10"

# 3. Check active VM count
curl -s http://localhost:3001/api/v1/vms | jq '.data | length'
```

### Resolution

1. **Scale up VMs**: Increase parallel processing
   ```bash
   curl -X POST http://localhost:3001/api/v1/vms/scale -d '{"count": 20}'
   ```

2. **Unblock dependencies**: Review blocked tickets, resolve blockers
3. **Priority reordering**: Bump critical tickets to front

---

## Alert 7: SwarmTicketStuck

**Severity:** Warning  
**Threshold:** Ticket in progress > 1 hour  
**Team:** Engineering

### Impact
- Blocked dependencies
- Delayed downstream work
- Resource waste

### Diagnosis

```bash
# 1. Find stuck tickets
sqlite3 /opt/swarm-platform/data/swarm.db \
  "SELECT id, title, assigned_vm FROM tickets 
   WHERE state = 'in_progress' 
   AND updated_at < datetime('now', '-1 hour')"

# 2. Check assigned VM status
ssh root@10.0.0.<vm_ip> "ps aux | head -10"

# 3. Check agent logs on VM
ssh root@10.0.0.<vm_ip> "tail -50 /var/log/swarm-agent.log"
```

### Resolution

1. **VM frozen**: Terminate and reassign ticket
2. **Infinite loop**: Kill agent process, reassign
3. **Waiting on external**: Manual intervention required
4. **Ticket too complex**: Split into smaller tickets

---

## Alert 8: SwarmCostSpike

**Severity:** Warning  
**Threshold:** Hourly cost > $10/hour  
**Team:** Platform

### Impact
- Budget overrun
- Potential billing surprise
- Resource inefficiency

### Diagnosis

```bash
# 1. Check API call volume
sqlite3 /opt/swarm-registry/registry.db \
  "SELECT agent_id, COUNT(*), SUM(tokens) FROM api_calls 
   WHERE timestamp > datetime('now', '-1 hour') 
   GROUP BY agent_id ORDER BY 3 DESC LIMIT 10"

# 2. Look for runaway agents
pm2 logs swarm-agent --lines 100 | grep -i "retry\|loop"
```

### Resolution

1. **Runaway agent**: Kill the problematic VM
2. **Prompt inefficiency**: Optimize prompts for token usage
3. **Unnecessary retries**: Fix retry logic
4. **Scale down**: Reduce concurrent agents if not needed

---

## Escalation Matrix

| Severity | Response Time | First Responder | Escalation |
|----------|--------------|-----------------|------------|
| Critical | 5 minutes | On-call engineer | Platform lead |
| Warning | 30 minutes | Team owner | Senior engineer |

