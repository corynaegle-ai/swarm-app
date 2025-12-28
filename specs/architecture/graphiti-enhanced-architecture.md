# Graphiti Integration into Swarm Memory Layer

## Executive Summary

Graphiti would replace/augment Swarm's current SQLite + RAG memory system with a **temporal knowledge graph** that provides:
- **Cross-agent knowledge sharing** - Agents learn from each other's work
- **Temporal fact tracking** - Know when code patterns were valid/invalid
- **Multi-tenant isolation** - Per-workspace graph separation via `group_id`
- **Hybrid search** - Semantic + BM25 + graph traversal

## Current Swarm Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Swarm Memory                      │
├─────────────────────────────────────────────────────────────┤
│  SQLite Event Store         │  Vector RAG (if implemented)  │
│  - Ticket events            │  - Code embeddings            │
│  - Agent state              │  - Semantic search            │
│  - Session notes (git)      │                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
          Each agent starts fresh with minimal context
```

## Proposed Graphiti-Enhanced Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Graphiti-Enhanced Swarm Memory                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   FalkorDB       │    │   Graphiti Core   │    │   Swarm Memory   │  │
│  │   (Graph DB)     │◄───│   (Python SDK)    │◄───│   Service        │  │
│  │                  │    │                   │    │                   │  │
│  │  - Nodes/Edges   │    │  - add_episode()  │    │  - REST API      │  │
│  │  - Cypher        │    │  - search()       │    │  - Agent hooks   │  │
│  │  - BM25 Index    │    │  - Entity types   │    │  - Event ingest  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Episode Types for Swarm                      │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  CODE_CHANGE: File modifications, PR diffs                        │   │
│  │  TICKET_COMPLETION: Task context + acceptance criteria            │   │
│  │  ERROR_RESOLUTION: Bug fixes with stack traces + solutions        │   │
│  │  DESIGN_DECISION: Architecture choices + rationale                │   │
│  │  CODE_PATTERN: Reusable patterns discovered during development    │   │
│  │  DEPENDENCY_RELATION: Package/module relationships                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Infrastructure Addition

Add FalkorDB container to dev droplet:

```yaml
# /opt/swarm/docker-compose.graphiti.yml
version: '3.8'
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"   # Redis protocol
      - "3000:3000"   # FalkorDB browser UI
    volumes:
      - falkordb_data:/data
    restart: unless-stopped
    networks:
      - swarm-network

volumes:
  falkordb_data:

networks:
  swarm-network:
    external: true
```

### 2. Swarm Memory Service

New service at `/opt/swarm-memory/`:

```python
# /opt/swarm-memory/src/graphiti_service.py
import asyncio
from datetime import datetime, timezone
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.anthropic_client import AnthropicClient

