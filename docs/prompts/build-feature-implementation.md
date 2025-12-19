# Build Feature Implementation Prompt

## Goal
Complete the Build Feature workflow to differentiate it from the generic "New Application" flow. Enable users to add features to existing codebases with AI-assisted analysis and ticket generation.

---

## Current State Audit

### ✅ Already Implemented

| Component | Location | Details |
|-----------|----------|---------|
| UI Card | `CreateProject.jsx:23-30` | Orange "Build Feature" card with Wrench icon |
| Form Fields | `CreateProject.jsx` | featureName, repoUrl, featureDescription states |
| Submit Handler | `handleBuildFeatureSubmit()` | Creates session with `project_type='build_feature'` |
| Orange Styling | `App.css:2581-2649` | Glass card, hover effects, button gradients |
| Backend Storage | `hitl.js:73-82` | project_type column stored in hitl_sessions |
| Route Rendering | `CreateProject.jsx:292` | Conditional form display |

### ❌ Not Yet Implemented

| Component | Priority | Description |
|-----------|----------|-------------|
| Repo URL extraction | HIGH | Parse repo URL from description, store separately |
| Repository cloning | HIGH | Clone target repo for analysis |
| Codebase analysis | HIGH | Scan structure, detect tech stack, find patterns |
| Feature-specific AI prompts | MEDIUM | Context-aware clarification based on existing code |
| Integration planning | MEDIUM | Identify files to modify vs create |
| DesignSession branching | MEDIUM | Different UI flow for build_feature type |

---

## Implementation Plan

### Phase 1: Database & API Foundation

**Step 1.1: Add repo_url column to hitl_sessions**

Location: `/opt/swarm-platform/migrations/`

```sql
-- Create new migration file: 00X_add_repo_url.sql
ALTER TABLE hitl_sessions ADD COLUMN repo_url TEXT;
ALTER TABLE hitl_sessions ADD COLUMN repo_analysis TEXT; -- JSON blob for analysis results
```

**Step 1.2: Modify session creation endpoint**

Location: `/opt/swarm-platform/routes/hitl.js`

```javascript
// In POST / handler (around line 73)
const { project_name, description, tenant_id, project_type } = req.body;

// Extract repo_url for build_feature type
let repo_url = null;
if (project_type === 'build_feature') {
  // Parse from description (format: "## Target Repository\nhttps://github.com/...")
  const repoMatch = description.match(/## Target Repository\s*\n(https?:\/\/[^\s\n]+)/);
  repo_url = repoMatch ? repoMatch[1] : null;
}

// Update INSERT to include repo_url
db.prepare(`
  INSERT INTO hitl_sessions (id, tenant_id, project_name, description, state, project_type, repo_url, created_at)
  VALUES (?, ?, ?, ?, 'input', ?, ?, datetime('now'))
`).run(id, tenant_id, project_name, description, project_type || 'application', repo_url);
```

### Phase 2: Repository Analysis Service

**Step 2.1: Create repo analysis endpoint**

Location: `/opt/swarm-platform/routes/hitl.js`

```javascript
// POST /api/hitl/:sessionId/analyze-repo
router.post('/:sessionId/analyze-repo', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const session = db.prepare('SELECT * FROM hitl_sessions WHERE id = ?').get(sessionId);
  
  if (!session || session.project_type !== 'build_feature') {
    return res.status(400).json({ error: 'Not a build_feature session' });
  }
  
  if (!session.repo_url) {
    return res.status(400).json({ error: 'No repository URL found' });
  }
  
  // Queue analysis job (or run synchronously for MVP)
  const analysis = await analyzeRepository(session.repo_url);
  
  db.prepare('UPDATE hitl_sessions SET repo_analysis = ? WHERE id = ?')
    .run(JSON.stringify(analysis), sessionId);
  
  res.json({ success: true, analysis });
});
```

**Step 2.2: Repository analysis function**

Location: `/opt/swarm-platform/services/repoAnalysis.js` (new file)

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function analyzeRepository(repoUrl) {
  const tempDir = `/tmp/repo-analysis-${Date.now()}`;
  
  try {
    // Clone repo (shallow for speed)
    execSync(`git clone --depth 1 ${repoUrl} ${tempDir}`, { timeout: 60000 });
    
    // Analyze structure
    const analysis = {
      files: scanDirectory(tempDir),
      techStack: detectTechStack(tempDir),
      entryPoints: findEntryPoints(tempDir),
      patterns: detectPatterns(tempDir)
    };
    
    return analysis;
  } finally {
    // Cleanup
    execSync(`rm -rf ${tempDir}`);
  }
}

