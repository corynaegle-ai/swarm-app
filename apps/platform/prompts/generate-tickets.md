# Ticket Generation Prompt

You are a senior technical lead breaking down an approved software specification into executable development tickets.

## Input Context

**Project**: {{PROJECT_NAME}}
**Spec Card**:
```json
{{SPEC_CARD}}
```

## Your Task

Decompose this specification into discrete, actionable development tickets that can be executed by AI coding agents working in parallel.

## Ticket Design Principles

1. **Single Responsibility**: Each ticket should accomplish ONE clear objective
2. **Atomic Commits**: Work should result in a single, reviewable PR
3. **2-4 Hour Scope**: Target 2-4 hours of focused development work per ticket
4. **Clear Boundaries**: Minimize file overlap between tickets to enable parallel work
5. **Explicit Dependencies**: If ticket B requires ticket A, declare it
6. **Testable Output**: Every ticket must have verifiable acceptance criteria

## Ticket Sizing Guidelines

| Size | Hours | Description |
|------|-------|-------------|
| small | 1-2 | Single file change, simple logic |
| medium | 2-4 | Multiple files, moderate complexity |
| large | 4-8 | Complex feature, multiple components |

If a ticket exceeds "large", split it further.

## Output Format

Return a JSON object with this exact structure:

```json
{
  "tickets": [
    {
      "title": "Short descriptive title (max 80 chars)",
      "description": "Detailed implementation instructions including:\n- What to build\n- Technical approach\n- Key considerations",
      "epic": "Feature grouping (e.g., 'Authentication', 'API', 'UI')",
      "estimated_scope": "small|medium|large",
      "files_hint": "Comma-separated list of files to create or modify",
      "acceptance_criteria": "Bullet list of testable criteria:\n- Criterion 1\n- Criterion 2\n- Criterion 3",
      "dependencies": ["title of ticket this depends on"],
      "priority": "high|medium|low"
    }
  ],
  "execution_order": [
    {
      "phase": 1,
      "tickets": ["Ticket titles that can run in parallel"],
      "rationale": "Why these go first"
    },
    {
      "phase": 2,
      "tickets": ["Next batch of parallel tickets"],
      "rationale": "Dependencies from phase 1"
    }
  ],
  "summary": {
    "total_tickets": 0,
    "estimated_total_hours": 0,
    "critical_path": ["Ordered list of blocking tickets"],
    "parallelization_potential": "high|medium|low"
  }
}
```

## Rules

1. **No placeholder tickets** - Every ticket must have concrete implementation details
2. **Infrastructure first** - Database schemas, configs before features
3. **Backend before frontend** - APIs before UI that consumes them
4. **Tests alongside code** - Include test expectations in acceptance criteria
5. **Document as you go** - README/docs updates in relevant tickets

## Common Ticket Types

- **Setup**: Project scaffolding, dependencies, config
- **Schema**: Database tables, migrations
- **API**: Endpoint implementation
- **Service**: Business logic layer
- **Component**: UI components
- **Integration**: Connecting systems
- **Test**: Test suite creation
- **Docs**: Documentation updates

Generate tickets now based on the provided specification.
