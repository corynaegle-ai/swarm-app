const fs = require("fs");

// Fix 1: DesignSession.jsx - Skip modal when repo_url exists
const designSessionPath = "/opt/swarm-app/apps/dashboard/src/pages/DesignSession.jsx";
let dsContent = fs.readFileSync(designSessionPath, "utf8");

const oldHandleApprove = `const handleApprove = async () => {
    setLocalError(null);
    setShowSpecModal(false);
    try {
      await approveSpec(sessionId);
      setShowRepoModal(true);
      await fetchSession();
    } catch (err) {
      setLocalError(err.message);
    }
  };`;

const newHandleApprove = `const handleApprove = async () => {
    setLocalError(null);
    setShowSpecModal(false);
    try {
      await approveSpec(sessionId);
      
      // If session already has a repo_url, skip repo setup and go directly to build
      if (session?.repo_url) {
        // Trigger start-build directly since we have a repo
        const res = await fetch(\`/api/hitl/\${sessionId}/start-build\`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${localStorage.getItem('swarm_token')}\`
          },
          body: JSON.stringify({ confirmed: true })
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to start build');
        }
        
        // Navigate to build page
        navigate(\`/build/\${sessionId}\`);
      } else {
        // No repo_url - show modal for repo setup
        setShowRepoModal(true);
        await fetchSession();
      }
    } catch (err) {
      setLocalError(err.message);
    }
  };`;

if (dsContent.includes("skip repo setup")) {
  console.log("DesignSession.jsx already patched");
} else {
  dsContent = dsContent.replace(oldHandleApprove, newHandleApprove);
  fs.writeFileSync(designSessionPath, dsContent);
  console.log("Patched DesignSession.jsx - skip modal when repo_url exists");
}

// Fix 2: hitl.js - Generate feature branch name
const hitlPath = "/opt/swarm-app/apps/platform/routes/hitl.js";
let hitlContent = fs.readFileSync(hitlPath, "utf8");

// Add helper function after requires if not exists
const helperFunc = `
// Generate feature branch name from spec title
function generateBranchName(specTitle, projectName) {
  const base = (specTitle || projectName || 'feature')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  const timestamp = Date.now().toString(36);
  return \`feature/\${base}-\${timestamp}\`;
}
`;

if (hitlContent.includes("generateBranchName")) {
  console.log("hitl.js helper already exists");
} else {
  // Add after the last require statement
  const lastRequire = hitlContent.lastIndexOf("require(");
  const endOfLine = hitlContent.indexOf("\n", lastRequire);
  hitlContent = hitlContent.slice(0, endOfLine + 1) + helperFunc + hitlContent.slice(endOfLine + 1);
  console.log("Added generateBranchName helper to hitl.js");
}

// Replace 'main' branch with generated branch
const oldBranchLine = "        'main',";
const newBranchLine = "        generateBranchName(specCard.title, session.project_name),";

if (hitlContent.includes("generateBranchName(specCard.title")) {
  console.log("Branch generation already patched");
} else {
  // Find the INSERT into projects and replace 'main' with the function call
  const insertMatch = hitlContent.match(/INSERT INTO projects.*?VALUES\s*\([^)]+\)/s);
  if (insertMatch) {
    const insertStmt = insertMatch[0];
    if (insertStmt.includes("'main'")) {
      hitlContent = hitlContent.replace(insertStmt, insertStmt.replace("'main'", "generateBranchName(specCard.title, session.project_name)"));
      console.log("Patched hitl.js - dynamic branch name");
    }
  }
}

fs.writeFileSync(hitlPath, hitlContent);
console.log("hitl.js saved");
