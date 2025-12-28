#!/usr/bin/env python3
"""
Apply surgical edits patch to FORGE agent index.js
"""
import re
import sys
from datetime import datetime

TARGET = '/opt/swarm-app/apps/agents/coder/index.js'

# Read current file
with open(TARGET, 'r') as f:
    content = f.read()

# Create backup
backup_name = f"{TARGET}.bak-{datetime.now().strftime('%Y%m%d_%H%M%S')}"
with open(backup_name, 'w') as f:
    f.write(content)
print(f"Backup created: {backup_name}")

# ============================================================================
# 1. Add fetchExistingFileContent before writeFiles (around line 460)
# ============================================================================

NEW_FETCH_FUNCTION = '''
// Fetch existing file content for surgical modifications
function fetchExistingFileContent(repoDir, filePath, maxLines = 300) {
  const fullPath = path.join(repoDir, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\\n');
  
  if (lines.length > maxLines) {
    const headLines = lines.slice(0, Math.floor(maxLines / 2));
    const tailLines = lines.slice(-Math.floor(maxLines / 2));
    return headLines.join('\\n') + 
      '\\n\\n... [' + (lines.length - maxLines) + ' lines truncated] ...\\n\\n' + 
      tailLines.join('\\n');
  }
  
  return content;
}

'''

# Insert before writeFiles
content = content.replace(
    'function writeFiles(repoDir, files) {',
    NEW_FETCH_FUNCTION + 'function writeFiles(repoDir, files) {'
)
print("Added fetchExistingFileContent function")

# ============================================================================
# 2. Replace writeFiles with patch-aware version
# ============================================================================

OLD_WRITE_FILES = '''function writeFiles(repoDir, files) {
  const written = [];
  for (const file of files) {
    const filePath = path.join(repoDir, file.path);
    const fileDir = path.dirname(filePath);
    
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, file.content);
    written.push(file.path);
    log.info('Wrote file', { path: file.path, bytes: file.content.length });
  }
  return written;
}'''

NEW_WRITE_FILES = '''function writeFiles(repoDir, files) {
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
      
      let fileContent = fs.readFileSync(filePath, 'utf8');
      let patchesApplied = 0;
      
      for (const patch of file.patches) {
        if (!patch.search || patch.replace === undefined) {
          log.warn('Invalid patch format', { path: file.path });
          continue;
        }
        
        if (!fileContent.includes(patch.search)) {
          log.warn('Patch search text not found', { 
            path: file.path, 
            searchPreview: patch.search.substring(0, 50) + '...'
          });
          continue;
        }
        
        const occurrences = fileContent.split(patch.search).length - 1;
        if (occurrences > 1) {
          log.warn('Patch search text not unique', { path: file.path, occurrences });
        }
        
        fileContent = fileContent.replace(patch.search, patch.replace);
        patchesApplied++;
      }
      
      if (patchesApplied > 0) {
        fs.writeFileSync(filePath, fileContent);
        written.push(file.path);
        log.info('Applied patches to file', { 
          path: file.path, 
          patchesApplied,
          totalPatches: file.patches.length
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
}'''

content = content.replace(OLD_WRITE_FILES, NEW_WRITE_FILES)
print("Replaced writeFiles with patch-aware version")

# ============================================================================
# 3. Update buildPrompt to accept existingFiles parameter and handle modify
# ============================================================================

# Find and replace the buildPrompt function signature
content = content.replace(
    'function buildPrompt(ticket) {',
    'function buildPrompt(ticket, existingFiles = {}) {'
)
print("Updated buildPrompt signature")

# Find the filesSection assignment and enhance it
OLD_FILES_SECTION = '''  const filesSection = fileHints.length > 0 ? fileHints.join('\\n') : 'Determine appropriate file structure';'''

