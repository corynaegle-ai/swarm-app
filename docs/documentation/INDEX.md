# Swarm Documentation Index

**Master index of all technical specifications, design documents, and architecture docs.**

Last Updated: 2025-12-17

---

## Quick Navigation

| Category | Count | Description |
|----------|-------|-------------|
| [Specifications](#specifications) | 10 | Formal technical specifications and requirements |
| [Design Documents](#design-documents) | 17 | System designs, proposals, and patterns |
| [Architecture](#architecture) | 7 | High-level system architecture |
| [Components](#components) | 1 | Detailed component documentation |

---

## Specifications

Technical specifications defining system behavior, APIs, and components.

### Core Agent Specs

| Document | Description | Status |
|----------|-------------|--------|
| [Worker Agent Spec](specs/worker-agent-spec.md) | Code generation agent that implements tickets | ✅ Complete |
| [Review Agent Spec](specs/review-agent-spec.md) | Code review agent with quality gates | ✅ Complete |
| [FORGE Persona](specs/personas/forge.md) | Elite coding agent persona (20yr experience) | ✅ Complete |
| [SENTINEL Persona](specs/personas/sentinel.md) | Ruthless code reviewer persona (25yr experience) | ✅ Complete |

### API & Integration Specs

| Document | Description | Status |
|----------|-------------|--------|
| [Dev API Spec](specs/api/dev-api.md) | Swarm Dev API design and endpoints | ✅ Complete |
| [Auth Design Spec](specs/auth-design-spec.md) | Dashboard authentication design | ✅ Complete |
| [Code RAG Pipeline](specs/code-rag-pipeline-spec.md) | AST-based code retrieval system | ✅ Complete |

### Schema & UI Specs

| Document | Description | Status |
|----------|-------------|--------|
| [Database Schema](specs/schemas/database-schema.md) | SQLite schema reference | ✅ Complete |
| [UI HITL Specification](specs/ui-hitl-specification.md) | Human-in-the-loop control architecture | ✅ Complete |

---

## Design Documents

System designs, feature proposals, and architectural patterns.

### Core System Designs

| Document | Description | Status |
|----------|-------------|--------|
| [Platform Design Decisions](designs/platform-design-decisions.md) | Key design decisions and rationale | ✅ Complete |
| [Swarm API Design](designs/swarm-api-design.md) | REST API design patterns | ✅ Complete |
| [Swarm Data Model v2](designs/swarm-data-model-v2.md) | Multi-tenant data model | ✅ Complete |
| [Swarm Sequence Diagrams](designs/swarm-sequence-diagrams.md) | Visual workflow diagrams | ✅ Complete |

### Feature Designs

| Document | Description | Status |
|----------|-------------|--------|
| [Agent Learning System](designs/agent-learning-system.md) | Agent improvement through feedback | 📋 Draft |
| [MCP Factory Design](designs/mcp-factory-design.md) | MCP server generator system | ✅ Complete |
| [MCP Hosting Platform](designs/mcp-hosting-platform.md) | MCP server hosting infrastructure | 📋 Draft |
| [Observability Design](designs/observability-design.md) | Metrics, logging, and alerting | ✅ Complete |
| [CLI Design](designs/cli-design.md) | Command-line interface specification | 📋 Future |
| [Test Harness Design](designs/test-harness-design.md) | Testing infrastructure design | ✅ Complete |
| [Installer Design](designs/installer-design.md) | Enterprise deployment installer (Terraform+Ansible) | ✅ Complete |

### Collaboration & Workflow

| Document | Description | Status |
|----------|-------------|--------|
| [Ticket Collaboration Patterns](designs/ticket-collaboration-patterns.md) | Agent collaboration within execution pipeline | ✅ Complete |
| [Swarm Agent Prompts](designs/swarm-agent-prompts.md) | Prompt templates for agents | ✅ Complete |

### Analysis & Planning

| Document | Description | Status |
|----------|-------------|--------|
| [Architecture Review](designs/architecture-review-recommendations.md) | Critical gaps and strategic opportunities | ✅ Complete |
| [E2E Workflow Gaps](designs/e2e-workflow-gaps.md) | Gap analysis for end-to-end workflow | ✅ Complete |
| [Future Enhancements](designs/future-enhancements.md) | Non-blocking improvements | 📋 Ongoing |

### Templates & Utilities

| Document | Description | Status |
|----------|-------------|--------|
| [Design Template](designs/design-template.md) | Template for new design docs | 📋 Template |
| [Build Items - Test Harness](designs/BUILD-ITEMS-TEST-HARNESS.md) | Test harness implementation items | ✅ Complete |

---

## Architecture

High-level system architecture and infrastructure.

### System Overview

| Document | Description | Status |
|----------|-------------|--------|
| [Architecture Overview](architecture/overview.md) | High-level system diagram and components | ✅ Complete |
| [Agent-Pull Architecture](architecture/agent-pull.md) | HTTP-based work distribution model | ✅ Complete |
| [Ticketing System](architecture/ticketing-system.md) | DAG-based ticket orchestration | ✅ Complete |

### Component Architecture

| Document | Description | Status |
|----------|-------------|--------|
| [Design Agent Pipeline](architecture/design-agent-pipeline.md) | 3-phase hierarchical ticket generation | ✅ Complete |
| [Deploy Agent Architecture](architecture/deploy-agent-architecture.md) | Deployment automation system | ✅ Complete |
| [Control Plane Spec](architecture/control-plane-spec.md) | Remote dev environment specification | ✅ Complete |

### Infrastructure

| Document | Description | Status |
|----------|-------------|--------|
| [Dev/Prod Environment](architecture/dev-prod-environment.md) | Environment separation strategy | ✅ Complete |

---

## Components

Detailed documentation for individual system components.

### Agents & Services

| Document | Description | Status |
|----------|-------------|--------|
| [SENTINEL Agent](components/sentinel-agent.md) | LLM-powered code review system (verifier phase 3) | ✅ Complete |

---

## Document Status Legend

| Status | Meaning |
|--------|---------|
| ✅ Complete | Document is finalized and approved |
| 📋 Draft | Work in progress, subject to change |
| 📋 Future | Planned but not yet started |
| 📋 Template | Reusable template document |
| 📋 Ongoing | Living document, continuously updated |

---

## Related Resources

### Session Notes
- [Current Session Notes](../session-notes/current.md)
- [Session Notes Archive](../session-notes/archive/)

### Implementation
- [Prompts Directory](../prompts/) - Claude prompts for implementation
- [Code Directory](../code/) - Reference implementations
- [Runbooks](../runbooks/) - Operational procedures

### Business & Planning
- [Executive Documents](../executive/)
- [Business Documents](../business/)
- [Marketing](../marketing/)
- [Planning](../planning/)

---

## Contributing

When adding new documentation:

1. **Specs** → Use for formal requirements and API definitions
2. **Designs** → Use for feature proposals and system designs
3. **Architecture** → Use for high-level system components

Always use the [Design Template](designs/design-template.md) for new design documents.

---

*This index is auto-maintained. Update when adding new documents.*
