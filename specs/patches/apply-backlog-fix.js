#!/usr/bin/env node
/**
 * Apply backlog promote fix
 * Modifies the promote endpoint to pass repo_url and insert messages
 */

const fs = require('fs');
const path = '/opt/swarm-app/apps/platform/routes/backlog.js';

let content = fs.readFileSync(path, 'utf8');

// Find and replace the INSERT statement to include repo_url
const oldInsert = `INSERT INTO hitl_sessions (
        id, tenant_id, type, state, project_name, description, 
        chat_history, source_type, backlog_item_id, created_at, updated_at
      ) VALUES ($1, $2, 'design', $3, $4, $5, $6, 'backlog', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    \`, [
      sessionId,
      req.user.tenant_id,
      initialState,
      item.title,
      description,
      JSON.stringify(chatHistory),
      req.params.id
    ]);`;

const newInsert = `INSERT INTO hitl_sessions (
        id, tenant_id, type, state, project_name, description, 
        chat_history, source_type, backlog_item_id, repo_url, created_at, updated_at
      ) VALUES ($1, $2, 'design', $3, $4, $5, $6, 'backlog', $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    \`, [
      sessionId,
      req.user.tenant_id,
      initialState,
      item.title,
      description,
      JSON.stringify(chatHistory),
      req.params.id,
      item.repo_url || null  // Pass repo_url from backlog item
    ]);
    
    // Insert refinement chat messages into hitl_messages table
    // This ensures buildConversationHistory() finds the prior context
    if (chatHistory.length > 0) {
      const { v4: uuidv4Gen } = require('uuid');
      for (const msg of chatHistory) {
        await execute(\`
          INSERT INTO hitl_messages (id, session_id, role, content, created_at)
          VALUES ($1, $2, $3, $4, $5)
        \`, [
          uuidv4Gen ? uuidv4Gen() : uuidv4(),
          sessionId,
          msg.role,
          msg.content,
          msg.timestamp ? new Date(msg.timestamp) : new Date()
        ]);
      }
      console.log(\`[Promote] Migrated \${chatHistory.length} refinement messages to hitl_messages\`);
    }`;

if (content.includes('repo_url, created_at')) {
  console.log('Fix already applied to INSERT statement');
} else {
  content = content.replace(oldInsert, newInsert);
  console.log('Applied INSERT fix with repo_url and hitl_messages migration');
}

// Update the response to include repo_url
const oldResponse = `session: {
        id: sessionId,
        state: initialState,
        source_type: 'backlog',
        backlog_item_id: req.params.id,
        project_name: item.title
      }`;

const newResponse = `session: {
        id: sessionId,
        state: initialState,
        source_type: 'backlog',
        backlog_item_id: req.params.id,
        project_name: item.title,
        repo_url: item.repo_url || null,
        refinement_messages: chatHistory.length
      }`;

if (content.includes('repo_url: item.repo_url')) {
  console.log('Response fix already applied');
} else {
  content = content.replace(oldResponse, newResponse);
  console.log('Applied response fix with repo_url');
}

fs.writeFileSync(path, content);
console.log('File saved successfully');
