# Feature: Context-Primed Backlog Refinement Chat

## Summary
Enhance the "Start refinement" button to prime the clarifying agent with full context from the backlog item, including description, attachments (GitHub links, documents, images), and any linked resources.

## Context
Currently, when a user clicks "Start refinement" on a backlog item, the chat session starts with minimal context. The clarifying agent must ask basic questions that could be avoided if it had access to all the information already attached to the ticket.

## Current Flow
1. User clicks "Start refinement"
2. Backend creates chat session with just title/description in system prompt
3. Agent asks clarifying questions about things that may already be documented

## Desired Flow
1. User clicks "Start refinement"
2. Backend gathers ALL context:
   - Title and description
   - All attachments (files, links, images)
   - Fetches content from GitHub links
   - Fetches content from document links
   - Extracts text/description from images
3. Agent receives rich context and asks SMART clarifying questions
4. Chat feels informed and productive from the first message

## Requirements

### Backend Changes (backlog.js)

#### 1. Enhance `POST /api/backlog/:id/start-chat` endpoint

**Current behavior**: Creates chat with basic title/description
**New behavior**: Gather and inject all available context

```javascript
// Pseudocode for context gathering
async function gatherBacklogContext(item, tenantId) {
  const context = {
    title: item.title,
    description: item.description,
    attachments: [],
    githubContent: [],
    documentContent: [],
    imageDescriptions: []
  };
  
  // 1. Fetch attachments from database
  const attachments = await queryAll(
    'SELECT * FROM backlog_attachments WHERE backlog_item_id = $1',
    [item.id]
  );
  
  for (const attachment of attachments) {
    if (attachment.type === 'link') {
      // 2. GitHub links - fetch README, file content
      if (isGitHubUrl(attachment.url)) {
        const ghContent = await fetchGitHubContext(attachment.url);
        context.githubContent.push(ghContent);
      }
      // 3. Document links - fetch and extract text
      else if (isDocumentUrl(attachment.url)) {
        const docContent = await fetchDocumentContent(attachment.url);
        context.documentContent.push(docContent);
      }
      // 4. Regular links - fetch page title/description
      else {
        context.attachments.push({
          type: 'link',
          url: attachment.url,
          title: attachment.title
        });
      }
    }
    else if (attachment.type === 'file') {
      // 5. Images - use Claude vision to describe
      if (isImageFile(attachment.filename)) {
        const description = await describeImage(attachment.file_path);
        context.imageDescriptions.push({
          filename: attachment.filename,
          description
        });
      }
      // 6. Documents - extract text
      else if (isDocumentFile(attachment.filename)) {
        const text = await extractDocumentText(attachment.file_path);
        context.documentContent.push({
          filename: attachment.filename,
          content: text
        });
      }
    }
  }
  
  return context;
}
```

#### 2. Create helper functions

**`fetchGitHubContext(url)`**
- Parse GitHub URL (repo, file, PR, issue)
- For repos: Fetch README.md content
- For files: Fetch file content
- For PRs/Issues: Fetch title, description, comments
- Use GitHub API with auth token

**`fetchDocumentContent(url)`**
- Fetch URL content
- For PDFs: Extract text (use pdf-parse or similar)
- For Google Docs: Use export API if accessible
- For Notion: Use Notion API if accessible
- Return extracted text (truncated to reasonable limit)

**`describeImage(filePath)`**
- Read image file
- Send to Claude Vision API
- Prompt: "Describe this image in the context of a software development project. What does it show? Include any text, diagrams, UI mockups, or technical details visible."
- Return description text

**`extractDocumentText(filePath)`**
- Based on file extension:
  - `.pdf` → pdf-parse
  - `.docx` → mammoth
  - `.txt/.md` → direct read
- Return text content (truncated to ~4000 tokens)

#### 3. Update system prompt generation

```javascript
function generateClarifyingPrompt(item, context) {
  let systemPrompt = `You are a technical product clarifier helping refine a project idea.

