# MCP Factory - Step 6: API Server

## Context

You are completing MCP Factory on the Swarm droplet (146.190.35.235).

**Completed:**
- Step 1: Parser (`/opt/mcp-factory/src/parser.js`) - NL → JSON spec via Claude
- Step 2: Generator (`/opt/mcp-factory/src/generator.js`) - Spec → TypeScript MCP server
- Step 3: Validator (`/opt/mcp-factory/src/validator.js`) - TypeScript/Protocol/Deps checks
- Step 4: Packager (`/opt/mcp-factory/src/packager.js`) - Build & create .tgz
- Step 5: Registry (`/opt/mcp-factory/src/registry.js`) - SQLite CRUD for servers

**Remaining:** Step 6 (API Server)

---

## Step 6: API Server

Create `/opt/mcp-factory/src/api.js` (Express)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Full pipeline: NL → registered MCP server |
| GET | `/api/jobs/:id` | Check job status |
| GET | `/api/servers` | List all registered servers |
| GET | `/api/servers/:name` | Get server details + claude_config |
| POST | `/api/validate` | Validate existing server or spec |

### Request/Response Specs

```javascript
// POST /api/generate
// Body: { description: string, runtime?: string }
// Response: { job_id, status: "processing" }

// GET /api/jobs/:id
// Response: { status: "pending|processing|complete|failed", result?, errors? }

// GET /api/servers
// Response: { servers: [...] }

// GET /api/servers/:name
// Response: { server details + claude_config }

// POST /api/validate
// Body: { serverDir: string } OR { spec: object }
// Response: { valid: boolean, errors: [], warnings: [] }
```

### Job Flow (POST /api/generate)

```
1. Parse description → spec (parser.js)
2. Generate server code (generator.js)  
3. Validate (validator.js)
4. Package (packager.js)
5. Register (registry.js)
6. Return manifest
```

### Implementation Requirements

1. **Job Queue** - In-memory Map or SQLite table
   ```javascript
   const jobs = new Map(); // job_id → { status, result, errors, created_at }
   ```

2. **Async Processing** - Return job_id immediately, process in background

3. **Error Handling** - Catch failures at each pipeline stage

4. **Port** - Run on 3456 (or configurable via PORT env)

### Skeleton

```javascript
const express = require('express');
const { MCPParser } = require('./parser');
const { MCPGenerator } = require('./generator');
const { MCPValidator } = require('./validator');
const { MCPPackager } = require('./packager');
const { MCPRegistry } = require('./registry');

const app = express();
app.use(express.json());

const jobs = new Map();
const registry = new MCPRegistry();

// Generate endpoint - orchestrates full pipeline
app.post('/api/generate', async (req, res) => {
  const { description, runtime } = req.body;
  const jobId = `job_${Date.now()}`;
  jobs.set(jobId, { status: 'processing', created_at: new Date() });
  res.json({ job_id: jobId, status: 'processing' });
  
  // Process async
  processJob(jobId, description, runtime);
});

async function processJob(jobId, description, runtime) {
  try {
    // 1. Parse
    // 2. Generate
    // 3. Validate
    // 4. Package
    // 5. Register
    jobs.set(jobId, { status: 'complete', result: manifest });
  } catch (err) {
    jobs.set(jobId, { status: 'failed', errors: [err.message] });
  }
}

// ... other endpoints

app.listen(3456, () => console.log('MCP Factory API on :3456'));
```

---

## SSH Access

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH
```

## File Transfer

```bash
# Write locally with Desktop Commander, then:
scp -i ~/.ssh/swarm_key /local/path root@146.190.35.235:/opt/mcp-factory/src/api.js
```

## Testing

```bash
# Start server
cd /opt/mcp-factory && node src/api.js &

# Test endpoints
curl http://localhost:3456/api/servers

curl -X POST http://localhost:3456/api/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "A calculator MCP server with add, subtract, multiply, divide tools"}'

curl http://localhost:3456/api/jobs/<job_id>
```

---

## Deliverable

`/opt/mcp-factory/src/api.js` - Express API orchestrating the full MCP Factory pipeline

After completion, update session notes and commit to git.