NEW_FILES_SECTION = '''  // Parse files_to_create and files_to_modify from rag_context
  let filesToCreate = [];
  let filesToModify = [];
  
  if (ticket.rag_context) {
    try {
      const ctx = typeof ticket.rag_context === 'string' 
        ? JSON.parse(ticket.rag_context) 
        : ticket.rag_context;
      filesToCreate = ctx.files_to_create || [];
      filesToModify = ctx.files_to_modify || [];
    } catch (e) {
      log.warn('Failed to parse rag_context', { error: e.message });
    }
  }
  
  // Fallback to fileHints if no specific files
  if (filesToCreate.length === 0 && filesToModify.length === 0) {
    filesToCreate = fileHints;
  }
  
  // Build files section with CREATE vs MODIFY distinction
  let filesSection = '';
  
  if (filesToCreate.length > 0) {
    filesSection += '**Files to CREATE (new files):**\\n';
    filesSection += filesToCreate.map(f => '- ' + f).join('\\n');
    filesSection += '\\n\\n';
  }
  
  if (filesToModify.length > 0) {
    filesSection += '**Files to MODIFY (existing files - use surgical patches):**\\n';
    filesSection += filesToModify.map(f => '- ' + f).join('\\n');
    filesSection += '\\n\\n';
    
    // Include existing file contents for context
    filesSection += '**Current content of files to modify:**\\n\\n';
    for (const fp of filesToModify) {
      if (existingFiles[fp]) {
        filesSection += '<file path="' + fp + '">\\n' + existingFiles[fp] + '\\n</file>\\n\\n';
      }
    }
  }
  
  if (!filesSection) {
    filesSection = fileHints.length > 0 ? fileHints.join('\\n') : 'Determine appropriate file structure';
  }
  
  const hasModifications = filesToModify.length > 0;'''

content = content.replace(OLD_FILES_SECTION, NEW_FILES_SECTION)
print("Enhanced filesSection with CREATE/MODIFY distinction")

# ============================================================================
# 4. Update output format in buildPrompt to include modify instructions
# ============================================================================

OLD_OUTPUT_FORMAT = '''      "action": "create",'''

NEW_OUTPUT_FORMAT = '''      "action": "create",  // Use "modify" with patches array for existing files'''

content = content.replace(OLD_OUTPUT_FORMAT, NEW_OUTPUT_FORMAT, 1)

# Add modify instructions after the JSON example
OLD_IMPORTANT = '''IMPORTANT: 
- Response must be valid JSON only'''

NEW_IMPORTANT = '''### For MODIFYING existing files, use this format instead:
\\`\\`\\`json
{
  "path": "existing/file.js",
  "action": "modify",
  "patches": [
    {
      "search": "exact text to find (include 2-5 lines of context for uniqueness)",
      "replace": "replacement text"
    }
  ]
}
\\`\\`\\`

CRITICAL RULES:
- For files listed under "Files to MODIFY": Use action "modify" with patches array
- Each patch needs unique "search" text (include surrounding context)
- NEVER regenerate entire files - only output the specific patches needed
- For NEW files: Use action "create" with full content

IMPORTANT: 
- Response must be valid JSON only'''

content = content.replace(OLD_IMPORTANT, NEW_IMPORTANT)
print("Added modify instructions to output format")

# ============================================================================
# 5. Update generateCode call to pass existing files
# ============================================================================

# Find where buildPrompt is called in generateCode
OLD_PROMPT_CALL = '''  const prompt = buildPrompt(ticket);'''
NEW_PROMPT_CALL = '''  const prompt = buildPrompt(ticket, {});  // existingFiles passed from processTicket'''

content = content.replace(OLD_PROMPT_CALL, NEW_PROMPT_CALL)
print("Updated buildPrompt call in generateCode")

# ============================================================================
# Write the patched file
# ============================================================================

with open(TARGET, 'w') as f:
    f.write(content)

print(f"\\nPatched file written to: {TARGET}")
print("Run 'node --check index.js' to verify syntax")
