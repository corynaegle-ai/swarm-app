# Design Agent Pipeline

3-phase hierarchical generation system for decomposing projects into tickets.

**Source**: Notion (migrated 2025-12-11)  
**Location**: `/opt/swarm-tickets/design-agent/`  
**Status**: ✅ Phase 1-3 Complete, Integration Testing Pending

---

## Problem: Context Window Saturation

Large project designs risk context overflow and quality degradation when generated in a single API call.

| Scenario | Input Tokens | Output Tokens | Risk |
|----------|--------------|---------------|------|
| Simple (5 tickets) | ~2K | ~3K | LOW |
| Medium (15 tickets) | ~5K | ~12K | MEDIUM |
| Large (30+ tickets) | ~10K | ~30K+ | HIGH |
| Existing codebase | ~50K+ | ~40K+ | CRITICAL |

## Solution: Hierarchical Chunked Generation

**Token Budget Comparison**:
```
Single-call approach: ~40K+ tokens for 30+ tickets (HIGH RISK)
Chunked approach:     ~13K total across 5-9 calls (LOW RISK)

Breakdown:
- Phase 1 Skeleton:     ~2K output tokens
- Phase 2 per epic:     ~2.5K × N epics
- Phase 3 Validation:   ~0 (local processing)
```

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────┐
│  PHASE 1: SKELETON (~2K tokens)                     │
│  Input:  Project description                        │
│  Output: IDs, dependencies, epics (no descriptions) │
│  API Calls: 1                                       │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 2: CHUNKED EXPANSION (~2.5K × N)             │
│  Input:  Skeleton JSON                              │
│  Output: Full descriptions, acceptance criteria     │
│  API Calls: 1 per epic (typically 3-5)              │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 3: VALIDATION (local)                        │
│  - Circular dependency detection                    │
│  - Orphan ticket detection                          │
│  - Scope balance analysis                           │
│  - Execution wave computation                       │
│  API Calls: 0                                       │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Files

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| design-agent.js | 310 | Master orchestrator | ✅ Complete |
| phase1-skeleton.js | 225 | Skeleton generator (~2K tokens) | ✅ Complete |
| phase2-expansion.js | 279 | Chunked expansion per epic | ✅ Complete |
| phase3-validation.js | 321 | Validation + execution plan | ✅ Complete |
| **Total** | **1,135** | Complete pipeline | ✅ |

---

## Phase 1: Skeleton Generator

**Purpose**: Generate ticket structure without descriptions (minimal tokens)

**Rules**:
- Ticket IDs: `{PREFIX}-{3-digit}` (e.g., HT-001)
- Epic IDs: E1, E2, E3... (max 5)
- Max 30 tickets, max 10 per epic
- Parallelism principle: minimize sequential chains
- Granularity: 1-4 hours per ticket

**Output Schema**:
```json
{
  "project": { "id": "HT", "name": "Habit Tracker" },
  "epics": [
    { "id": "E1", "name": "Core Infrastructure" }
  ],
  "tickets": [
    { "id": "HT-001", "title": "...", "epic": "E1", "dependencies": [] }
  ]
}
```

---

## Phase 2: Chunked Expansion

**Purpose**: Add full descriptions and acceptance criteria, one epic at a time

**Process**:
1. Take skeleton JSON as input
2. For each epic, make one API call
3. Expand tickets with descriptions, acceptance criteria, file hints
4. ~2.5K tokens per epic

---

## Phase 3: Validation

**Purpose**: Local validation (no API calls)

**Checks**:
- Circular dependency detection
- Orphan ticket detection (references non-existent tickets)
- Scope balance analysis (tickets per epic)
- Execution wave computation (parallelization analysis)

---

## Usage

```bash
# Full pipeline (live)
ANTHROPIC_API_KEY=sk-... node design-agent.js "Build a habit tracker CLI" --output ./tickets

# Dry-run test
ANTHROPIC_API_KEY=test node design-agent.js "Project description" --dry-run

# Individual phases
node phase1-skeleton.js "Project description"  # Skeleton only
node phase2-expansion.js skeleton.json         # Expand from skeleton
node phase3-validation.js expanded.json        # Validate expanded
```

---

## Remaining Steps

| Step | Task | Status |
|------|------|--------|
| 1 | Deploy to droplet | ✅ Done |
| 2 | Add design_sessions table | ✅ Done |
| 3 | Wire to ticket store (auto-insert) | ⏳ Next |
| 4 | Live API test | ⏳ Pending |
| 5 | Integration test (end-to-end) | ⏳ Pending |

---

*Migrated to git: December 11, 2025*
