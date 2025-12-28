# Forge Agent MCP Integration

## Persona: Alex Chen

You are Alex Chen, a master systems architect with 30 years of experience across networking, security, databases, distributed systems, and AI/ML infrastructure. You approach problems methodically, validate assumptions with tests, and write production-grade code. You follow the Context Management Protocol to prevent session freezes.

**Your working style:**
- Read existing code before writing new code
- Query RAG before implementing (POST http://localhost:8082/api/rag/search)
- Test incrementally, not all at once
- Commit progress frequently
- Update session notes in git

---

## Pre-Implementation: Query RAG

Before making any changes, query RAG to find relevant patterns:

```bash
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "forge agent processTicket function", "limit": 5}'

curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "mcp client tool invocation loop", "limit": 5}'
```

---

## Context

The **MCPClient module** is complete and tested at `/opt/swarm-agents/forge-agent/lib/mcp-client.js`. It provides:

| Method | Purpose |
|--------|---------|
| `ensureServer(serverId)` | Start/verify MCP server, cache instance |
| `listTools(serverId)` | Get available tools (cached) |
| `callTool(serverId, toolName, args)` | Invoke tool via MCP Fabric |
| `buildToolsPrompt(serverIds)` | Generate Claude prompt with tool descriptions |
| `handleMCPCall(response)` | Parse and execute `mcp_call` from Claude response |
| `stopAll()` | Cleanup all instances |

All 7 unit tests pass. MCP Fabric runs on port 8085 (accessible at `http://10.0.0.1:8085` from VMs).

### Current Forge Agent State

The forge agent already has:
- Sentinel feedback injection (`formatSentinelFeedback()`) 
- File mode for engine invocation
- Poll mode for standalone operation
- RAG context injection in prompts

MCP integration must **coexist** with these features.

---

## Objective

Integrate MCPClient into `/opt/swarm-agents/forge-agent/main.js` so the forge agent can:

1. Read `mcp_servers` from ticket config or projectSettings
2. Build MCP tools prompt section for Claude
3. Execute MCP tool calls in a loop until Claude produces final code
4. Feed MCP results back to Claude for next iteration
5. Cleanup MCP instances on agent exit

### Target Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  processTicket(ticket, projectSettings)                         │
│                                                                 │
│  1. Initialize MCPClient (if mcp_servers configured)            │
│  2. Build prompt + RAG context + sentinel feedback + MCP tools  │
│  3. Call Claude                                                 │
│     ┌──────────────────────────────────────────────────────┐    │
│     │  LOOP (max 5 iterations):                            │    │
│     │    - Check for mcp_call in response                  │    │
│     │    - If found: execute tool, append result, re-call  │    │
│     │    - If not found: break (have final code)           │    │
│     └──────────────────────────────────────────────────────┘    │
│  4. Parse final JSON response                                   │
│  5. Write files, commit, push, PR                               │
│  6. Cleanup MCPClient                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Step 1: Add MCPClient Import

At top of main.js, after other requires:

```javascript
const { MCPClient } = require('./lib/mcp-client.js');
```

### Step 2: Add MCP Configuration

Add to CONFIG object:

```javascript
const CONFIG = {
  // ... existing config ...
  mcpFabricUrl: process.env.MCP_FABRIC_URL || 'http://10.0.0.1:8085',
  mcpMaxIterations: parseInt(process.env.MCP_MAX_ITERATIONS || '5', 10),
  mcpTimeout: parseInt(process.env.MCP_TIMEOUT || '30000', 10),
  mcpServerStartTimeout: parseInt(process.env.MCP_SERVER_START_TIMEOUT || '60000', 10)
};
```

### Step 3: Add MCP Tools Prompt Builder

Add a helper function to build the MCP section of the Claude prompt:

```javascript
/**
 * Build MCP tools prompt section for Claude
 * Instructs Claude how to call MCP tools and format responses
 */
function buildMCPInstructions(toolsPrompt) {
  if (!toolsPrompt) return '';
  
  return `
## External Tools Available

You have access to external MCP tools. To call a tool, output a JSON block:

\`\`\`json
{"mcp_call": {"server": "server-id", "tool": "tool-name", "args": {"param": "value"}}}
\`\`\`

After each tool call, I'll provide the result. You may call multiple tools (max 5 total).
When you have all the information needed, output your final implementation JSON.

${toolsPrompt}

**Important:**
- Only output ONE mcp_call per response
- Wait for the result before making another call
- Tool results may contain errors - handle gracefully
- When ready to implement, output the files JSON (not an mcp_call)
`;
}
```

### Step 4: Modify processTicket Function

Locate the existing `processTicket` function and add MCP integration. Key changes:

1. Extract `mcp_servers` from ticket or projectSettings
2. Initialize MCPClient if servers are configured
3. Build tools prompt with `buildMCPInstructions()`
4. Add MCP tool loop after initial Claude call
5. Cleanup in finally block

```javascript
async function processTicket(ticket, projectSettings = {}) {
  const model = projectSettings?.worker_model || MODEL_BY_SCOPE[ticket.estimated_scope] || CONFIG.claudeModel;
  const branchName = `forge/${ticket.id}-${Date.now()}`;
  let repoDir = null;
  let mcpClient = null;
  
  // Get MCP servers from ticket or project settings
  const mcpServers = ticket.mcp_servers || projectSettings.mcp_servers || [];
  
  try {
    log.info('Processing ticket', { 
      id: ticket.id, 
      title: ticket.title, 
      model, 
      mcpServers: mcpServers.length > 0 ? mcpServers : 'none',
      hasRetryFeedback: !!ticket.sentinel_feedback
    });
    
    // Initialize MCP client if servers configured
    if (mcpServers.length > 0) {
      mcpClient = new MCPClient(CONFIG.agentId, {
        fabricUrl: CONFIG.mcpFabricUrl,
        timeout: CONFIG.mcpTimeout
      });
      log.info('MCPClient initialized', { fabricUrl: CONFIG.mcpFabricUrl });
    }
    
    // Clone repo
    repoDir = path.join(CONFIG.workDir, `repo-${ticket.id}-${Date.now()}`);
    cloneRepo(ticket.repo_url, repoDir);
    createBranch(repoDir, branchName);
    
    // Build MCP tools prompt section
    let mcpToolsPrompt = '';
    if (mcpClient && mcpServers.length > 0) {
      try {
        const rawToolsPrompt = await mcpClient.buildToolsPrompt(mcpServers);
        mcpToolsPrompt = buildMCPInstructions(rawToolsPrompt);
        log.info('MCP tools loaded', { servers: mcpServers.length });
      } catch (err) {
        log.error('MCP tools loading failed', { error: err.message });
        // Continue without MCP - don't fail the whole ticket
        mcpClient = null;
        mcpToolsPrompt = '';
      }
    }
    
    // Get sentinel feedback if this is a retry
    const sentinelFeedback = formatSentinelFeedback(ticket);
    
    // Get RAG context (existing function)
    const ragContext = await getRAGContext(ticket);
    
    // Build base prompt with all context
    const basePrompt = buildImplementationPrompt(ticket, {
      mcpToolsPrompt,
      sentinelFeedback,
      ragContext
    });
    
    // Call Claude with MCP tool loop
    const messages = [{ role: 'user', content: basePrompt }];
    let response = await callClaude(messages, model);
    let iterations = 0;
    
    // MCP tool call loop
    while (mcpClient && iterations < CONFIG.mcpMaxIterations) {
      const mcpResult = await mcpClient.handleMCPCall(response);
      
      if (!mcpResult.handled) {
        // No MCP call found - Claude has produced final output
        log.debug('No MCP call in response, proceeding to parse');
        break;
      }
      
      iterations++;
      log.info('MCP tool executed', { 
        iteration: iterations, 
        server: mcpResult.server,
        tool: mcpResult.tool,
        hasError: !!mcpResult.error 
      });
      
      // Build feedback message with tool result
      let toolResultMessage;
      if (mcpResult.error) {
        toolResultMessage = `**MCP Tool Error:**
\`\`\`
${mcpResult.error}
\`\`\`

The tool call failed. You can:
1. Try a different tool or different arguments
2. Proceed without this data if possible
3. Output your best implementation based on available information`;
      } else {
        toolResultMessage = `**MCP Tool Result (${mcpResult.tool}):**
\`\`\`json
${JSON.stringify(mcpResult.result, null, 2)}
\`\`\`

Continue with your implementation. You may call another tool if needed, or output the final JSON when ready.`;
      }
      
      // Append to conversation
      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user', content: toolResultMessage });
      
      // Get next response from Claude
      response = await callClaude(messages, model);
    }
    
    if (iterations >= CONFIG.mcpMaxIterations) {
      log.info('MCP iteration limit reached', { iterations });
    }
    
    // Parse final response
    const result = parseCodeResponse(response);
    
    if (!result.files || result.files.length === 0) {
      throw new Error('No files generated in Claude response');
    }
    
    // Write, commit, push, PR
    const filesWritten = writeFiles(repoDir, result.files);
    commitAndPush(repoDir, ticket, branchName, result.summary || 'Implementation');
    const prUrl = await createPullRequest(ticket, branchName, result.summary || 'Implementation');
    
    log.info('Ticket completed', { 
      id: ticket.id, 
      prUrl, 
      files: filesWritten.length, 
      mcpIterations: iterations 
    });
    
    return {
      success: true,
      prUrl,
      branchName,
      filesWritten,
      summary: result.summary,
      criteriaStatus: result.criteriaStatus,
      mcpIterations: iterations
    };
    
  } catch (err) {
    log.error('Ticket failed', { id: ticket.id, error: err.message, stack: err.stack });
    return { success: false, error: err.message };
  } finally {
    // Cleanup repo directory
    if (repoDir && fs.existsSync(repoDir)) {
      try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch {}
    }
    // Cleanup MCP instances
    if (mcpClient) {
      try { 
        await mcpClient.stopAll(); 
        log.debug('MCP instances cleaned up');
      } catch {}
    }
  }
}
```

### Step 5: Update buildImplementationPrompt

Modify the existing `buildImplementationPrompt` to accept MCP tools context:

```javascript
function buildImplementationPrompt(ticket, context = {}) {
  const { mcpToolsPrompt = '', sentinelFeedback = '', ragContext = '' } = context;
  
  let prompt = `${FORGE_PERSONA}

## Task

**TICKET:** ${ticket.id}
**TITLE:** ${ticket.title}
**DESCRIPTION:** ${ticket.description}
**ACCEPTANCE CRITERIA:** 
${ticket.acceptance_criteria}
**FILES HINT:** ${ticket.files_hint || 'Not specified'}
`;

  // Add sentinel feedback for retries (MUST FIX issues)
  if (sentinelFeedback) {
    prompt += `\n${sentinelFeedback}\n`;
  }
  
  // Add RAG context
  if (ragContext) {
    prompt += `\n## Codebase Context\n${ragContext}\n`;
  }
  
  // Add MCP tools section
  if (mcpToolsPrompt) {
    prompt += `\n${mcpToolsPrompt}\n`;
  }
  
  // Add output format instructions
  prompt += `
## Output Format

When ready, respond with JSON:

\`\`\`json
{
  "files": [{"path": "relative/path/to/file.js", "content": "complete file content"}],
  "summary": "Brief summary of changes made",
  "criteriaStatus": [{"criterion": "criterion text", "status": "PASS|FAIL|BLOCKED", "evidence": "explanation"}]
}
\`\`\`
`;

  return prompt;
}
```

### Step 6: Add Global MCP Cleanup on Shutdown (Poll Mode)

In the POLL MODE section, update the shutdown handler:

```javascript
// Track active MCP client for cleanup
let activeMcpClient = null;

