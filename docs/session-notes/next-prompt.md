## Context
RAG Clarification Agent integration deployed and endpoints verified. Services running on dev droplet.

## Verified Working ✅
- PostgreSQL connection (password: swarm_dev_2024)
- RAG service on port 8082 with 1,061 chunks indexed
- HITL RAG endpoints:
  - GET /api/hitl/:id/rag-status
  - POST /api/hitl/:id/index-repos  
  - GET /api/hitl/:id/indexing-progress
- Clarification agent has RAG integration at lines 216, 392

## Immediate Tasks

1. **Test Clarification Agent with RAG Context**
   - Find/create a session in "clarifying" state
   - Send test message via POST /api/hitl/:id/message
   - Check PM2 logs for: "[ClarificationAgent] RAG returned X tokens"
   - Verify response references actual code patterns

2. **If RAG Working → Implement Injection Point #2**
   - Add RAG to ticket generator prompt
   - File: /opt/swarm-platform/prompts/ticket-generator.md
   - Inject {{CODE_CONTEXT}} with relevant patterns for ticket creation

3. **Dashboard Integration**
   - Verify RAG status shows in HITL UI
   - Test index-repos button functionality

## Quick Commands

Welcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-71-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/pro

 System information as of Thu Dec 18 15:29:59 UTC 2025

  System load:  0.01                Processes:             181
  Usage of /:   15.7% of 192.69GB   Users logged in:       0
  Memory usage: 11%                 IPv4 address for eth0: 134.199.235.140
  Swap usage:   0%                  IPv4 address for eth0: 10.48.0.6

Expanded Security Maintenance for Applications is not enabled.

0 updates can be applied immediately.

1 additional security update can be applied with ESM Apps.
Learn more about enabling ESM Apps service at https://ubuntu.com/esm


*** System restart required ***

## Service Status
- swarm-platform-dev: port 8080
- swarm-rag: port 8082
- swarm-dashboard-dev: running
- PostgreSQL: localhost:5432, db=swarmdb, user=swarm

## Files Reference
- Clarification agent: /opt/swarm-platform/agents/clarification-agent.js
- RAG client: /opt/swarm-platform/services/rag-client.js
- Clarify prompt: /opt/swarm-platform/prompts/build-feature-clarify.md
- HITL routes: /opt/swarm-platform/routes/hitl.js