## Project Overview
**Title:** ${item.title}
**Description:** ${item.description || 'No description provided'}
`;

  if (item.repo_url) {
    systemPrompt += `**Repository:** ${item.repo_url}\n`;
  }

  // Add GitHub context
  if (context.githubContent.length > 0) {
    systemPrompt += `\n## GitHub Context\n`;
    for (const gh of context.githubContent) {
      systemPrompt += `### ${gh.source}\n${gh.content}\n\n`;
    }
  }

  // Add document content
  if (context.documentContent.length > 0) {
    systemPrompt += `\n## Attached Documents\n`;
    for (const doc of context.documentContent) {
      systemPrompt += `### ${doc.filename || doc.url}\n${doc.content}\n\n`;
    }
  }

  // Add image descriptions
  if (context.imageDescriptions.length > 0) {
    systemPrompt += `\n## Attached Images\n`;
    for (const img of context.imageDescriptions) {
      systemPrompt += `### ${img.filename}\n${img.description}\n\n`;
    }
  }

  // Add link references
  if (context.attachments.length > 0) {
    systemPrompt += `\n## Referenced Links\n`;
    for (const link of context.attachments) {
      systemPrompt += `- [${link.title || link.url}](${link.url})\n`;
    }
  }

  systemPrompt += `
## Your Task
You have been provided with comprehensive context about this project idea. Your role is to:
1. Acknowledge the context you've received
2. Ask TARGETED clarifying questions that build on what's already documented
3. Avoid asking about information that's already provided
4. Focus on gaps, ambiguities, edge cases, and technical decisions

Start by briefly summarizing what you understand from the provided context, then ask your first clarifying question.`;

  return systemPrompt;
}
```

### Frontend Changes (Backlog.jsx)

#### 1. Show loading state during context gathering

```jsx
// When starting chat, show that context is being gathered
const handleStartChat = async () => {
  setActionLoading('start-chat');
  setLoadingMessage('Gathering context from attachments...');
  
  try {
    const res = await apiCall(`/api/backlog/${selectedItem.id}/start-chat`, {
      method: 'POST'
    });
    // ... rest of handler
  } finally {
    setActionLoading(null);
    setLoadingMessage(null);
  }
};
```

#### 2. Update button text during loading

```jsx
<button onClick={handleStartChat} disabled={actionLoading}>
  {actionLoading === 'start-chat' ? (
    <><Loader2 className="spin" /> {loadingMessage || 'Starting...'}</>
  ) : (
    <><MessageSquare /> Start Refinement</>
  )}
</button>
```

### Database Changes
None required - uses existing `backlog_attachments` table.

### New Dependencies (if needed)
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX text extraction
- GitHub API client (already have GitHubService)

### Error Handling
- If GitHub fetch fails → Continue without GitHub context, log warning
- If document extraction fails → Include filename but note "content unavailable"
- If image description fails → Include filename but note "description unavailable"
- Never block chat start due to context gathering failures

### Token/Size Limits
- GitHub content: Max 2000 tokens per source
- Document content: Max 4000 tokens per document
- Image descriptions: Max 500 tokens per image
- Total context: Aim for ~8000 tokens max to leave room for conversation

## Acceptance Criteria

- [ ] Start refinement gathers all attachment context before starting chat
- [ ] GitHub repo links fetch README content
- [ ] GitHub file links fetch file content
- [ ] GitHub PR/Issue links fetch metadata and description
- [ ] Document attachments (PDF, DOCX, TXT) have text extracted
- [ ] Image attachments are described using Claude Vision
- [ ] Regular URL attachments are included as references
- [ ] System prompt includes all gathered context
- [ ] Agent's first message acknowledges the context it received
- [ ] Loading state shows progress during context gathering
- [ ] Failures in context gathering don't block chat start
- [ ] Context is appropriately truncated to stay within token limits

## Files to Modify

1. `/opt/swarm-app/apps/platform/routes/backlog.js`
   - Enhance `start-chat` endpoint
   - Add context gathering functions

2. `/opt/swarm-app/apps/platform/services/` (new files)
   - `github-context.js` - GitHub content fetching
   - `document-extractor.js` - PDF/DOCX text extraction
   - `image-describer.js` - Claude Vision integration

3. `/opt/swarm-app/apps/dashboard/src/pages/Backlog.jsx`
   - Enhanced loading states

## Testing

1. Create backlog item with:
   - Detailed description
   - GitHub repo link attachment
   - PDF document attachment
   - Screenshot image attachment
   
2. Click "Start refinement"
3. Verify loading state shows context gathering
4. Verify agent's first response acknowledges:
   - The project description
   - Content from GitHub README
   - Content from PDF document
   - Description of the screenshot
5. Verify agent asks targeted questions, not basic ones

## Future Enhancements

- Cache GitHub/document content to avoid re-fetching
- Allow user to see gathered context before starting chat
- Add RAG integration for repo_url codebase context
- Support more document formats (Google Docs, Notion)
