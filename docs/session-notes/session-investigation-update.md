

## Investigation: Sentinel Feedback Loop (2024-12-24)

### Key Finding: CODE EXISTS BUT NOT INTEGRATED

The retry logic and learning system **already exist** but are **not connected** to the engine.

### Existing Components

| Component | Path | Status |
|-----------|------|--------|
| `agent-learning.js` | `/opt/swarm-app/apps/platform/lib/agent-learning.js` | EXISTS, NOT USED |
| `shouldRetryTicket()` | In agent-learning.js | Ready to use |
| `classifyError()` | In agent-learning.js | Ready to use |
| Retry Design Doc | `/opt/swarm-specs/designs/forge-agent-retry-logic.md` | DESIGN ONLY |

### Current Problem

- `failTicket()` goes directly to 'cancelled' - bypasses retry
- `setSentinelFailed()` is a dead end - no retry, no feedback injection
- `agent-learning.js` not imported in engine

### Required Changes

1. Add DB columns: `retry_count`, `retry_after`, `sentinel_feedback`, `hold_reason`
2. Import `agent-learning.js` in engine
3. Modify `setSentinelFailed()` to requeue with feedback (max 2 retries)
4. Modify forge agent to read/use `sentinel_feedback` in prompts
5. Add poll filter for `retry_after` timestamp

### Investigation Files

- Investigation prompt: `/opt/swarm-specs/investigations/sentinel-feedback-loop.md`
- Findings doc: `/opt/swarm-specs/investigations/sentinel-feedback-loop-findings.md`

### Next Session Priority

Implement the feedback loop integration per findings doc.
