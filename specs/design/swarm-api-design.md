# Swarm API Design

Base: https://api.swarmstack.net/v1 | Auth: Bearer JWT (tenant_id in payload)

## Auth
POST /auth/login, /auth/register, /auth/refresh

## Tenants
GET /tenant (current), PATCH /tenant (settings), GET /tenant/usage

## Projects
GET/POST /projects, GET/PATCH/DELETE /projects/:id, GET /projects/:id/progress

## Interview
POST /projects/:id/interview (start), POST .../message, POST .../approve, POST .../complete

## Tickets
GET /projects/:id/tickets, GET .../ready (DAG-ready), GET .../escalated (human-needed)
PATCH /projects/:id/tickets/:ticketId

## Agents
GET /agents (list), GET /agents/:id, POST /agents/:id/terminate, GET /agents/pool

## Checkpoints
GET /tickets/:id/checkpoints, GET .../stream (SSE real-time)

## Reviews
GET /tickets/:id/reviews, POST .../resolve (human override)

## Internal Agent API (localhost:8080, no auth)
GET /internal/work, POST /internal/checkpoint, POST /internal/heartbeat, POST /internal/complete

## Webhooks
project.created, ticket.completed, ticket.escalated, build.succeeded, build.failed
