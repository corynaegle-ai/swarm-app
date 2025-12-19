# Auto-Claude vs Swarm: Spec Creation Pipeline Analysis

> **Date**: December 18, 2025  
> **Source**: Analysis of [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)  
> **Purpose**: Evaluate spec creation phases and recommend enhancements to Swarm's Design Agent Pipeline

---

## System Comparison

### Auto-Claude's 8-Phase Spec Creation

| Phase | Purpose | Token Cost |
|-------|---------|------------|
| 1. **Discovery** | Analyzes project structure and tech stack | Medium |
| 2. **Requirements** | Interactive conversation to gather requirements | High |
| 3. **Research** | Validates external integrations against real docs | High |
| 4. **Context Discovery** | Finds relevant codebase files | Medium |
| 5. **Spec Writer** | Creates comprehensive spec document | High |
| 6. **Spec Critic** | Extended thinking self-critique | Medium |
| 7. **Planner** | Breaks work into subtasks with dependencies | Medium |
| 8. **Validation** | Ensures outputs are valid | Low |

**Total API Calls**: 8 per spec (potentially more with retries)

### Swarm's 3-Phase Design Agent Pipeline

| Phase | Purpose | Token Cost |
|-------|---------|------------|
| 1. **Skeleton** | Structure with IDs + dependencies (~2K output) | **Low** |
| 2. **Expansion** | Add descriptions per-epic (N calls) | Medium × N epics |
| 3. **Validation** | DAG validation + wave computation | **Zero (local)** |

**Total API Calls**: 1 + N (where N = number of epics, max 5)

---

## Key Differences

| Aspect | Auto-Claude | Swarm |
|--------|-------------|-------|
| **Codebase Context** | Discovery + Context Discovery phases | None (greenfield assumed) |
| **Requirements Gathering** | Interactive conversation | Single description input |
| **External Research** | Web/doc validation phase | None |
| **Self-Critique** | Extended thinking spec critic | None |
| **Context Management** | Fresh window + Memory Layer | Hierarchical (skeleton → expansion) |
| **Validation** | AI-based validation phase | Deterministic DAG validation (local) |
| **Human-in-Loop** | Review gates between phases | None during spec generation |

---

## Recommended Changes for Swarm

### 1. Add Discovery Phase (HIGH PRIORITY)

Auto-Claude's Discovery + Context Discovery phases solve a critical problem: understanding existing code before generating tickets.

**Implementation for Swarm:**

```javascript
// NEW: phase0-discovery.js
const DISCOVERY_PROMPT = `Analyze this project and output JSON:
{
  "tech_stack": ["node", "react", ...],
  "patterns": ["REST API", "event-sourcing", ...],
  "relevant_files": [
    {"path": "src/api/tickets.js", "reason": "ticket management logic"}
  ],
  "constraints": ["Must use existing SQLite schema", ...]
}`;

async function discoverContext(repoPath, projectDescription) {
  // 1. List directory structure (local)
  const structure = await listDir(repoPath, { depth: 3 });
  
  // 2. Use RAG to find relevant code
  const ragResults = await queryRAG(projectDescription, 10);
  
  // 3. Single Claude call with structure + RAG context
  return await claude.call({
    system: DISCOVERY_PROMPT,
    user: `Project: ${projectDescription}\n\nStructure:\n${structure}\n\nRelevant code:\n${ragResults}`
  });
}
```

**Cost**: +1 API call, but dramatically improves ticket quality for existing codebases.

---

### 2. Add Spec Critic Phase (MEDIUM PRIORITY)

Auto-Claude's self-critique using extended thinking catches issues before implementation.

**Implementation for Swarm:**

