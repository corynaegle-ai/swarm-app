# Clarifying Agent Workflow with RAG Integration

## Overview

This document describes how the Swarm Clarifying Agent works, including how RAG (Repository Analysis) context is injected into the conversation flow for `build_feature` projects.

---

## Clarifying Agent Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           SWARM CLARIFYING AGENT WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   USER       │
│   INPUT      │
│ (Chat Box)   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (DesignSession.jsx)                                                         │
│  ────────────────────────────────────────────────────────────────────────────────────│
│  • User types message in chat input                                                   │
│  • POST /api/hitl/:sessionId/respond { message: "..." }                              │
└──────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  API ROUTE (routes/hitl.js)                                                          │
│  ────────────────────────────────────────────────────────────────────────────────────│
│  router.post('/:sessionId/respond')                                                  │
│    1. Validate session exists                                                        │
│    2. Check state is 'input' or 'clarifying'                                        │
│    3. Call: dispatcher.dispatch(sessionId, 'clarify', { userMessage })              │
└──────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  AI DISPATCHER (services/ai-dispatcher.js)                                           │
│  ────────────────────────────────────────────────────────────────────────────────────│
│  executeClarify(session, context)                                                    │
│    • If context.userMessage exists:                                                  │
│        → clarificationAgent.processResponse(session, userMessage)                   │
│    • Else (new session):                                                            │
│        → clarificationAgent.startClarification(session)                             │
└──────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  CLARIFICATION AGENT (agents/clarification-agent.js)                                 │
│  ════════════════════════════════════════════════════════════════════════════════════│
│                                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │  STEP 1: BUILD CONVERSATION HISTORY                                             │ │
│  │  ─────────────────────────────────────────────────────────────────────────────  │ │
│  │  const messages = await buildConversationHistory(session.id, userMessage)       │ │
│  │    • Query hitl_messages table for session                                      │ │
│  │    • Format as Claude-compatible message array                                  │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                                │
│                                      ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │  STEP 2: GET CURRENT CONTEXT                                                    │ │
│  │  ─────────────────────────────────────────────────────────────────────────────  │ │
│  │  const currentContext = session.clarification_context                           │ │
│  │    • Parse gathered requirements (users, features, constraints, etc.)           │ │
│  │    • Get overallProgress percentage                                             │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                                │
│                                      ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │  STEP 3: BUILD ENHANCED SYSTEM PROMPT  ★ RAG INJECTION POINT ★                 │ │
│  │  ═══════════════════════════════════════════════════════════════════════════   │ │
│  │                                                                                 │ │
│  │   IF session.project_type === 'build_feature' && session.repo_analysis:        │ │
│  │   ┌───────────────────────────────────────────────────────────────────────┐    │ │
│  │   │  ★ RAG CONTEXT INJECTION ★                                            │    │ │
│  │   │                                                                       │    │ │
│  │   │  1. Load: prompts/build-feature-clarify.md                           │    │ │
│  │   │                                                                       │    │ │
│  │   │  2. Parse repo_analysis from session (from /analyze-repo endpoint):  │    │ │
│  │   │     • files: [{path, type, size}...]                                 │    │ │
│  │   │     • techStack: {frameworks, languages, databases}                  │    │ │
│  │   │     • entryPoints: [main files]                                      │    │ │
│  │   │     • patterns: detected architectural patterns                      │    │ │
│  │   │                                                                       │    │ │
│  │   │  3. Inject into prompt:                                              │    │ │
│  │   │     buildFeaturePrompt                                               │    │ │
│  │   │       .replace('{{REPO_ANALYSIS}}', JSON.stringify(repoAnalysis))   │    │ │
│  │   │       .replace('{{FEATURE_DESCRIPTION}}', session.description)      │    │ │
│  │   │       + '\n\n## Current Gathered Information\n' + contextSummary    │    │ │
│  │   └───────────────────────────────────────────────────────────────────────┘    │ │
│  │                                                                                 │ │
│  │   ELSE (generic project):                                                       │ │
│  │   ┌───────────────────────────────────────────────────────────────────────┐    │ │
│  │   │  enhancedSystem = systemPrompt                                        │    │ │
│  │   │    + '\n\n## Current Gathered Information\n' + contextSummary        │    │ │
│  │   │    + '\n\n## Project Description\n' + session.description            │    │ │
│  │   └───────────────────────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                                │
│                                      ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │  STEP 4: CALL ANTHROPIC API                                                     │ │
│  │  ─────────────────────────────────────────────────────────────────────────────  │ │
│  │                                                                                 │ │
│  │   const response = await chat({                                                │ │
│  │     system: enhancedSystem,      // ← Contains RAG context + prompt            │ │
│  │     messages: conversationHistory, // ← User input + history                   │ │
│  │     maxTokens: 2048                                                            │ │
│  │   });                                                                          │ │
│  │                                                                                 │ │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐  │ │
│  │   │  CLAUDE API RECEIVES:                                                   │  │ │
│  │   │  ════════════════════                                                   │  │ │
│  │   │  SYSTEM PROMPT:                                                         │  │ │
│  │   │    • Base clarification instructions                                    │  │ │
│  │   │    • [If build_feature] Repository analysis (RAG):                     │  │ │
│  │   │        - File structure                                                 │  │ │
│  │   │        - Tech stack (React, Node, PostgreSQL, etc.)                    │  │ │
│  │   │        - Entry points                                                   │  │ │
│  │   │        - Architectural patterns                                         │  │ │
│  │   │    • Current gathered requirements                                      │  │ │
│  │   │    • Project description                                                │  │ │
│  │   │                                                                         │  │ │
│  │   │  MESSAGES:                                                              │  │ │
│  │   │    [prior conversation history...]                                      │  │ │
│  │   │    { role: 'user', content: userMessage }  ← Current input             │  │ │
│  │   └─────────────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                                │
│                                      ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │  STEP 5: PARSE RESPONSE & UPDATE STATE                                          │ │
│  │  ─────────────────────────────────────────────────────────────────────────────  │ │
│  │  const parsed = parseJsonResponse(response.content)                             │ │
│  │    • message: Next question to ask user                                         │ │
│  │    • gathered: Updated requirements object                                      │ │
│  │    • overallProgress: 0-100%                                                    │ │
│  │    • readyForSpec: boolean                                                      │ │
│  │                                                                                 │ │
│  │  Store AI message to hitl_messages table                                        │ │
│  │  Update clarification_context in hitl_sessions                                  │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  WEBSOCKET BROADCAST (websocket.js)                                                  │
│  ────────────────────────────────────────────────────────────────────────────────────│
│  broadcast.sessionMessage(sessionId, {                                               │
│    id, role: 'assistant', content: message, messageType: 'question'                 │
│  })                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (DesignSession.jsx)                                                        │
│  ────────────────────────────────────────────────────────────────────────────────────│
│  • WebSocket receives message                                                        │
│  • Updates messages state                                                            │
│  • Renders AI response in chat                                                       │
│  • Updates progress bar                                                              │
│  • User can continue conversation or generate spec                                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   LOOP       │ ← User continues conversation until readyForSpec = true
│   BACK TO    │
│   USER INPUT │
└──────────────┘
```

---

## RAG Context Flow (Build Feature Projects)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        RAG CONTEXT GENERATION (Pre-Clarification)                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

       ┌─────────────────────┐
       │  User Creates       │
       │  Build Feature      │
       │  Project with       │
       │  GitHub Repo URL    │
       └──────────┬──────────┘
                  │
                  ▼
       ┌──────────────────────────────────────────────────────────────────────┐
       │  POST /api/hitl/:sessionId/analyze-repo                              │
       │  ────────────────────────────────────────────────────────────────────│
       │  1. Check for cached analysis (session.repo_analysis)                │
       │  2. If not cached: analyzeRepository(session.repo_url)               │
       └──────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
       ┌──────────────────────────────────────────────────────────────────────┐
       │  REPO ANALYSIS SERVICE (services/repoAnalysis.js)                    │
       │  ────────────────────────────────────────────────────────────────────│
       │  1. git clone --depth 1 (shallow clone to temp dir)                  │
       │  2. scanDirectory() → file tree                                      │
       │  3. detectTechStack() → {frameworks, languages, databases}           │
       │  4. findEntryPoints() → main files                                   │
       │  5. detectPatterns() → architectural patterns                        │
       │  6. Cleanup temp dir                                                 │
       │  7. Store JSON in hitl_sessions.repo_analysis                        │
       └──────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
       ┌──────────────────────────────────────────────────────────────────────┐
       │  RESULT: session.repo_analysis = {                                   │
       │    files: [{path, type, size}...],                                   │
       │    techStack: {frameworks: ["React"], languages: ["JavaScript"]...}, │
       │    entryPoints: ["src/index.js", "server.js"],                       │
       │    patterns: ["MVC", "REST API"],                                    │
       │    analyzedAt: "2025-12-18T..."                                      │
       │  }                                                                   │
       └──────────────────────────────────────────────────────────────────────┘
                  │
                  │  ← This becomes the RAG context injected into
                  │    the clarification agent's system prompt
                  ▼
       ┌──────────────────────────────────────────────────────────────────────┐
       │  ENHANCED SYSTEM PROMPT STRUCTURE:                                   │
       │  ════════════════════════════════════════════════════════════════════│
       │                                                                      │
       │  # Build Feature Clarification Agent                                 │
       │                                                                      │
       │  You are helping design a new feature for an existing codebase.     │
       │                                                                      │
       │  ## Repository Analysis (RAG)                                        │
       │  ```json                                                             │
       │  {                                                                   │
       │    "files": [...],                                                   │
       │    "techStack": {...},                                               │
       │    "entryPoints": [...],                                             │
       │    "patterns": [...]                                                 │
       │  }                                                                   │
       │  ```                                                                 │
       │                                                                      │
       │  ## Feature Description                                              │
       │  {{user's feature request}}                                          │
       │                                                                      │
       │  ## Current Gathered Information                                     │
       │  {{accumulated requirements from conversation}}                      │
       │                                                                      │
       │  ## Instructions                                                     │
       │  Ask clarifying questions to understand the feature requirements... │
       └──────────────────────────────────────────────────────────────────────┘
```