class SwarmMemoryService:
    def __init__(self, workspace_id: str):
        """
        Each workspace gets isolated memory via group_id
        """
        self.workspace_id = workspace_id
        self.graphiti = Graphiti(
            uri="falkor://localhost:6379",
            llm_client=AnthropicClient(
                config=LLMConfig(
                    api_key=os.environ["ANTHROPIC_API_KEY"],
                    model="claude-sonnet-4-20250514"
                )
            )
        )
    
    async def initialize(self):
        """One-time setup per workspace"""
        await self.graphiti.build_indices_and_constraints()
    
    # ========== EPISODE INGESTION ==========
    
    async def record_ticket_completion(
        self,
        ticket_id: str,
        ticket_title: str,
        description: str,
        acceptance_criteria: list[str],
        files_changed: list[str],
        pr_url: str,
        agent_id: str
    ):
        """Record when an agent completes a ticket"""
        episode_body = f"""
        Ticket: {ticket_title} ({ticket_id})
        Description: {description}
        Acceptance Criteria: {', '.join(acceptance_criteria)}
        Files Changed: {', '.join(files_changed)}
        PR: {pr_url}
        Completed by Agent: {agent_id}
        """
        
        await self.graphiti.add_episode(
            name=f"ticket_completion_{ticket_id}",
            episode_body=episode_body,
            source=EpisodeType.text,
            source_description="swarm_ticket_system",
            group_id=self.workspace_id,
            reference_time=datetime.now(timezone.utc)
        )
    
    async def record_code_pattern(
        self,
        pattern_name: str,
        description: str,
        example_code: str,
        file_path: str,
        discovered_by: str
    ):
        """Record reusable code patterns agents discover"""
        episode_body = {
            "pattern_name": pattern_name,
            "description": description,
            "example_code": example_code,
            "file_path": file_path,
            "discovered_by": discovered_by,
            "discovered_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.graphiti.add_episode(
            name=f"code_pattern_{pattern_name}",
            episode_body=json.dumps(episode_body),
            source=EpisodeType.json,
            source_description="swarm_pattern_discovery",
            group_id=self.workspace_id,
            reference_time=datetime.now(timezone.utc)
        )
    
    async def record_error_resolution(
        self,
        error_type: str,
        error_message: str,
        stack_trace: str,
        resolution: str,
        file_path: str,
        agent_id: str
    ):
        """Record how agents fix errors for future reference"""
        episode_body = f"""
        Error Type: {error_type}
        Error Message: {error_message}
        Stack Trace: {stack_trace[:500]}...
        Resolution: {resolution}
        File: {file_path}
        Resolved by: {agent_id}
        """
        
        await self.graphiti.add_episode(
            name=f"error_resolution_{error_type}_{hash(error_message)[:8]}",
            episode_body=episode_body,
            source=EpisodeType.text,
            source_description="swarm_error_resolution",
            group_id=self.workspace_id,
            reference_time=datetime.now(timezone.utc)
        )
    
    # ========== SEARCH / RETRIEVAL ==========
    
    async def find_relevant_patterns(
        self,
        query: str,
        max_results: int = 5
    ) -> list[dict]:
        """Find code patterns relevant to current task"""
        results = await self.graphiti.search(
            query=query,
            group_ids=[self.workspace_id],
            num_results=max_results
        )
        return [
            {
                "fact": edge.fact,
                "source": edge.source_node_uuid,
                "target": edge.target_node_uuid,
                "valid_at": edge.valid_at,
                "episodes": edge.episodes
            }
            for edge in results
        ]
    
    async def find_similar_errors(
        self,
        error_message: str,
        max_results: int = 3
    ) -> list[dict]:
        """Find previously resolved similar errors"""
        results = await self.graphiti.search(
            query=f"error resolution: {error_message}",
            group_ids=[self.workspace_id],
            num_results=max_results
        )
        return results
    
    async def get_file_history(
        self,
        file_path: str
    ) -> list[dict]:
        """Get temporal history of changes to a file"""
        results = await self.graphiti.search(
            query=f"file changes {file_path}",
            group_ids=[self.workspace_id],
            num_results=20
        )
        # Sort by valid_at for temporal ordering
        return sorted(results, key=lambda x: x.valid_at)
```


### 3. Agent Integration Hooks

Modify the swarm-agent to call memory service:

```javascript
// /opt/swarm/agent/memory-hooks.js
const axios = require('axios');

const MEMORY_SERVICE = 'http://localhost:8083';

class AgentMemoryHooks {
    constructor(workspaceId, agentId) {
        this.workspaceId = workspaceId;
        this.agentId = agentId;
    }
    
    // Called BEFORE agent starts work on a ticket
    async getContextForTicket(ticketDescription, filesToModify) {
        const [patterns, errors, history] = await Promise.all([
            // Find relevant code patterns
            axios.post(`${MEMORY_SERVICE}/search/patterns`, {
                workspace_id: this.workspaceId,
                query: ticketDescription,
                max_results: 5
            }),
            // Find similar error resolutions
            axios.post(`${MEMORY_SERVICE}/search/errors`, {
                workspace_id: this.workspaceId,
                query: ticketDescription,
                max_results: 3
            }),
            // Get history for files we'll modify
            Promise.all(filesToModify.map(f =>
                axios.post(`${MEMORY_SERVICE}/files/history`, {
                    workspace_id: this.workspaceId,
                    file_path: f
                })
            ))
        ]);
        
        return {
            relevantPatterns: patterns.data,
            similarErrors: errors.data,
            fileHistories: history.map(h => h.data)
        };
    }
    
    // Called AFTER agent completes a ticket
    async recordTicketCompletion(ticket, filesChanged, prUrl) {
        await axios.post(`${MEMORY_SERVICE}/episodes/ticket`, {
            workspace_id: this.workspaceId,
            agent_id: this.agentId,
            ticket_id: ticket.id,
            ticket_title: ticket.title,
            description: ticket.description,
            acceptance_criteria: ticket.acceptance_criteria,
            files_changed: filesChanged,
            pr_url: prUrl
        });
    }
    