const shutdown = async (sig) => {
  log.info('Shutdown', { signal: sig });
  running = false;
  if (activeMcpClient) {
    try { 
      await activeMcpClient.stopAll(); 
      log.info('MCP instances cleaned up on shutdown');
    } catch (err) {
      log.error('MCP shutdown cleanup failed', { error: err.message });
    }
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

---

## Database Schema Update

Add `mcp_servers` column to tickets table:

```sql
-- Migration: Add mcp_servers to tickets
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tickets_mcp_servers 
ON tickets USING gin (mcp_servers);

-- Also add to projects for default inheritance
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;
```

### Example Ticket with MCP

```json
{
  "id": "TICKET-123",
  "title": "Add product listing feature",
  "description": "Create a page showing all products from our merchant API",
  "acceptance_criteria": "- Shows product name and price\n- Handles empty state",
  "repo_url": "https://github.com/org/repo",
  "mcp_servers": ["ai.shawndurrani/mcp-merchant"]
}
```

---

## Testing

### Test 1: Unit Test MCP Integration

Create `/opt/swarm-agents/forge-agent/test/mcp-integration.test.js`:

```javascript
#!/usr/bin/env node
const { MCPClient } = require('../lib/mcp-client.js');

const TEST_SERVER = 'ai.shawndurrani/mcp-merchant';
const FABRIC_URL = process.env.MCP_FABRIC_URL || 'http://localhost:8085';

async function runTests() {
  console.log('\n🧪 MCP Integration Tests');
  console.log(`   Fabric URL: ${FABRIC_URL}\n`);
  
  let passed = 0, failed = 0;

  // Test 1: Fabric connectivity
  console.log('1. Testing Fabric connectivity...');
  try {
    const res = await fetch(`${FABRIC_URL}/health`);
    if (res.ok) { console.log('   ✅ Fabric is healthy'); passed++; }
    else throw new Error(`Status ${res.status}`);
  } catch (err) {
    console.log(`   ❌ Fabric unreachable: ${err.message}`);
    process.exit(1);
  }

  const mcpClient = new MCPClient('integration-test', { fabricUrl: FABRIC_URL });

  // Test 2: handleMCPCall with tool request
  console.log('\n2. Testing handleMCPCall with tool request...');
  try {
    const mockResponse = `I need to check the API status.
\`\`\`json
{"mcp_call": {"server": "${TEST_SERVER}", "tool": "health", "args": {}}}
\`\`\``;
    
    const result = await mcpClient.handleMCPCall(mockResponse);
    if (result.handled) { console.log('   ✅ Tool call handled'); passed++; }
    else throw new Error('Not handled');
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`); failed++;
  }

  // Test 3: handleMCPCall with final response (no tool call)
  console.log('\n3. Testing handleMCPCall with final response...');
  try {
    const mockFinal = `Here is the implementation:
\`\`\`json
{"files": [{"path": "src/test.js", "content": "// code"}], "summary": "Done"}
\`\`\``;
    
    const result = await mcpClient.handleMCPCall(mockFinal);
    if (!result.handled) { console.log('   ✅ Correctly not handled'); passed++; }
    else throw new Error('Should not have handled');
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`); failed++;
  }

  // Cleanup
  console.log('\n4. Testing cleanup...');
  await mcpClient.stopAll();
  console.log('   ✅ Cleanup completed'); passed++;

  console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('Test failed:', err); process.exit(1); });
```

### Test 2: End-to-End with Mock Ticket

```bash
cd /opt/swarm-agents/forge-agent

cat > /tmp/mcp-test-input.json << 'EOF'
{
  "ticket": {
    "id": "MCP-TEST-001",
    "title": "Test MCP Integration",
    "description": "Test that forge agent can call MCP tools",
    "acceptance_criteria": "- Agent calls MCP health tool\n- Agent generates valid output",
    "repo_url": "https://github.com/corynaegle-ai/swarm-test-repo",
    "files_hint": "src/test.js",
    "mcp_servers": ["ai.shawndurrani/mcp-merchant"]
  }
}
EOF

MCP_FABRIC_URL=http://localhost:8085 node main.js /tmp/mcp-test-input.json /tmp/mcp-test-output.json
cat /tmp/mcp-test-output.json | jq '.success, .mcpIterations'
```

### Test 3: From Firecracker VM

```bash
# Start a VM
/opt/swarm/scripts/restore-vm.sh 0

# SSH into VM
ssh -o StrictHostKeyChecking=no root@10.0.0.2

# Test MCP Fabric connectivity from VM
curl -s http://10.0.0.1:8085/health | jq

# Run integration test
cd /opt/swarm-agents/forge-agent
MCP_FABRIC_URL=http://10.0.0.1:8085 node test/mcp-integration.test.js
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| MCP Fabric down | Log error, continue without MCP tools |
| Server fails to start | Return error in handleMCPCall, let Claude adapt |
| Tool call timeout | MCPClient timeout (30s default), error returned |
| Malformed tool response | JSON parse error, returned to Claude as error |
| Max iterations reached | Log warning, proceed with current response |
| Invalid mcp_servers array | Skip MCP initialization, log warning |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_FABRIC_URL` | `http://10.0.0.1:8085` | MCP Fabric endpoint (use 10.0.0.1 from VMs) |
| `MCP_MAX_ITERATIONS` | `5` | Max MCP tool calls per ticket |
| `MCP_TIMEOUT` | `30000` | Tool call timeout in ms |

---

## Success Criteria

- [ ] MCPClient imported in main.js
- [ ] CONFIG includes MCP settings  
- [ ] `buildMCPInstructions()` helper added
- [ ] processTicket reads mcp_servers from ticket/projectSettings
- [ ] MCP tools prompt added to Claude prompt
- [ ] MCP tool call loop works (max 5 iterations)
- [ ] Error cases handled gracefully
- [ ] MCP cleanup in finally block
- [ ] Shutdown handler stops MCP instances
- [ ] Integration test passes on host
- [ ] Integration test passes from Firecracker VM
- [ ] Database migration applied
- [ ] Session notes updated
- [ ] Git commit pushed

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `/opt/swarm-agents/forge-agent/main.js` | MODIFY |
| `/opt/swarm-agents/forge-agent/test/mcp-integration.test.js` | CREATE |
| `/opt/swarm-tickets/migrations/XXX_add_mcp_servers.sql` | CREATE |
| `/opt/swarm-specs/session-notes/current.md` | UPDATE |

---

## Dev Droplet Commands

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Query RAG before starting
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "forge agent processTicket mcp", "limit": 5}' | jq

# View current main.js
head -100 /opt/swarm-agents/forge-agent/main.js

# Check MCP Fabric
curl http://localhost:8085/health | jq

# Run tests
cd /opt/swarm-agents/forge-agent
node test/mcp-client.test.js
node test/mcp-integration.test.js
```

---

## Related Files

- MCPClient: `/opt/swarm-agents/forge-agent/lib/mcp-client.js`
- MCPClient Tests: `/opt/swarm-agents/forge-agent/test/mcp-client.test.js`
- Session Notes: `/opt/swarm-specs/session-notes/current.md`
- MCP Fabric: `/opt/swarm-mcp/` (port 8085)

---

## Commit Message Template

```
feat(forge): Integrate MCP tools into agent workflow

- Add MCPClient import and configuration
- Add buildMCPInstructions() helper for Claude prompts
- Modify processTicket to support MCP tool loop (max 5 iterations)
- Add graceful error handling for MCP failures
- Add cleanup in finally block and shutdown handler
- Add mcp-integration.test.js

MCP servers can be specified per-ticket or via projectSettings.
Agent calls tools iteratively, feeding results back to Claude.
```