function detectTechStack(dir) {
  const stack = { languages: [], frameworks: [], databases: [] };
  
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    stack.languages.push('JavaScript/Node.js');
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
    if (pkg.dependencies?.react) stack.frameworks.push('React');
    if (pkg.dependencies?.express) stack.frameworks.push('Express');
    if (pkg.dependencies?.['better-sqlite3']) stack.databases.push('SQLite');
  }
  
  if (fs.existsSync(path.join(dir, 'requirements.txt'))) {
    stack.languages.push('Python');
  }
  
  return stack;
}

module.exports = { analyzeRepository };
```

### Phase 3: Frontend Integration

**Step 3.1: Update DesignSession for build_feature**

Location: `/opt/swarm-dashboard/src/pages/DesignSession.jsx`

```javascript
// Add state for repo analysis
const [repoAnalysis, setRepoAnalysis] = useState(null);
const [isAnalyzing, setIsAnalyzing] = useState(false);

// Detect build_feature and trigger analysis
useEffect(() => {
  if (session?.project_type === 'build_feature' && !repoAnalysis && !session.repo_analysis) {
    triggerRepoAnalysis();
  } else if (session?.repo_analysis) {
    setRepoAnalysis(JSON.parse(session.repo_analysis));
  }
}, [session]);

const triggerRepoAnalysis = async () => {
  setIsAnalyzing(true);
  try {
    const res = await fetch(`/api/hitl/${sessionId}/analyze-repo`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    setRepoAnalysis(data.analysis);
  } finally {
    setIsAnalyzing(false);
  }
};
```

**Step 3.2: Add RepoAnalysisPanel component**

Location: `/opt/swarm-dashboard/src/components/RepoAnalysisPanel.jsx` (new file)

```javascript
import { Loader2, GitBranch, Code, Database } from 'lucide-react';

export default function RepoAnalysisPanel({ analysis, isLoading }) {
  if (isLoading) {
    return (
      <div className="repo-analysis-panel loading">
        <Loader2 className="spin" size={24} />
        <span>Analyzing repository...</span>
      </div>
    );
  }
  
  if (!analysis) return null;
  
  return (
    <div className="repo-analysis-panel glass-card">
      <h3><GitBranch size={18} /> Repository Analysis</h3>
      <div className="tech-stack">
        <h4><Code size={16} /> Tech Stack</h4>
        <div className="tags">
          {analysis.techStack?.languages?.map(l => (
            <span key={l} className="tag language">{l}</span>
          ))}
          {analysis.techStack?.frameworks?.map(f => (
            <span key={f} className="tag framework">{f}</span>
          ))}
          {analysis.techStack?.databases?.map(d => (
            <span key={d} className="tag database">{d}</span>
          ))}
        </div>
      </div>
      <div className="file-structure">
        <h4>Key Entry Points</h4>
        <ul>
          {analysis.entryPoints?.map(f => <li key={f}><code>{f}</code></li>)}
        </ul>
      </div>
    </div>
  );
}
```

### Phase 4: Feature-Specific AI Prompts

**Step 4.1: Create build_feature clarification prompt**

Location: `/opt/swarm-platform/prompts/build-feature-clarify.md` (new file)

```markdown
You are analyzing an existing codebase to help add a new feature.

## Repository Analysis
{{REPO_ANALYSIS}}

## Requested Feature
{{FEATURE_DESCRIPTION}}

Ask clarifying questions about:
1. Which existing components should be modified vs. new ones created?
2. How should this feature integrate with existing patterns?
3. Are there existing similar features to follow as examples?
4. What data models need to be extended or created?
5. What API endpoints are needed?

Focus on integration points and maintaining consistency with the existing codebase.
```

---

## File Locations Reference

| File | Purpose |
|------|---------|
| `/opt/swarm-dashboard/src/pages/CreateProject.jsx` | Project type selection & forms |
| `/opt/swarm-dashboard/src/pages/DesignSession.jsx` | Chat interface for HITL flow |
| `/opt/swarm-platform/routes/hitl.js` | HITL API endpoints |
| `/opt/swarm-platform/db.js` | Database connection |
| `/opt/swarm-platform/migrations/` | DB schema changes |

## Dev Environment

| Resource | Value |
|----------|-------|
| Dev droplet | 134.199.235.140 |
| Dashboard | https://dashboard.dev.swarmstack.net |
| API | https://api.dev.swarmstack.net |

## Commands

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Restart services after changes
pm2 restart swarm-platform-dev
cd /opt/swarm-dashboard && npm run build && pm2 restart swarm-dashboard

# Check logs
pm2 logs swarm-platform-dev --lines 50

# Check database schema
sqlite3 /opt/swarm-platform/swarm.db ".schema hitl_sessions"
```

---

## Start Here

1. SSH to dev droplet
2. Check if `repo_url` column exists: `sqlite3 /opt/swarm-platform/swarm.db ".schema hitl_sessions"`
3. If not, create migration and run it
4. Modify POST `/api/hitl` to extract and store repo_url
5. Test by creating a Build Feature session and verifying repo_url is stored