    // Called when agent discovers a useful pattern
    async recordPattern(patternName, description, exampleCode, filePath) {
        await axios.post(`${MEMORY_SERVICE}/episodes/pattern`, {
            workspace_id: this.workspaceId,
            discovered_by: this.agentId,
            pattern_name: patternName,
            description: description,
            example_code: exampleCode,
            file_path: filePath
        });
    }
    
    // Called when agent fixes an error
    async recordErrorFix(errorType, errorMessage, stackTrace, resolution, filePath) {
        await axios.post(`${MEMORY_SERVICE}/episodes/error`, {
            workspace_id: this.workspaceId,
            agent_id: this.agentId,
            error_type: errorType,
            error_message: errorMessage,
            stack_trace: stackTrace,
            resolution: resolution,
            file_path: filePath
        });
    }
}

module.exports = { AgentMemoryHooks };
```

### 4. Memory-Enhanced Agent Prompt

Inject retrieved context into agent system prompt:

```javascript
// Enhanced agent prompt with memory context
function buildAgentPrompt(ticket, memoryContext) {
    let prompt = `You are a Swarm coding agent working on ticket: ${ticket.title}

## Task Description
${ticket.description}

## Acceptance Criteria
${ticket.acceptance_criteria.map(c => `- ${c}`).join('\n')}
`;

    // Add memory context if available
    if (memoryContext.relevantPatterns?.length > 0) {
        prompt += `
## Relevant Code Patterns (from previous work)
${memoryContext.relevantPatterns.map(p => `
### ${p.pattern_name}
${p.description}
\`\`\`
${p.example_code}
\`\`\`
`).join('\n')}
`;
    }

    if (memoryContext.similarErrors?.length > 0) {
        prompt += `
## Previously Resolved Similar Errors
${memoryContext.similarErrors.map(e => `
- **Error**: ${e.error_type}
- **Resolution**: ${e.resolution}
`).join('\n')}
`;
    }

    if (memoryContext.fileHistories?.length > 0) {
        prompt += `
## Recent Changes to Target Files
${memoryContext.fileHistories.map(h => `
- ${h.file_path}: ${h.changes?.length || 0} recent modifications
`).join('\n')}
`;
    }

    return prompt;
}
```


## Custom Entity Types for Swarm

Define Swarm-specific entities using Pydantic:

```python
# /opt/swarm-memory/src/entity_types.py
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class CodeFile(BaseModel):
    """Represents a source code file in the repository"""
    path: str = Field(description="Full path to the file")
    language: str = Field(description="Programming language")
    module: Optional[str] = Field(description="Module/package name")
    last_modified: datetime = Field(description="Last modification time")

class CodePattern(BaseModel):
    """A reusable code pattern discovered by agents"""
    name: str = Field(description="Pattern name")
    description: str = Field(description="What the pattern does")
    category: str = Field(description="Pattern category: structural, behavioral, etc")
    example_code: str = Field(description="Example implementation")

class ErrorType(BaseModel):
    """A type of error encountered during development"""
    name: str = Field(description="Error type/class name")
    category: str = Field(description="Category: runtime, compile, logic, etc")
    common_causes: List[str] = Field(description="Known causes")

class Agent(BaseModel):
    """A Swarm coding agent"""
    agent_id: str = Field(description="Unique agent identifier")
    vm_id: int = Field(description="VM instance number")
    specialization: Optional[str] = Field(description="Agent specialization if any")

class Ticket(BaseModel):
    """A work ticket in the Swarm system"""
    ticket_id: str = Field(description="Unique ticket ID")
    title: str = Field(description="Ticket title")
    status: str = Field(description="Current status")
    assigned_agent: Optional[str] = Field(description="Assigned agent ID")

# Register custom entity types with Graphiti
SWARM_ENTITY_TYPES = [
    CodeFile,
    CodePattern,
    ErrorType,
    Agent,
    Ticket
]
```

## API Endpoints for Memory Service