---

## Key Components Summary

| Component | File | Role |
|-----------|------|------|
| **Frontend Chat** | `DesignSession.jsx` | User input, message display, WebSocket listener |
| **API Route** | `routes/hitl.js` | `/respond` endpoint, validation, dispatcher call |
| **AI Dispatcher** | `services/ai-dispatcher.js` | Routes to correct agent, orchestrates actions |
| **Clarification Agent** | `agents/clarification-agent.js` | Builds prompts, calls Claude, parses responses |
| **Claude Client** | `services/claude-client.js` | Anthropic API wrapper |
| **Repo Analysis** | `services/repoAnalysis.js` | Git clone, file scanning, tech detection (RAG source) |
| **WebSocket** | `websocket.js` | Real-time message broadcasting |

---

## RAG Terminology Note

The term "RAG" in Swarm is used loosely to refer to **contextual code understanding** rather than traditional vector-based retrieval. For `build_feature` projects:

1. **Repo Analysis** = The "Retrieval" — clones repo, extracts structure/patterns
2. **System Prompt Injection** = The "Augmentation" — injects analysis into Claude's context
3. **Claude API Call** = The "Generation" — Claude uses context to ask informed questions

This is more accurately called **"Context-Augmented Generation"** since it doesn't use vector embeddings or semantic search — it's deterministic code analysis injected into prompts.

---

## Database Tables Involved

### hitl_sessions
- `clarification_context` - JSON blob of gathered requirements
- `repo_analysis` - JSON blob of repository analysis (RAG source)
- `state` - Current workflow state (input, clarifying, ready_for_docs, etc.)
- `project_type` - 'new_application' or 'build_feature'

### hitl_messages
- `session_id` - Links to parent session
- `role` - 'user' or 'assistant'
- `content` - Message text
- `message_type` - 'question', 'answer', etc.

---

## Related Files

- `prompts/build-feature-clarify.md` - System prompt template for build_feature projects
- `prompts/clarification-system.md` - Generic clarification system prompt
- `src/pages/DesignSession.jsx` - Frontend chat interface
- `src/components/RepoAnalysisPanel.jsx` - Displays repo analysis in UI

---

*Document created: 2025-12-18*
*Source: RAG queries against Swarm codebase*
