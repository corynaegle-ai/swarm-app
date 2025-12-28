#!/usr/bin/env python3
"""
Complete the surgical edits integration in processTicket
"""
import re
from datetime import datetime

TARGET = '/opt/swarm-app/apps/agents/coder/index.js'

with open(TARGET, 'r') as f:
    content = f.read()

backup_name = f"{TARGET}.bak-{datetime.now().strftime('%Y%m%d_%H%M%S')}"
with open(backup_name, 'w') as f:
    f.write(content)
print(f"Backup created: {backup_name}")

# ============================================================================
# 1. Update generateCode signature to accept existingFiles
# ============================================================================

content = content.replace(
    'async function generateCode(ticket, heartbeatFn, projectSettings = {}) {\n  const prompt = buildPrompt(ticket, {});',
    'async function generateCode(ticket, heartbeatFn, projectSettings = {}, existingFiles = {}) {\n  const prompt = buildPrompt(ticket, existingFiles);'
)
print("Updated generateCode signature")

# ============================================================================
# 2. Update generateCodeWithRetry similarly
# ============================================================================

content = content.replace(
    'async function generateCodeWithRetry(ticket, heartbeatFn, projectSettings, previousResult, validationErrors) {',
    'async function generateCodeWithRetry(ticket, heartbeatFn, projectSettings, previousResult, validationErrors, existingFiles = {}) {'
)
print("Updated generateCodeWithRetry signature")

# Also need to update the buildPrompt call in generateCodeWithRetry
# First find where it's used
if 'buildRetryPrompt(ticket,' in content:
    # The retry prompt builder might need existingFiles too
    content = content.replace(
        'function buildRetryPrompt(ticket, previousResult, validationErrors) {\n  const basePrompt = buildPrompt(ticket);',
        'function buildRetryPrompt(ticket, previousResult, validationErrors, existingFiles = {}) {\n  const basePrompt = buildPrompt(ticket, existingFiles);'
    )
    print("Updated buildRetryPrompt signature")

# ============================================================================
# 3. Add file fetching after cloneAndBranch in processTicket
# ============================================================================

OLD_CLONE_SECTION = '''    const cloneResult = await cloneAndBranch(ticket);
    repoDir = cloneResult.repoDir;
    branchName = cloneResult.branchName;
    log.info('Cloned repo', { branch: branchName });
    
    // RETRY LOOP'''

NEW_CLONE_SECTION = '''    const cloneResult = await cloneAndBranch(ticket);
    repoDir = cloneResult.repoDir;
    branchName = cloneResult.branchName;
    log.info('Cloned repo', { branch: branchName });
    
    // Fetch existing file content for files_to_modify
    const existingFiles = {};
    if (ticket.rag_context) {
      try {
        const ctx = typeof ticket.rag_context === 'string' 
          ? JSON.parse(ticket.rag_context) 
          : ticket.rag_context;
        const filesToModify = ctx.files_to_modify || [];
        for (const filePath of filesToModify) {
          const fileContent = fetchExistingFileContent(repoDir, filePath);
          if (fileContent) {
            existingFiles[filePath] = fileContent;
            log.info('Fetched existing file for modification', { path: filePath, lines: fileContent.split('\\n').length });
          } else {
            log.warn('File to modify not found', { path: filePath });
          }
        }
      } catch (e) {
        log.warn('Failed to fetch existing files', { error: e.message });
      }
    }
    
    // RETRY LOOP'''

content = content.replace(OLD_CLONE_SECTION, NEW_CLONE_SECTION)
print("Added file fetching after cloneAndBranch")

# ============================================================================
# 4. Pass existingFiles to generateCode and generateCodeWithRetry calls
# ============================================================================

content = content.replace(
    'result = await generateCode(ticket, heartbeatFn, projectSettings);',
    'result = await generateCode(ticket, heartbeatFn, projectSettings, existingFiles);'
)
print("Updated generateCode call")

content = content.replace(
    'result = await generateCodeWithRetry(ticket, heartbeatFn, projectSettings, lastResult, lastValidationErrors);',
    'result = await generateCodeWithRetry(ticket, heartbeatFn, projectSettings, lastResult, lastValidationErrors, existingFiles);'
)
print("Updated generateCodeWithRetry call")

# ============================================================================
# 5. Update the buildRetryPrompt call in generateCodeWithRetry
# ============================================================================

# Find and update the call
content = content.replace(
    'const retryPrompt = buildRetryPrompt(ticket, previousResult, validationErrors);',
    'const retryPrompt = buildRetryPrompt(ticket, previousResult, validationErrors, existingFiles);'
)
print("Updated buildRetryPrompt call")

# Write result
with open(TARGET, 'w') as f:
    f.write(content)

print(f"\nPatched file written to: {TARGET}")
print("Run 'node --check index.js' to verify syntax")
