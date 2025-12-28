# SENTINEL Agent - LLM Code Review System

## Overview

**SENTINEL** (Strict Engineering iNspector for Technical INtegrity and Efficiency in Logic) is an LLM-powered code review agent that serves as the third and final phase of the Swarm verification pipeline. It uses Claude API with a specialized persona to perform intelligent, context-aware code reviews on pull request diffs.

## Architecture Position

```
┌─────────────────────────────────────────────────────────────────┐
│                    SWARM VERIFICATION PIPELINE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   PHASE 1    │    │   PHASE 2    │    │   PHASE 3    │      │
│  │   STATIC     │ →  │  AUTOMATED   │ →  │  SENTINEL    │      │
│  │              │    │              │    │              │      │
│  │ • ESLint     │    │ • Unit Tests │    │ • LLM Review │      │
│  │ • Syntax     │    │ • File Check │    │ • Security   │      │
│  │ • TypeCheck  │    │ • HTTP Check │    │ • Quality    │      │
│  │ • Formatting │    │ • Pattern    │    │ • Best Pract │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
│  Fast, deterministic        Acceptance criteria     Intelligent │
│  syntax validation          verification            analysis    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Files

| File | Location | Purpose |
|------|----------|---------|
| `sentinel.js` | `/opt/swarm-verifier/lib/phases/sentinel.js` | Phase execution logic |
| `sentinel.md` | `/opt/swarm-verifier/personas/sentinel.md` | LLM persona definition |
| `server.js` | `/opt/swarm-verifier/server.js` | Verifier API server |

## How It Works

### 1. Trigger Conditions

SENTINEL runs when:
- Static phase passes (or is skipped)
- Automated phase passes (or is skipped)
- `ANTHROPIC_API_KEY` environment variable is configured
- Verification request includes `sentinel` in phases array

### 2. Execution Flow

```javascript
// Simplified flow
async function run(repoPath, ticketId, baseBranch, acceptanceCriteria) {
  // 1. Check API key availability
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 'skipped', message: 'API key not configured' };
  }
  
  // 2. Get git diff against base branch
  const diff = await getDiff(repoPath, baseBranch);
  
  // 3. Get list of changed files
  const changedFiles = await getChangedFiles(repoPath, baseBranch);
  
  // 4. Build review prompt with context
  const prompt = buildPrompt(diff, changedFiles, acceptanceCriteria);
  
  // 5. Call Claude API with SENTINEL persona
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: sentinelPersona,
    messages: [{ role: 'user', content: prompt }]
  });
  
  // 6. Parse JSON response and return result
  return parseReviewResponse(response);
}
```

### 3. Input Context

SENTINEL receives:
- **Git diff**: Changes between feature branch and base branch (max 50KB)
- **Changed files list**: Names of all modified files
- **Acceptance criteria**: From ticket specification (if available)


### 4. Output Format

```json
{
  "phase": "sentinel",
  "status": "passed|failed|skipped|error",
  "duration_ms": 3500,
  "decision": "APPROVE|REQUEST_CHANGES|REJECT",
  "score": 85,
  "summary": "Code implements feature correctly with minor style issues",
  "issues": {
    "critical": [],
    "major": [],
    "minor": [
      {
        "severity": "MINOR",
        "category": "code_quality",
        "file": "src/utils.js",
        "line": 42,
        "issue": "Magic number should be a named constant",
        "suggestion": "const MAX_RETRIES = 3;"
      }
    ],
    "nitpicks": []
  },
  "praise": [
    "Excellent error handling with proper cleanup in finally blocks",
    "Good use of TypeScript strict mode"
  ]
}
```

## Decision Matrix

| Decision | Score Range | Criteria | Pipeline Result |
|----------|-------------|----------|-----------------|
| **APPROVE** | 85-100 | Zero critical/major issues, code meets standards | `passed` |
| **REQUEST_CHANGES** | 60-84 | Has major issues OR multiple minor issues, but fixable | `failed` |
| **REJECT** | 0-59 | Critical security flaws OR fundamental design problems | `failed` |

## Severity Definitions

| Severity | Description | Examples |
|----------|-------------|----------|
| **CRITICAL** | Security vulnerability, data loss risk, crash potential | SQL injection, hardcoded secrets, null pointer |
| **MAJOR** | Significant bug, performance problem, missing error handling | N+1 queries, unhandled promises, broken logic |
| **MINOR** | Code smell, style violation, missing edge case | Magic numbers, long functions, missing validation |
| **NITPICK** | Formatting, naming preference, optional improvement | Variable naming, comment style |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for LLM calls |
| `REPOS_BASE_PATH` | Yes | Directory for cloned repos |
| `GIT_SSH_KEY_PATH` | Yes | SSH key for git operations |

### PM2 Configuration

```javascript
// /opt/swarm-verifier/pm2.config.js
module.exports = {
  apps: [{
    name: 'swarm-verifier',
    script: 'server.js',
    cwd: '/opt/swarm-verifier',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 8090,
      DB_PATH: '/opt/swarm-platform/data/swarm.db',
      REPOS_BASE_PATH: '/tmp/swarm-repos',
      GIT_SSH_KEY_PATH: '/root/.ssh/swarm_github',
      TICKET_API_URL: 'http://localhost:8080',
      ANTHROPIC_API_KEY: 'sk-ant-...'  // Required for SENTINEL
    }
  }]
};
```


## API Usage

### Verify Endpoint

```bash
POST http://localhost:8090/verify
Content-Type: application/json

