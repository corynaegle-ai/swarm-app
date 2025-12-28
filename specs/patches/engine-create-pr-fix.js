/**
 * Fixed _createPR method for engine.js
 * Uses GitHub REST API instead of gh CLI
 * 
 * Replace the existing _createPR method in /opt/swarm/engine/lib/engine.js
 */

    /**
     * Create PR using GitHub REST API
     * @param {string} ticketId - Ticket ID for PR title
     * @param {string} branchName - Source branch name
     * @param {string} repoUrl - Repository URL
     * @param {object} ticket - Ticket object with title, description, acceptance_criteria
     * @returns {string} PR URL
     */
    async _createPR(ticketId, branchName, repoUrl, ticket) {
        try {
            // Parse repo owner/name from URL
            const match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
            if (!match) {
                throw new Error(`Cannot parse repo URL: ${repoUrl}`);
            }
            const [, owner, repo] = match;
            const repoName = repo.replace(/\.git$/, '');
            
            // Read GitHub token
            let ghToken;
            try {
                ghToken = readFileSync('/root/.github_token', 'utf8').trim();
            } catch (e) {
                throw new Error('GitHub token not found at /root/.github_token');
            }
            
            // Build PR title and body
            const title = `feat(${ticketId}): ${ticket.title || 'Automated changes'}`;
            const body = this._buildPRBody(ticketId, ticket);
            
            // Call GitHub API to create PR
            const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ghToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    body,
                    head: branchName,
                    base: 'main'
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                
                // Handle common errors
                if (response.status === 422) {
                    // PR might already exist or no commits
                    if (error.errors?.some(e => e.message?.includes('already exists'))) {
                        // Find existing PR
                        const existingPR = await this._findExistingPR(owner, repoName, branchName, ghToken);
                        if (existingPR) {
                            log('INFO', `PR already exists for ${branchName}: ${existingPR}`);
                            return existingPR;
                        }
                    }
                    if (error.errors?.some(e => e.message?.includes('No commits'))) {
                        throw new Error(`No commits between main and ${branchName}`);
                    }
                }
                
                throw new Error(`GitHub API error (${response.status}): ${error.message || JSON.stringify(error)}`);
            }
            
            const pr = await response.json();
            log('INFO', `PR created: ${pr.html_url}`);
            
            // Add labels if available
            await this._addPRLabels(owner, repoName, pr.number, ghToken, ticket);
            
            return pr.html_url;
            
        } catch (e) {
            log('ERROR', `Failed to create PR for ${ticketId}: ${e.message}`);
            throw e; // Re-throw so caller can handle
        }
    }
    
    /**
     * Build PR body from ticket
     */
    _buildPRBody(ticketId, ticket) {
        let body = `## Automated PR from Swarm\n\n`;
        body += `**Ticket**: \`${ticketId}\`\n\n`;
        
        if (ticket.description) {
            body += `### Description\n${ticket.description}\n\n`;
        }
        
        if (ticket.acceptance_criteria) {
            body += `### Acceptance Criteria\n`;
            try {
                const criteria = typeof ticket.acceptance_criteria === 'string' 
                    ? JSON.parse(ticket.acceptance_criteria) 
                    : ticket.acceptance_criteria;
                if (Array.isArray(criteria)) {
                    criteria.forEach(c => body += `- [ ] ${c}\n`);
                } else {
                    body += `${ticket.acceptance_criteria}\n`;
                }
            } catch {
                body += `${ticket.acceptance_criteria}\n`;
            }
            body += '\n';
        }
        
        if (ticket.files_involved) {
            body += `### Files Changed\n`;
            try {
                const files = typeof ticket.files_involved === 'string'
                    ? JSON.parse(ticket.files_involved)
                    : ticket.files_involved;
                if (Array.isArray(files)) {
                    files.forEach(f => body += `- \`${f}\`\n`);
                }
            } catch {
                body += `\`${ticket.files_involved}\`\n`;
            }
            body += '\n';
        }
        
        body += `---\n*Generated by Swarm Engine*`;
        return body;
    }
    
    /**
     * Find existing PR for a branch
     */
    async _findExistingPR(owner, repo, branchName, token) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branchName}&state=open`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    }
                }
            );
            
            if (response.ok) {
                const prs = await response.json();
                if (prs.length > 0) {
                    return prs[0].html_url;
                }
            }
            return null;
        } catch {
            return null;
        }
    }
    
    /**
     * Add labels to PR based on ticket
     */
    async _addPRLabels(owner, repo, prNumber, token, ticket) {
        try {
            const labels = ['swarm-generated'];
            
            // Add scope-based label
            if (ticket.estimated_scope) {
                labels.push(`scope:${ticket.estimated_scope}`);
            }
            
            await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ labels })
            });
        } catch (e) {
            // Non-fatal - labels might not exist in repo
            log('DEBUG', `Could not add labels to PR: ${e.message}`);
        }
    }
