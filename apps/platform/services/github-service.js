/**
 * GitHub Service - Repository management
 * 
 * Handles creating repos in swarmstack-projects org
 * and validating user-provided PATs for linked repos
 */

const GITHUB_API = 'https://api.github.com';
const MANAGED_ORG = 'swarmstack-projects';

class GitHubService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get system PAT for creating managed repos
   */
  getSystemPAT() {
    const secret = this.db.prepare(
      "SELECT value FROM secrets WHERE type = 'github_system_pat'"
    ).get();
    return secret?.value || null;
  }

  /**
   * Create a repo in the managed org
   */
  async createManagedRepo(name, description, isPrivate = true) {
    const pat = this.getSystemPAT();
    if (!pat) {
      throw new Error('GitHub system PAT not configured. Add it via /api/secrets/github_system_pat');
    }

    const repoName = this.sanitizeRepoName(name);
    
    const response = await fetch(`${GITHUB_API}/orgs/${MANAGED_ORG}/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: description || '',
        private: isPrivate,
        auto_init: true,  // Creates with README
        has_issues: false,
        has_projects: false,
        has_wiki: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 422 && error.errors?.some(e => e.message?.includes('already exists'))) {
        throw new Error(`Repository '${repoName}' already exists in ${MANAGED_ORG}`);
      }
      throw new Error(`GitHub API error: ${error.message || response.statusText}`);
    }

    const repo = await response.json();
    return {
      owner: MANAGED_ORG,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      private: repo.private
    };
  }

  /**
   * Validate a user-provided PAT can access a repo
   */
  async validateUserRepo(repoUrl, pat) {
    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) {
      throw new Error('Invalid repository URL. Expected format: github.com/owner/repo');
    }

    const response = await fetch(`${GITHUB_API}/repos/${parsed.owner}/${parsed.name}`, {
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid or expired GitHub token');
      }
      if (response.status === 404) {
        throw new Error('Repository not found or token lacks access');
      }
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const repo = await response.json();
    
    // Check we have push access
    if (!repo.permissions?.push) {
      throw new Error('Token does not have push access to this repository');
    }

    return {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      private: repo.private,
      permissions: repo.permissions
    };
  }

  /**
   * Parse GitHub URL to extract owner/name
   */
  parseRepoUrl(url) {
    // Handle various formats:
    // https://github.com/owner/repo
    // github.com/owner/repo
    // git@github.com:owner/repo.git
    // owner/repo
    
    const patterns = [
      /github\.com[\/:]([^\/]+)\/([^\/\s\.]+)/,  // URL or SSH format
      /^([^\/\s]+)\/([^\/\s]+)$/                  // owner/repo format
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], name: match[2].replace(/\.git$/, '') };
      }
    }
    return null;
  }

  /**
   * Sanitize repo name for GitHub
   */
  sanitizeRepoName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')  // Replace non-alphanumeric with dash
      .replace(/-+/g, '-')          // Collapse multiple dashes
      .replace(/^-|-$/g, '')        // Trim leading/trailing dashes
      .substring(0, 100);           // GitHub limit
  }
}

module.exports = { GitHubService };
