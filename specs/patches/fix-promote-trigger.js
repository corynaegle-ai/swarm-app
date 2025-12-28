const fs = require("fs");
const path = "/opt/swarm-app/apps/platform/routes/backlog.js";
let content = fs.readFileSync(path, "utf8");

// Add import for clarification agent
const importLine = "const RAG_BASE_URL = process.env.RAG_URL || 'http://localhost:8082';";
const newImportLine = `const RAG_BASE_URL = process.env.RAG_URL || 'http://localhost:8082';
const { clarificationAgent } = require('../agents/clarification-agent');`;

if (content.includes("clarificationAgent")) {
  console.log("Import already exists");
} else {
  content = content.replace(importLine, newImportLine);
  console.log("Added clarificationAgent import");
}

// Find the section after hitl_messages insert and add agent trigger
const searchPattern = "// Update backlog item to promoted state";

if (content.includes("// Trigger clarifying agent")) {
  console.log("Agent trigger already added");
} else {
  const triggerCode = `// Trigger clarifying agent to analyze refinement history and set progress
    if (hasRefinementHistory) {
      try {
        // Build session object for agent
        const newSession = {
          id: sessionId,
          source_type: 'backlog',
          chat_history: chatHistory,
          description: description,
          project_name: item.title,
          repo_url: item.repo_url
        };
        const agentResult = await clarificationAgent.startSession(newSession);
        console.log('[Promote] Clarifying agent analyzed chat: progress=' + (agentResult.progress || 0) + '%');
      } catch (agentErr) {
        console.error('[Promote] Clarifying agent error (non-fatal):', agentErr.message);
      }
    }

    `;
  content = content.replace(searchPattern, triggerCode + searchPattern);
  console.log("Added agent trigger after promotion");
}

fs.writeFileSync(path, content);
console.log("File saved");
