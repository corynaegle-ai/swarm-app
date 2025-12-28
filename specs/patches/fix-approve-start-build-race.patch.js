/**
 * Fix: Approve → Start Build Race Condition
 * 
 * Problem: handleApprove() checks session?.repo_url from React state,
 * which may be stale or not yet hydrated after page navigation.
 * 
 * Solution: Fetch fresh session data after approve to ensure repo_url
 * is checked against current database state.
 * 
 * File: /opt/swarm-app/apps/dashboard/src/pages/DesignSession.jsx
 */

// FIND this code block (lines ~301-335):
const OLD_CODE = `
  // Approve spec
  const handleApprove = async () => {
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
  };
`;

// REPLACE with:
const NEW_CODE = `
  // Approve spec
  const handleApprove = async () => {
    setLocalError(null);
    setShowSpecModal(false);
    try {
      await approveSpec(sessionId);
      
      // Fetch fresh session data to ensure repo_url check is against current DB state
      // This prevents race conditions where React state is stale after navigation
      const freshData = await getSession(sessionId);
      const freshSession = freshData.session;
      setSession(freshSession);
      
      // If session has a repo_url, skip repo setup and go directly to build
      if (freshSession?.repo_url) {
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
      }
    } catch (err) {
      console.error('[handleApprove] Error:', err);
      setLocalError(err.message);
    }
  };
`;

module.exports = { OLD_CODE, NEW_CODE };
