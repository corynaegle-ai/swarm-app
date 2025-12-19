# Swarm Data Model v2 (Multi-Tenant)

## Current: NO multi-tenancy. All data global.

## Schema Changes

### tenants (NEW)
- id, name, plan, bridge_name, subnet, limits

### users/projects: ADD tenant_id NOT NULL

### tickets: project_id, title, type, status, priority, attempts, requires_human

### ticket_dependencies: DAG edges (ticket_id, depends_on_id)

### agents: tenant_id, vm_id, ip_address, ticket_id, status, agent_type

### checkpoints: ticket_id, event_type, payload, sequence_num

### reviews: ticket_id, pass_number, status, comments

## ready_tickets View
Selects pending tickets with no incomplete blockers.

## Migration
1. Create tenants + default
2. Add tenant_id columns
3. Set NOT NULL + indexes

## Cascading: SQL queries need tenant filter, API middleware extracts from JWT
