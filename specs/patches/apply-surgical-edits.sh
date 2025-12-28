#!/bin/bash
# Apply surgical edits patch to FORGE agent
# Run from: /opt/swarm-app/apps/agents/coder/

set -e

TARGET="index.js"
BACKUP="index.js.bak-$(date +%Y%m%d_%H%M%S)"

echo "Creating backup: $BACKUP"
cp "$TARGET" "$BACKUP"

# Create the new functions in a temp file
cat > /tmp/surgical-patch.js << 'ENDPATCH'

// ============================================================================
// NEW: Fetch existing file content for surgical edits
// ============================================================================
function fetchExistingFileContent(repoDir, filePath, maxLines = 300) {
  const fullPath = path.join(repoDir, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length > maxLines) {
    const headLines = lines.slice(0, Math.floor(maxLines / 2));
    const tailLines = lines.slice(-Math.floor(maxLines / 2));
    return headLines.join('\n') + 
      '\n\n... [' + (lines.length - maxLines) + ' lines truncated] ...\n\n' + 
      tailLines.join('\n');
  }
  
  return content;
}

ENDPATCH

echo "Patch file created"
echo "Manual steps required - see patches/forge-surgical-edits.js for full implementation"
