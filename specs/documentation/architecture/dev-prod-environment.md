# Dev/Prod Environment Architecture

**Source:** Notion (migrated 2025-12-11)
**Status:** Design Document

---

## Overview

Swarm uses separate Development and Production environments to enable safe iteration while maintaining production stability.

## Key Differences

| Aspect | Development | Production |
|--------|-------------|------------|
| VM Count | 5-10 | 50-1000 |
| Snapshot | dev-snapshot | prod-snapshot |
| API Port | 8081 | 8080 |
| Purpose | Testing | Customer workloads |
| Risk Tolerance | High | Low |

## Development Swarm

- Purpose: Testing, iteration, debugging
- VMs: 5-10 parallel
- Snapshot: dev-snapshot  
- API: Port 8081

## Production Swarm

- Purpose: Real workloads, customer-facing
- VMs: 50-1000 parallel
- Snapshot: prod-snapshot
- API: Port 8080

## Promotion Process

1. Test changes in Development Swarm
2. Validate with integration tests
3. Update production snapshot
4. Deploy to Production Swarm
5. Monitor for issues
