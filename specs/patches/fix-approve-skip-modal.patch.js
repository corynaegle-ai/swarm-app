/**
 * Fix: Skip RepoSetupModal when session.repo_url already exists
 * 
 * File: apps/dashboard/src/pages/DesignSession.jsx
 * Function: handleApprove (around line 301)
 */

// REPLACE the handleApprove function with this:

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
