/**
 * RAG Client Service
 * Interfaces with the Swarm RAG Pipeline for semantic code context
 * 
 * RAG Service: http://localhost:8082 (same droplet)
 */

const RAG_BASE_URL = process.env.RAG_URL || 'http://localhost:8082';

/**
 * Fetch semantic code context for a query
 * @param {string} query - Feature description or search query
 * @param {string[]} repoUrls - Array of GitHub repository URLs to search
 * @param {Object} options - Additional options
 */
async function fetchContext(query, repoUrls, options = {}) {
  const { maxTokens = 8000 } = options;
  
  if (!repoUrls || repoUrls.length === 0) {
    return { context: '', files: [], success: false, reason: 'no_repos' };
  }

  try {
    // Get repo IDs for all URLs
    const repoIds = await Promise.all(
      repoUrls.map(url => getRepoIdByUrl(url))
    );
    const validRepoIds = repoIds.filter(id => id !== null);

    if (validRepoIds.length === 0) {
      console.log(`[RAG] No indexed repositories found for: ${repoUrls.join(', ')}`);
      return { context: '', files: [], success: false, reason: 'repos_not_indexed' };
    }

    // Fetch context from each repo and combine
    const contextParts = [];
    const allFiles = [];
    let totalTokens = 0;
    const tokensPerRepo = Math.floor(maxTokens / validRepoIds.length);

    for (const repoId of validRepoIds) {
      const response = await fetch(`${RAG_BASE_URL}/api/rag/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          repo_id: repoId,
          max_tokens: tokensPerRepo,
          include_file_list: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.context) {
          contextParts.push(data.context);
          allFiles.push(...(data.files || []));
          totalTokens += data.token_count || 0;
        }
      }
    }

    const combinedContext = contextParts.join('\n\n---\n\n');
    console.log(`[RAG] Fetched ${totalTokens} tokens from ${validRepoIds.length} repos for: "${query.slice(0, 50)}..."`);

    return {
      context: combinedContext,
      files: [...new Set(allFiles)],
      tokenCount: totalTokens,
      reposSearched: validRepoIds.length,
      success: true
    };

  } catch (error) {
    console.error('[RAG] Context fetch error:', error.message);
    return { context: '', files: [], success: false, reason: error.message };
  }
}

/**
 * Get RAG repo_id from GitHub URL
 */
async function getRepoIdByUrl(repoUrl) {
  try {
    const normalizedUrl = normalizeUrl(repoUrl);
    const response = await fetch(`${RAG_BASE_URL}/api/rag/repositories`);
    if (!response.ok) return null;

    const data = await response.json();
    const match = (data.repositories || []).find(r => 
      normalizeUrl(r.url) === normalizedUrl
    );

    return match?.id || null;
  } catch (error) {
    console.error('[RAG] Repo lookup error:', error.message);
    return null;
  }
}

/**
 * Check indexing status for multiple repositories
 * @param {string[]} repoUrls - Array of GitHub URLs
 * @returns {Promise<Object>} Status for each repo
 */
async function checkReposStatus(repoUrls) {
  try {
    const response = await fetch(`${RAG_BASE_URL}/api/rag/repositories`);
    if (!response.ok) {
      return { error: 'Failed to fetch repositories' };
    }

    const data = await response.json();
    const repos = data.repositories || [];

    const status = {};
    for (const url of repoUrls) {
      const normalized = normalizeUrl(url);
      const match = repos.find(r => normalizeUrl(r.url) === normalized);

      if (!match) {
        status[url] = { indexed: false, status: 'not_found', chunkCount: 0 };
      } else {
        status[url] = {
          indexed: match.index_status === 'ready',
          status: match.index_status,
          chunkCount: match.chunk_count || 0,
          repoId: match.id,
          progress: match.indexing_progress || null
        };
      }
    }

    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Trigger indexing for a repository
 * @param {string} repoUrl - GitHub repository URL
 * @returns {Promise<Object>}
 */
async function indexRepository(repoUrl) {
  try {
    const response = await fetch(`${RAG_BASE_URL}/api/rag/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: repoUrl })
    });

    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get indexing progress for a repository
 * @param {string} repoId - RAG repository ID
 */
async function getIndexingProgress(repoId) {
  try {
    const response = await fetch(`${RAG_BASE_URL}/api/rag/repositories/${repoId}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.repository || null;
  } catch (error) {
    return null;
  }
}

/**
 * Normalize GitHub URL for comparison
 */
function normalizeUrl(url) {
  return url
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}


/**
 * Extract all repository URLs from a HITL session
 * Handles both repo_url and supporting_repos in any format
 * @param {Object} session - HITL session object
 * @returns {string[]} Array of repository URLs
 */
function extractSessionRepoUrls(session) {
  const repoUrls = [];
  
  // Add primary repo if present
  if (session.repo_url) {
    repoUrls.push(session.repo_url);
  }
  
  // Add supporting repos - handles both object and string formats
  if (session.supporting_repos) {
    try {
      const supporting = typeof session.supporting_repos === "string"
        ? JSON.parse(session.supporting_repos)
        : session.supporting_repos;
      
      if (Array.isArray(supporting)) {
        // Handle [{url: "..."}, ...] or ["url", ...] formats
        supporting.forEach(r => {
          const url = typeof r === "string" ? r : r?.url;
          if (url) repoUrls.push(url);
        });
      }
    } catch (e) {
      console.warn("[RAG] Failed to parse supporting_repos:", e.message);
    }
  }
  
  // Deduplicate
  return [...new Set(repoUrls)];
}

/**
 * Fetch RAG context for a HITL session
 * Single entry point for all agents needing code context
 * @param {Object} session - HITL session with repo_url and/or supporting_repos
 * @param {string} query - Search query (feature description, user message, etc.)
 * @param {Object} options - { maxTokens: number }
 * @returns {Promise<Object>} RAG result with context, files, tokenCount, success
 */
async function fetchSessionContext(session, query, options = {}) {
  const repoUrls = extractSessionRepoUrls(session);
  
  if (repoUrls.length === 0) {
    return { context: "", files: [], success: false, reason: "no_repos_in_session" };
  }
  
  return fetchContext(query, repoUrls, options);
}

module.exports = {
  fetchSessionContext,
  extractSessionRepoUrls,
  fetchContext,
  getRepoIdByUrl,
  checkReposStatus,
  indexRepository,
  getIndexingProgress,
  RAG_BASE_URL
};