```javascript
// NEW: phase2.5-critique.js
const CRITIC_PROMPT = `Review this ticket breakdown for issues:
1. Missing dependencies (A needs B but doesn't depend on it)
2. Scope creep (tickets too large for single session)
3. Ambiguous acceptance criteria
4. Integration gaps (no ticket connects frontend to backend)

Output JSON:
{
  "issues": [{"ticket_id": "HT-003", "type": "missing_dep", "suggestion": "..."}],
  "approved": boolean
}`;

async function critiqueExpansion(expanded) {
  // Use extended thinking for deeper analysis
  return await claude.call({
    system: CRITIC_PROMPT,
    user: JSON.stringify(expanded),
    thinking: { type: "enabled", budget_tokens: 5000 }
  });
}
```

**Cost**: +1 API call with extended thinking. Could be optional for speed.

---

### 3. Add Requirements Clarification Phase (LOW PRIORITY for Autonomous)

Auto-Claude does interactive requirements gathering. For Swarm's fully-autonomous model, consider a different approach:

**Swarm Alternative: Clarification Agent**

```javascript
// Instead of interactive, generate clarifying questions as a ticket
const CLARIFICATION_PROMPT = `Given this project description, identify ambiguities:
{
  "assumptions": [{"topic": "auth", "assumption": "JWT tokens", "confidence": "medium"}],
  "questions": ["Should user data persist across sessions?"],
  "proceed_anyway": boolean
}`;
```

If `proceed_anyway: false`, create a HITL ticket before other tickets.

---

### 4. Integrate RAG into Expansion Phase (HIGH PRIORITY)

Swarm already has RAG (port 8082) but doesn't use it during spec generation.

**Modified Phase 2:**

```javascript
// phase2-expansion.js - ENHANCED
async function expandEpic(skeleton, epicId, apiKey) {
  const epicTickets = skeleton.tickets.filter(t => t.epic === epicId);
  
  // NEW: Query RAG for each ticket's domain
  const ragContext = await Promise.all(
    epicTickets.map(t => queryRAG(t.title, 3))
  );
  
  // Include RAG context in expansion prompt
  return await claude.call({
    system: EXPANSION_PROMPT,
    user: `Epic: ${epicId}\nTickets: ${JSON.stringify(epicTickets)}\n\nExisting code patterns:\n${ragContext.flat().map(r => r.content).join('\n')}`
  });
}
```

**Cost**: No additional API calls, just local RAG queries.

---

### 5. Add Validation Gates (MEDIUM PRIORITY)

Auto-Claude uses AI-based validation. Swarm's local validation is faster but misses semantic issues.

**Hybrid Approach:**

```javascript
// phase3-validation.js - ENHANCED
function validate(expanded) {
  // Existing local validation
  const structural = {
    circular: detectCircular(expanded.tickets),
    orphans: detectOrphans(expanded.tickets),
    waves: computeWaves(expanded.tickets)
  };
  
  if (!structural.valid) return structural;
  
  // NEW: Semantic validation (optional, costs 1 API call)
  if (process.env.SEMANTIC_VALIDATION === 'true') {
    const semantic = await validateSemantic(expanded);
    return { ...structural, semantic };
  }
  
  return structural;
}
```

---

## Recommended Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SWARM ENHANCED PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 0: Discovery (NEW)           [1 API call]                │
│  ├─ List repo structure (local)                                 │
│  ├─ Query RAG for relevant code                                 │
│  └─ Identify tech stack + constraints                           │
│                                                                 │
│  Phase 1: Skeleton                  [1 API call]                │
│  ├─ Generate project/epic/ticket structure                      │
│  ├─ Include discovery context                                   │
│  └─ Output: ~2K tokens, no descriptions                         │
│                                                                 │
│  Phase 2: Expansion                 [N API calls, N = epics]    │
│  ├─ Per-epic expansion with RAG context                         │
│  └─ Add descriptions, acceptance criteria, file hints           │
│                                                                 │
│  Phase 2.5: Critique (NEW, optional) [1 API call]               │
│  ├─ Extended thinking self-review                               │
│  └─ Catch missing deps, scope issues                            │
│                                                                 │
│  Phase 3: Validation                [0 API calls - local]       │
│  ├─ DAG validation (circular, orphans)                          │
│  ├─ Wave computation                                            │
│  └─ Optional: semantic validation [+1 API call]                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Total: 2 + N + (optional 2) API calls vs current 1 + N
```

---

## Implementation Priority Matrix

| Change | Effort | Impact | Priority |
|--------|--------|--------|----------|
| RAG integration in Phase 2 | Low | High | **P0** |
| Phase 0 Discovery | Medium | High | **P1** |
| Phase 2.5 Critique | Medium | Medium | **P2** |
| Semantic Validation | Low | Medium | **P3** |
| Requirements Clarification | High | Low* | **P4** |

*Low for autonomous mode; High for HITL mode

---

## What Swarm Does Better

1. **Token Efficiency**: Skeleton-first approach is brilliant for context management
2. **Deterministic Validation**: Local DAG validation is fast and reliable  
3. **Parallelism Focus**: Explicit wave computation optimizes for Swarm's multi-VM architecture
4. **Structured Output**: JSON-only responses avoid parsing issues

---

## Summary Recommendation

**Adopt from Auto-Claude:**
1. Discovery phase with RAG integration (understand existing code)
2. Self-critique phase with extended thinking (catch issues early)

**Keep from Swarm:**
1. Skeleton → Expansion hierarchy (token efficient)
2. Local DAG validation (fast, deterministic)
3. Wave-based execution planning (optimized for parallel VMs)

The enhanced pipeline adds ~2 API calls but significantly improves spec quality for brownfield projects where Swarm needs to understand existing code patterns.

---

## Related Files

- `/opt/swarm-platform/design-agent/phase1-skeleton.js` - Current skeleton generator
- `/opt/swarm-platform/design-agent/phase2-expansion.js` - Current expansion logic
- `/opt/swarm-platform/design-agent/phase3-validation.js` - Current DAG validation
- RAG endpoint: `POST http://localhost:8082/api/rag/search`

## References

- [Auto-Claude Repository](https://github.com/AndyMik90/Auto-Claude)
- [GitHub Spec-Kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- [cc-sdd (Kiro-style SDD)](https://github.com/gotalab/cc-sdd)
- [Anthropic Claude Quickstarts - Autonomous Coding](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)
