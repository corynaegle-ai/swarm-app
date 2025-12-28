/**
 * FORGE Surgical Edits Patch
 * 
 * This patch adds support for surgical file modifications instead of full overwrites.
 * 
 * Changes:
 * 1. buildPrompt() - Adds modify instructions when files_to_modify present
 * 2. writeFiles() - Applies search/replace patches for action: "modify"
 * 3. fetchExistingFileContent() - Reads current file from repo for context
 */

// ============================================================================
// NEW FUNCTION: Fetch existing file content from repo
// Insert after line ~460 (before writeFiles)
// ============================================================================

function fetchExistingFileContent(repoDir, filePath, maxLines = 300) {
  const fullPath = path.join(repoDir, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length > maxLines) {
    // Truncate large files, show first and last portions
    const headLines = lines.slice(0, Math.floor(maxLines / 2));
    const tailLines = lines.slice(-Math.floor(maxLines / 2));
    return headLines.join('\n') + 
      `\n\n... [${lines.length - maxLines} lines truncated] ...\n\n` + 
      tailLines.join('\n');
  }
  
  return content;
}

// ============================================================================
// UPDATED buildPrompt() - Add surgical edit instructions
// Replace the existing buildPrompt function (lines 250-345)
// ============================================================================

function buildPrompt(ticket, existingFiles = {}) {
  let criteria = [];
  if (ticket.acceptance_criteria) {
    if (typeof ticket.acceptance_criteria === 'string') {
      try { criteria = JSON.parse(ticket.acceptance_criteria); } catch { criteria = [ticket.acceptance_criteria]; }
    } else if (Array.isArray(ticket.acceptance_criteria)) {
      criteria = ticket.acceptance_criteria;
    }
  }
  
  // Parse files_to_create and files_to_modify from rag_context
  let filesToCreate = [];
  let filesToModify = [];
  
  if (ticket.rag_context) {
    const ctx = typeof ticket.rag_context === 'string' 
      ? JSON.parse(ticket.rag_context) 
      : ticket.rag_context;
    
    filesToCreate = ctx.files_to_create || [];
    filesToModify = ctx.files_to_modify || [];
  }
  
  // Fallback to files_hint if no specific files
  if (filesToCreate.length === 0 && filesToModify.length === 0) {
    let fileHints = [];
    if (ticket.files_hint || ticket.file_hints) {
      const hints = ticket.files_hint || ticket.file_hints;
      if (typeof hints === 'string') {
        try { fileHints = JSON.parse(hints); } catch { fileHints = [hints]; }
      } else if (Array.isArray(hints)) {
        fileHints = hints;
      }
    }
    filesToCreate = fileHints;
  }

  const criteriaSection = criteria.length > 0 
    ? criteria.map((c, i) => {
        if (typeof c === 'object' && c.id) {
          return `${i + 1}. [${c.id}] ${c.description}`;
        }
        return `${i + 1}. ${c}`;
      }).join('\n')
    : 'None specified - use your best judgment';

  // Build files section with CREATE vs MODIFY distinction
  let filesSection = '';
  
  if (filesToCreate.length > 0) {
    filesSection += '**Files to CREATE (new files):**\n';
    filesSection += filesToCreate.map(f => `- ${f}`).join('\n');
    filesSection += '\n\n';
  }
  
  if (filesToModify.length > 0) {
    filesSection += '**Files to MODIFY (existing files - use surgical patches):**\n';
    filesSection += filesToModify.map(f => `- ${f}`).join('\n');
    filesSection += '\n\n';
    
    // Include existing file contents for context
    filesSection += '**Current content of files to modify:**\n\n';
    for (const filePath of filesToModify) {
      if (existingFiles[filePath]) {
        filesSection += `<file path="${filePath}">\n${existingFiles[filePath]}\n</file>\n\n`;
      }
    }
  }
  
  if (!filesSection) {
    filesSection = 'Determine appropriate file structure';
  }

  // Build output format based on whether we have files to modify
  const hasModifications = filesToModify.length > 0;
  
  const outputFormat = hasModifications ? `
## Required Output Format

Respond with ONLY valid JSON in this exact format:

\`\`\`json
{
  "files": [
    {
      "path": "new/file.js",
      "action": "create",
      "content": "// Complete file contents for NEW files"
    },
    {
      "path": "existing/file.js",
      "action": "modify",
      "patches": [
        {
          "search": "exact text to find in the file",
          "replace": "replacement text (can be multi-line)"
        },
        {
          "search": "another exact text to find",
          "replace": "its replacement"
        }
      ]
    }
  ],
  "tests": [
    {
      "path": "tests/file.test.js",
      "content": "// test contents"
    }
  ],
  "summary": "Brief description of implementation",
  "acceptance_criteria_status": [
    {
      "id": "AC-001",
      "criterion": "Description of the criterion",
      "status": "SATISFIED",
      "evidence": "Implemented in file.js:15-30"
    }
  ]
}
\`\`\`

### CRITICAL RULES FOR MODIFICATIONS:

1. **For files listed under "Files to MODIFY":**
   - Use \`"action": "modify"\` with a \`patches\` array
   - Each patch has \`search\` (exact text to find) and \`replace\` (replacement)
   - The \`search\` text must be UNIQUE in the file
   - Include enough context in \`search\` to ensure uniqueness (2-5 lines)
   - NEVER use \`"action": "create"\` for existing files
   - NEVER output the entire file content

2. **For NEW files:**
   - Use \`"action": "create"\` with full \`content\`

3. **Patch best practices:**
   - Make patches as small as possible
   - Include surrounding context to ensure unique match
   - Preserve existing indentation
   - Test mentally that your patches apply cleanly
` : `
## Required Output Format

Respond with ONLY valid JSON in this exact format:

\`\`\`json
{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create",
      "content": "// file contents here"
    }
  ],
  "tests": [
    {
      "path": "tests/file.test.js",
      "content": "// test contents"
    }
  ],
  "summary": "Brief description of implementation",
  "acceptance_criteria_status": [
    {
      "id": "AC-001",
      "criterion": "Description of the criterion",
      "status": "SATISFIED",
      "evidence": "Implemented in file.js:15-30"
    }
  ]
}
\`\`\`
`;

  return `## Implementation Task

### Ticket Information
**ID**: ${ticket.id}
**Title**: ${ticket.title}

### Description
${ticket.description || 'No description provided'}

### Acceptance Criteria (ALL MUST BE SATISFIED)
${criteriaSection}

### Files
${filesSection}

### Repository Context
${ticket.repo_url ? `Repository: ${ticket.repo_url}` : 'Standalone implementation'}
${ticket.branch_name ? `Branch: ${ticket.branch_name}` : ''}

---

## Your Task

1. Implement code that satisfies ALL acceptance criteria
2. Follow your FORGE coding standards
3. Include appropriate error handling
4. For EACH acceptance criterion, report whether it is SATISFIED, PARTIALLY_SATISFIED, or BLOCKED
${outputFormat}
IMPORTANT: 
- Response must be valid JSON only
- All code must be complete and functional
- Every acceptance criterion must have a status entry
- Status must be exactly: SATISFIED, PARTIALLY_SATISFIED, or BLOCKED`;
}