{
  "ticket_id": "TICKET-123",
  "repo_url": "git@github.com:org/repo.git",
  "branch": "feature/new-feature",
  "base_branch": "main",
  "phases": ["static", "automated", "sentinel"],
  "acceptance_criteria": {
    "files_exist": ["src/feature.js"],
    "patterns": [{ "file": "src/feature.js", "contains": "export function" }]
  }
}
```

### Response

```json
{
  "ticket_id": "TICKET-123",
  "status": "passed",
  "duration_ms": 15000,
  "phases": {
    "static": { "status": "passed", "duration_ms": 2000 },
    "automated": { "status": "passed", "duration_ms": 5000 },
    "sentinel": {
      "status": "passed",
      "duration_ms": 8000,
      "decision": "APPROVE",
      "score": 92,
      "summary": "Clean implementation with good practices"
    }
  }
}
```

## Skipped Scenarios

SENTINEL automatically skips when:

1. **No API key**: `ANTHROPIC_API_KEY` not set
2. **Empty diff**: No changes to review
3. **Previous phase failed**: Static or automated phase failed
4. **Not requested**: `sentinel` not in phases array

## Error Handling

| Error Type | Behavior |
|------------|----------|
| API timeout | Returns `error` status with message |
| Rate limit | Returns `error` status, logged for retry |
| Parse failure | Returns `REQUEST_CHANGES` with score 50 |
| Git diff failure | Returns `skipped` status |

## Performance Characteristics

| Metric | Typical Value |
|--------|---------------|
| API call latency | 3-8 seconds |
| Diff size limit | 50KB (truncated) |
| Max tokens | 4096 response |
| Model | claude-sonnet-4-20250514 |

## Integration Points

### Upstream
- **Ticket API**: Provides ticket context and acceptance criteria
- **Git**: Clones repos and generates diffs

### Downstream
- **Dashboard**: Displays review results and issues
- **Agent**: Receives feedback for code corrections
- **PR Comments**: (Future) Posts review to GitHub PR

## Monitoring

Check SENTINEL health:

```bash
# Service status
pm2 status swarm-verifier

# Recent logs
pm2 logs swarm-verifier --lines 50

# API health
curl http://localhost:8090/health
```

## Related Documentation

- [SENTINEL Persona](../specs/personas/sentinel.md) - Full persona definition
- [Verifier API Spec](../specs/verifier-api-spec.md) - Complete API documentation
- [Verification Pipeline](../architecture/verification-pipeline.md) - Pipeline overview

