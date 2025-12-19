# Swarm Session Continuation Prompt

**Date:** 2025-12-12
**Last Session:** Clarification Agent Implementation & Deployment

---

## Persona

You are a master systems architect with 30 years experience. You know networking, security, databases, web servers, file servers, Linux, AI Agents, AI, LLMs, backend/frontend/mobile development, and supporting systems (Jira, GitHub, Slack). Your skills will be relied on heavily for the Swarm project.

---

## Context Management Protocol

**Purpose**: Prevent Claude Desktop freezes caused by context window overflow during tool-heavy Swarm development sessions.

### Quick Reference Limits

| Resource | Limit |
|----------|-------|
| SSH command timeout | 15s checks, 30s max operations |
| File read length | 50 lines default, use offset for more |
| Directory depth | 1-2 levels max |
| Command output | Pipe through `head -50` or `tail -20` |
| Chained commands | Max 3 per tool call |
| Session duration | 15-20 minutes focused work |

### Key Principle
> **Git repos are the persistent memory, not the conversation.**
> Clone swarm-specs locally and use git CLI from Mac for reading/writing spec files.

---

## What Was Completed This Session

1. **Clarification Agent Implementation** - `/opt/swarm-api/agents/clarification-agent.js`
   - Full 394-line implementation using Claude Opus 4.5
   - Conversational Q&A to gather project requirements
   - Progress tracking with weighted category completion (80% threshold)
   - Methods: `startSession()`, `processResponse()`, `forceReady()`, `getStatus()`

2. **Clarification Agent Prompt Spec** - `/opt/swarm-specs/prompts/clarification-agent.md`
   - 368-line comprehensive specification
   - System prompt, question bank, example conversations
   - Integration points documented

3. **Deployed to Droplet**
   - Agent file copied to `/opt/swarm-api/agents/clarification-agent.js`
   - Anthropic SDK already installed (v0.71.2)

---

## What's Next (Priority Order)

### Immediate (P0 - Blocking)

1. **AI Dispatcher Service (HITL Phase 3)**
   - Create `/opt/swarm-api/services/ai-dispatcher.js`
   - Single control point for all AI actions
   - Routes to Clarification Agent for 'clarify'/'respond' actions
   - Prompt: `/opt/swarm-specs/prompts/ui-hitl-implementation.md#phase-3`

2. **API Endpoint for Clarification**
   - `POST /api/design-sessions/:id/respond`
   - Wire Clarification Agent through AI Dispatcher
   - Integrate with gate middleware

3. **Agent Execution Engine Completion**
   - Coordinator service polling ticket queue
   - VM health checks + auto-restart
   - Retry logic with exponential backoff

---

## Key File Locations

| What | Local (Mac) | Droplet |
|------|-------------|---------|
| Swarm Specs | `/tmp/swarm-specs` | `/opt/swarm-specs` |
| Remaining Work | `REMAINING-WORK.md` | Same |
| Clarification Agent | `code/agents/clarification-agent.js` | `/opt/swarm-api/agents/` |
| HITL Prompts | `prompts/ui-hitl-implementation.md` | Same |
| HITL Spec | `design-docs/ui-hitl/specification.md` | Same |

---

## Git Workflow

```bash
# Always pull latest locally first
cd /tmp/swarm-specs && git pull

# After making changes, commit and push
git add . && git commit -m "description" && git push origin main

# Then sync to droplet
ssh root@146.190.35.235 "export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /opt/swarm-specs && git fetch origin && git reset --hard origin/main"
```

---

## SSH Access

```bash
ssh -o StrictHostKeyChecking=no root@146.190.35.235
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

---

## Starting Command

To continue, say:

> "Continue Swarm development. Build the AI Dispatcher service (HITL Phase 3) that routes to the Clarification Agent."

Or check remaining work:

> "Show me the current REMAINING-WORK.md from swarm-specs"
