/**
 * Fix: Smart branching strategy for spec approval
 * 
 * Files to modify:
 * 1. apps/dashboard/src/pages/DesignSession.jsx - Skip modal when repo_url exists
 * 2. apps/platform/routes/hitl.js - Generate feature branch, not 'main'
 * 3. apps/platform/services/ticket-generator.js - Propagate branch to tickets
 */

// ==============================================================================
// FILE 1: apps/dashboard/src/pages/DesignSession.jsx
// REPLACE handleApprove function (around line 301)
// ==============================================================================

const handleApprove = async () => {
  setLocalError(null);
  setShowSpecModal(false);
  try {
    await approveSpec(sessionId);
    
    // If session already has a repo_url, skip repo setup and go directly to build
    if (session?.repo_url) {
      // Trigger start-build directly since we have a repo
      const res = await fetch(`/api/hitl/${sessionId}/start-build`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('swarm_token')}`
        },
        body: JSON.stringify({ confirmed: true })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start build');
      }
      
      // Navigate to build page
      navigate(`/build/${sessionId}`);
    } else {
      // No repo_url - show modal for repo setup
      setShowRepoModal(true);
    }
    
    await fetchSession();
  } catch (err) {
    setLocalError(err.message);
  }
};

// ==============================================================================
// FILE 2: apps/platform/routes/hitl.js
// In start-build endpoint, replace the hardcoded 'main' branch
// Around line 364, change the project INSERT
// ==============================================================================

// Add this helper function near the top of the file:
function generateBranchName(specTitle, projectName) {
  // Create a sanitized branch name from the spec title
  const base = (specTitle || projectName || 'feature')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')      // Trim leading/trailing dashes
    .substring(0, 50);            // Limit length
  
  // Add timestamp for uniqueness
  const timestamp = Date.now().toString(36);
  return `feature/${base}-${timestamp}`;
}

// In the start-build endpoint, replace:
//   branch: 'main',
// With:
//   branch: generateBranchName(specCard.title, session.project_name),

// Also update the ticket generator call to pass the branch name

// ==============================================================================
// FILE 3: apps/platform/services/ticket-generator.js
// Propagate branch_name to all generated tickets
// ==============================================================================

// In generateTicketsFromSpec function, add branch parameter:
async function generateTicketsFromSpec(sessionId, projectId, branchName = null) {
  // ... existing code ...
  
  // When inserting tickets, include branch_name:
  // branch_name: branchName,
}

// In the INSERT statements for tickets, add branch_name column
