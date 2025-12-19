/**
 * Session RAG Service
 * Shared utility for extracting repo URLs and fetching RAG context from HITL sessions.
 * All agents should use this instead of duplicating URL extraction logic.
 */

const { fetchContext } = require("./rag-client");

/**
 * Extract all repository URLs from a session
 * @param {Object} session - HITL session object
 * @returns {string[]} Array of repository URLs
 */
function getSessionRepoUrls(session) {
  const repoUrls = [];
  
  // Primary repo
  if (session.repo_url) {
    repoUrls.push(session.repo_url);
  }
  
  // Supporting repos (handles both object and string array formats)
  if (session.supporting_repos) {
    try {
      const supporting = typeof session.supporting_repos === "string"
        ? JSON.parse(session.supporting_repos)
        : session.supporting_repos;
      
      if (Array.isArray(supporting)) {
        supporting.forEach(r => {
          const url = typeof r === "string" ? r : r?.url;
          if (url) repoUrls.push(url);
        });
      }
    } catch (e) {
      console.warn("[SessionRAG] Failed to parse supporting_repos:", e.message);
    }
  }
  
  return repoUrls;
}

/**
 * Fetch RAG context for a session
 * @param {Object} session - HITL session object
 * @param {string} query - Search query for RAG
 * @param {Object} options - Options (maxTokens, etc)
 * @returns {Promise<{success: boolean, context: string, tokenCount: number, reposSearched: number}>}
 */
async function fetchSessionContext(session, query, options = {}) {
  const { maxTokens = 8000 } = options;
  const repoUrls = getSessionRepoUrls(session);
  
  if (repoUrls.length === 0) {
    return { success: false, context: "", tokenCount: 0, reposSearched: 0, reason: "no_repos" };
  }
  
  if (!query || query.trim().length === 0) {
    return { success: false, context: "", tokenCount: 0, reposSearched: 0, reason: "no_query" };
  }
  
  const result = await fetchContext(query, repoUrls, { maxTokens });
  return result;
}

module.exports = {
  getSessionRepoUrls,
  fetchSessionContext
};
