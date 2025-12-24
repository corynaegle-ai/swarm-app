/**
 * GitHub Context Fetcher
 * 
 * Fetches content from GitHub URLs:
 * - Repository README
 * - File content
 * - PR/Issue descriptions
 */

const GITHUB_API = 'https://api.github.com';

// System PAT for public repos (fallback)
const GITHUB_PAT = process.env.GITHUB_PAT || null;

function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (GITHUB_PAT) {
    headers['Authorization'] = `Bearer ${GITHUB_PAT}`;
  }
  return headers;
}

async function fetchGitHubContext(url, gitMetadata) {
  try {
    const metadata = typeof gitMetadata === 'string' 
      ? JSON.parse(gitMetadata) 
      : gitMetadata;

    if (!metadata?.owner || !metadata?.repo) {
      return { success: false, error: 'Invalid GitHub metadata' };
    }

    const { owner, repo, type } = metadata;

    // Determine what to fetch based on URL type
    if (type === 'pr') {
      return await fetchPRContent(url, owner, repo);
    } else if (type === 'issue') {
      return await fetchIssueContent(url, owner, repo);
    } else if (url.includes('/blob/') || url.includes('/raw/')) {
      return await fetchFileContent(url, owner, repo);
    } else {
      // Default: fetch README
      return await fetchRepoReadme(owner, repo);
    }
  } catch (err) {
    console.error('[GitHubContext] Error:', err.message);
    return { success: false, error: err.message };
  }
}

async function fetchRepoReadme(owner, repo) {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/readme`,
      { headers: getHeaders() }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return { success: true, type: 'readme', content: 'No README found for this repository.' };
      }
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    return {
      success: true,
      type: 'readme',
      content: `# README from ${owner}/${repo}\n\n${content}`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchFileContent(url, owner, repo) {
  try {
    // Extract file path from URL
    // URL format: github.com/owner/repo/blob/branch/path/to/file
    const match = url.match(/\/blob\/[^\/]+\/(.+)$/);
    if (!match) {
      return { success: false, error: 'Could not parse file path from URL' };
    }
    
    const filePath = match[1];
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: getHeaders() }
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const data = await res.json();
    
    if (data.type !== 'file') {
      return { success: false, error: 'Path is not a file' };
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    return {
      success: true,
      type: 'file',
      content: `# File: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchPRContent(url, owner, repo) {
  try {
    // Extract PR number from URL
    const match = url.match(/\/pull\/(\d+)/);
    if (!match) {
      return { success: false, error: 'Could not parse PR number from URL' };
    }
    
    const prNumber = match[1];
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers: getHeaders() }
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const pr = await res.json();
    
    let content = `# Pull Request #${prNumber}: ${pr.title}\n\n`;
    content += `**State:** ${pr.state}\n`;
    content += `**Author:** ${pr.user?.login || 'Unknown'}\n`;
    content += `**Branch:** ${pr.head?.ref} → ${pr.base?.ref}\n\n`;
    
    if (pr.body) {
      content += `## Description\n\n${pr.body}\n`;
    }

    return { success: true, type: 'pr', content };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchIssueContent(url, owner, repo) {
  try {
    // Extract issue number from URL
    const match = url.match(/\/issues\/(\d+)/);
    if (!match) {
      return { success: false, error: 'Could not parse issue number from URL' };
    }
    
    const issueNumber = match[1];
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`,
      { headers: getHeaders() }
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const issue = await res.json();
    
    let content = `# Issue #${issueNumber}: ${issue.title}\n\n`;
    content += `**State:** ${issue.state}\n`;
    content += `**Author:** ${issue.user?.login || 'Unknown'}\n`;
    
    if (issue.labels?.length > 0) {
      content += `**Labels:** ${issue.labels.map(l => l.name).join(', ')}\n`;
    }
    content += '\n';
    
    if (issue.body) {
      content += `## Description\n\n${issue.body}\n`;
    }

    return { success: true, type: 'issue', content };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { fetchGitHubContext };