```python
# /opt/swarm-memory/src/api.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Swarm Memory Service")

# ========== Models ==========

class TicketCompletionRequest(BaseModel):
    workspace_id: str
    agent_id: str
    ticket_id: str
    ticket_title: str
    description: str
    acceptance_criteria: List[str]
    files_changed: List[str]
    pr_url: str

class PatternRequest(BaseModel):
    workspace_id: str
    discovered_by: str
    pattern_name: str
    description: str
    example_code: str
    file_path: str

class SearchRequest(BaseModel):
    workspace_id: str
    query: str
    max_results: int = 5

# ========== Endpoints ==========

@app.post("/episodes/ticket")
async def record_ticket_completion(req: TicketCompletionRequest):
    service = SwarmMemoryService(req.workspace_id)
    await service.record_ticket_completion(
        ticket_id=req.ticket_id,
        ticket_title=req.ticket_title,
        description=req.description,
        acceptance_criteria=req.acceptance_criteria,
        files_changed=req.files_changed,
        pr_url=req.pr_url,
        agent_id=req.agent_id
    )
    return {"status": "recorded"}

@app.post("/episodes/pattern")
async def record_pattern(req: PatternRequest):
    service = SwarmMemoryService(req.workspace_id)
    await service.record_code_pattern(
        pattern_name=req.pattern_name,
        description=req.description,
        example_code=req.example_code,
        file_path=req.file_path,
        discovered_by=req.discovered_by
    )
    return {"status": "recorded"}

@app.post("/search/patterns")
async def search_patterns(req: SearchRequest):
    service = SwarmMemoryService(req.workspace_id)
    results = await service.find_relevant_patterns(
        query=req.query,
        max_results=req.max_results
    )
    return {"patterns": results}

@app.post("/search/errors")
async def search_errors(req: SearchRequest):
    service = SwarmMemoryService(req.workspace_id)
    results = await service.find_similar_errors(
        error_message=req.query,
        max_results=req.max_results
    )
    return {"errors": results}

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "swarm-memory"}
```


## Deployment Steps

```bash
# 1. Start FalkorDB on dev droplet
cd /opt/swarm
docker-compose -f docker-compose.graphiti.yml up -d

# 2. Create swarm-memory service directory
mkdir -p /opt/swarm-memory/src
cd /opt/swarm-memory

# 3. Set up Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install graphiti-core[falkordb] fastapi uvicorn

# 4. Start memory service
pm2 start "uvicorn src.api:app --host 0.0.0.0 --port 8083" --name swarm-memory

# 5. Initialize indices (one-time)
python3 -c "
import asyncio
from src.graphiti_service import SwarmMemoryService
async def init():
    svc = SwarmMemoryService('default')
    await svc.initialize()
asyncio.run(init())
"
```

## Benefits Over Current System

| Aspect | Current (SQLite + RAG) | Graphiti Enhanced |
|--------|------------------------|-------------------|
| **Cross-Agent Learning** | None - agents start fresh | Agents learn from each other's patterns and fixes |
| **Temporal Awareness** | Basic timestamps | Full bi-temporal model with valid/invalid states |
| **Search Quality** | Vector similarity only | Hybrid semantic + BM25 + graph traversal |
| **Entity Relationships** | None | Rich knowledge graph of code entities |
| **Contradiction Handling** | Manual | Automatic temporal edge invalidation |
| **Multi-tenant** | Basic workspace isolation | Native group_id isolation |

## Migration Path

1. **Phase 1**: Deploy FalkorDB alongside existing SQLite (no disruption)
2. **Phase 2**: Add memory hooks to agent workflow (record events)
3. **Phase 3**: Enable context injection to agent prompts
4. **Phase 4**: Backfill historical data from SQLite events
5. **Phase 5**: Deprecate RAG endpoint, use Graphiti exclusively

## Auto-Claude vs Swarm Comparison Context

This architecture was developed after analyzing [Auto-Claude](https://github.com/AndyMik90/Auto-Claude), which uses Graphiti + FalkorDB for cross-session memory. Key differences:

| Aspect | Auto-Claude | Swarm |
|--------|------------|-------|
| **Agent Runtime** | Claude Code CLI (desktop) | Firecracker microVMs (1000+ scale) |
| **Isolation Model** | Git Worktrees | Hardware-level VM namespaces |
| **Parallelism** | Up to 12 terminals | 1000+ VMs |
| **Memory** | FalkorDB + Graphiti | SQLite + RAG (upgrading to Graphiti) |

Swarm adopts Graphiti's temporal knowledge graph while maintaining its unique infrastructure advantages (VM isolation, massive parallelism, enterprise compliance).

## References

- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [FalkorDB Documentation](https://docs.falkordb.com/agentic-memory/graphiti.html)
- [Graphiti MCP Server](https://github.com/getzep/graphiti/tree/main/mcp_server)
- [Auto-Claude Project](https://github.com/AndyMik90/Auto-Claude)

---

*Document created: 2024-12-18*
*Status: Design Specification*
*Author: Neural + Claude*