// ============================================================================
// UPDATED writeFiles() - Support surgical patches
// Replace the existing writeFiles function (lines 460-475)
// ============================================================================

function writeFiles(repoDir, files) {
  const written = [];
  
  for (const file of files) {
    const filePath = path.join(repoDir, file.path);
    const fileDir = path.dirname(filePath);
    
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    
    if (file.action === 'modify' && file.patches && Array.isArray(file.patches)) {
      // SURGICAL MODIFICATION: Apply patches
      if (!fs.existsSync(filePath)) {
        log.error('Cannot modify non-existent file', { path: file.path });
        continue;
      }
      
      let content = fs.readFileSync(filePath, 'utf8');
      let patchesApplied = 0;
      
      for (const patch of file.patches) {
        if (!patch.search || patch.replace === undefined) {
          log.warn('Invalid patch format', { path: file.path, patch });
          continue;
        }
        
        if (!content.includes(patch.search)) {
          log.warn('Patch search text not found', { 
            path: file.path, 
            searchPreview: patch.search.substring(0, 50) + '...'
          });
          continue;
        }
        
        // Count occurrences to ensure unique match
        const occurrences = content.split(patch.search).length - 1;
        if (occurrences > 1) {
          log.warn('Patch search text not unique', { 
            path: file.path, 
            occurrences,
            searchPreview: patch.search.substring(0, 50) + '...'
          });
          // Still apply, but warn - will replace all occurrences
        }
        
        content = content.replace(patch.search, patch.replace);
        patchesApplied++;
      }
      
      if (patchesApplied > 0) {
        fs.writeFileSync(filePath, content);
        written.push(file.path);
        log.info('Applied patches to file', { 
          path: file.path, 
          patchesApplied,
          totalPatches: file.patches.length,
          bytes: content.length 
        });
      } else {
        log.error('No patches applied to file', { path: file.path });
      }
      
    } else {
      // CREATE: Write entire file content
      fs.writeFileSync(filePath, file.content);
      written.push(file.path);
      log.info('Wrote file', { path: file.path, bytes: file.content.length });
    }
  }
  
  return written;
}

// ============================================================================
// UPDATE to processTicket() - Fetch existing files before building prompt
// Find the section that calls buildPrompt and generateCode (around line 570-580)
// Add this before the generateCode call:
// ============================================================================

/*
In processTicket(), before calling generateCode:

// Fetch existing file content for files_to_modify
const existingFiles = {};
if (ticket.rag_context) {
  const ctx = typeof ticket.rag_context === 'string' 
    ? JSON.parse(ticket.rag_context) 
    : ticket.rag_context;
  
  const filesToModify = ctx.files_to_modify || [];
  for (const filePath of filesToModify) {
    const content = fetchExistingFileContent(repoDir, filePath);
    if (content) {
      existingFiles[filePath] = content;
      log.info('Fetched existing file for modification', { path: filePath });
    }
  }
}

// Then pass existingFiles to buildPrompt:
const prompt = buildPrompt(ticket, existingFiles);
*/

module.exports = {
  fetchExistingFileContent,
  buildPrompt,
  writeFiles
};
