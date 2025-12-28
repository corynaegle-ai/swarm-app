/**
 * Sentinel Polling Implementation
 * 
 * Adds the following to /opt/swarm/engine/lib/engine.js:
 * 1. getReviewTickets() - Poll for in_review tickets
 * 2. atomicClaimReviewTicket() - Atomically claim review tickets  
 * 3. executeSentinelReview() - Run sentinel review on PR
 * 4. mergePR() - Merge approved PRs via GitHub API
 * 5. setMerged() - Transition ticket to merged state
 * 6. Modified _pollOnce() - Also poll for review tickets
 * 
 * Created: 2024-12-24
 * Purpose: Complete the in_review → merged → deployed workflow
 */

// ===========================================================================
// METHOD 1: getReviewTickets() - Add after getTicket() method (~line 400)
// ===========================================================================
const getReviewTicketsMethod = `
    /**
     * Get tickets ready for sentinel review
     * @param {number} limit - Max tickets to return
     * @returns {Promise<Array>} Review-ready tickets
     */
    async getReviewTickets(limit = 5) {
        const result = await this.pgPool.query(\`
            SELECT * FROM tickets
            WHERE state = 'in_review'
              AND assignee_id = 'sentinel-agent'
              AND assignee_type = 'agent'
              AND vm_id IS NULL
            ORDER BY updated_at ASC
            LIMIT $1
        \`, [limit]);
        return result.rows;
    }
`;

// ===========================================================================
// METHOD 2: atomicClaimReviewTicket() - Add after atomicClaimNext()
// ===========================================================================
const atomicClaimReviewTicketMethod = `
    /**
     * Atomically claim a review ticket for sentinel processing
     * @param {string} ticketId - Ticket to claim
     * @returns {Promise<Object|null>} Claimed ticket or null
     */
    async atomicClaimReviewTicket(ticketId) {
        const result = await this.pgPool.query(\`
            UPDATE tickets
            SET state = 'reviewing',
                vm_id = -1,
                last_heartbeat = NOW(),
                updated_at = NOW()
            WHERE id = $1
              AND state = 'in_review'
              AND assignee_id = 'sentinel-agent'
            RETURNING *
        \`, [ticketId]);
        
        if (result.rows[0]) {
            notifyTicketStateChange(ticketId, 'reviewing', { phase: 'sentinel' });
            await this.emitEvent(ticketId, 'sentinel_started', 'in_review', 'reviewing', {});
        }
        return result.rows[0] || null;
    }
`;

// ===========================================================================
// METHOD 3: executeSentinelReview() - Main sentinel review logic
// ===========================================================================
const executeSentinelReviewMethod = `
    /**
     * Execute sentinel review on a ticket's PR
     * Reviews the PR diff against acceptance criteria
     * If approved, merges the PR
     * 
     * @param {Object} ticket - Ticket to review
     */
    async executeSentinelReview(ticket) {
        const ticketId = ticket.id.toString();
        log('INFO', \`[SENTINEL] Starting review for \${ticketId}\`);
        
        try {
            // Claim the ticket atomically
            const claimed = await this.atomicClaimReviewTicket(ticketId);
            if (!claimed) {
                log('WARN', \`[SENTINEL] Could not claim ticket \${ticketId} - already claimed or state changed\`);
                return;
            }
            
            // Get PR URL and branch info
            const prUrl = ticket.pr_url;
            const branchName = ticket.branch_name;
            const repoUrl = ticket.repo_url || await this._getRepoUrlForTicket(ticket);
            
            if (!prUrl) {
                log('ERROR', \`[SENTINEL] No PR URL for ticket \${ticketId}\`);
                await this.setSentinelFailed(ticketId, 'No PR URL found');
                return;
            }
            
            // Call verifier with sentinel-only phase for final review
            const verifyResult = await verify({
                ticketId,
                branchName,
                repoUrl,
                attempt: 1,
                acceptanceCriteria: ticket.acceptance_criteria,
                phases: ['sentinel']
            });
            
            log('INFO', \`[SENTINEL] Review result for \${ticketId}: \${verifyResult.status}\`);
            
            if (verifyResult.status === 'passed') {
                // Sentinel approved - merge the PR
                log('INFO', \`[SENTINEL] Approved! Merging PR for \${ticketId}\`);
                
                try {
                    await this.mergePR(ticketId, prUrl, branchName);
                    log('INFO', \`[SENTINEL] PR merged successfully for \${ticketId}\`);
                } catch (mergeErr) {
                    log('ERROR', \`[SENTINEL] Merge failed for \${ticketId}: \${mergeErr.message}\`);
                    await this.setSentinelFailed(ticketId, \`Merge failed: \${mergeErr.message}\`);
                }
            } else {
                // Sentinel rejected or found issues
                log('WARN', \`[SENTINEL] Review failed for \${ticketId}: \${verifyResult.feedback_for_agent?.join(', ') || 'No feedback'}\`);
                await this.setSentinelFailed(ticketId, JSON.stringify(verifyResult));
            }
            
        } catch (err) {
            log('ERROR', \`[SENTINEL] Error reviewing \${ticketId}: \${err.message}\`);
            await this.setSentinelFailed(ticketId, err.message);
        }
    }
    
    /**
     * Get repo URL for a ticket (from project or session)
     */
    async _getRepoUrlForTicket(ticket) {
        if (ticket.repo_url) return ticket.repo_url;
        
        // Try to get from project
        if (ticket.project_id) {
            const project = await this.getProject(ticket.project_id);
            if (project?.repo_url) return project.repo_url;
        }
        
        // Try to get from HITL session
        if (ticket.design_session) {
            const result = await this.pgPool.query(
                'SELECT repo_url FROM hitl_sessions WHERE id = $1',
                [ticket.design_session]
            );
            if (result.rows[0]?.repo_url) return result.rows[0].repo_url;
        }
        
        return null;
    }
`;

// ===========================================================================
// METHOD 4: mergePR() - Merge approved PRs
// ===========================================================================
const mergePRMethod = `
    /**
     * Merge a PR via GitHub CLI
     * @param {string} ticketId - Ticket ID
     * @param {string} prUrl - Full PR URL
     * @param {string} branchName - Branch to delete after merge
     */
    async mergePR(ticketId, prUrl, branchName) {
        // Extract owner/repo/number from PR URL
        // Example: https://github.com/corynaegle-ai/swarm-app/pull/43
        const match = prUrl.match(/github\\.com\\/([^\\/]+)\\/([^\\/]+)\\/pull\\/(\\d+)/);
        if (!match) {
            throw new Error(\`Invalid PR URL format: \${prUrl}\`);
        }
        
        const [, owner, repo, prNumber] = match;
        const fullRepo = \`\${owner}/\${repo}\`;
        
        log('INFO', \`[MERGE] Merging PR #\${prNumber} in \${fullRepo}\`);
        
        // Use GitHub CLI to merge
        const mergeCmd = \`gh pr merge \${prNumber} --repo \${fullRepo} --squash --delete-branch\`;
        
        try {
            execSync(mergeCmd, {
                env: { 
                    ...process.env, 
                    GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN
                },
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 60000
            });
            
            // Update ticket state to merged
            await this.setMerged(ticketId, prUrl);
            
        } catch (err) {
            // Check if already merged
            if (err.message?.includes('already been merged') || err.stderr?.includes('already been merged')) {
                log('INFO', \`[MERGE] PR #\${prNumber} was already merged\`);
                await this.setMerged(ticketId, prUrl);
                return;
            }
            throw err;
        }
    }
`;

// ===========================================================================
// METHOD 5: setMerged() and setSentinelFailed() - State transitions
// ===========================================================================
const stateTransitionMethods = `
    /**
     * Set ticket to merged state after PR merge
     */
    async setMerged(ticketId, prUrl) {
        await this.pgPool.query(\`
            UPDATE tickets 
            SET state = 'merged',
                vm_id = NULL,
                merged_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        \`, [ticketId]);
        notifyTicketStateChange(ticketId, 'merged', { prUrl });
        await this.emitEvent(ticketId, 'merged', 'reviewing', 'merged', { prUrl });
        log('INFO', \`[STATE] Ticket \${ticketId} -> merged\`);
    }
    
    /**
     * Set ticket to sentinel_failed state
     */
    async setSentinelFailed(ticketId, reason) {
        await this.pgPool.query(\`
            UPDATE tickets 
            SET state = 'sentinel_failed',
                vm_id = NULL,
                verification_status = 'sentinel_rejected',
                updated_at = NOW()
            WHERE id = $1
        \`, [ticketId]);
        notifyTicketStateChange(ticketId, 'sentinel_failed', { reason });
        await this.emitEvent(ticketId, 'sentinel_failed', 'reviewing', 'sentinel_failed', { reason });
        log('WARN', \`[STATE] Ticket \${ticketId} -> sentinel_failed: \${reason}\`);
    }
`;

// ===========================================================================
// MODIFICATION: _pollOnce() - Add sentinel polling after forge polling
// ===========================================================================
const pollOnceModification = `
    // After the existing forge ticket polling loop, add:
    
    // =========== SENTINEL REVIEW POLLING ===========
    // Poll for in_review tickets awaiting sentinel review
    if (!this.shuttingDown) {
        const reviewTickets = await this.getReviewTickets(Math.max(1, available - dispatched));
        
        for (const ticket of reviewTickets) {
            if (this.shuttingDown) break;
            
            log('INFO', \`[SENTINEL] Found review ticket: \${ticket.id}\`);
            
            // Execute sentinel review (async, don't block polling)
            this.executeSentinelReview(ticket).catch(err => {
                log('ERROR', \`[SENTINEL] Async review error for \${ticket.id}: \${err.message}\`);
            });
            
            dispatched++;
        }
    }
`;

// ===========================================================================
// EXPORT: Full patch instructions
// ===========================================================================
console.log(`
=============================================================================
SENTINEL POLLING IMPLEMENTATION PATCH
=============================================================================

This patch adds sentinel review polling to the Swarm Engine.

FILES TO MODIFY:
- /opt/swarm/engine/lib/engine.js

METHODS TO ADD (in order):
1. getReviewTickets()      - After getTicket() method
2. atomicClaimReviewTicket() - After atomicClaimNext() method  
3. executeSentinelReview() - After _postCodeGeneration() method
4. _getRepoUrlForTicket()  - Helper for executeSentinelReview
5. mergePR()               - After executeSentinelReview
6. setMerged()             - After setNeedsReview()
7. setSentinelFailed()     - After setMerged()

MODIFICATION:
- _pollOnce() - Add sentinel polling after forge polling loop

DEPENDENCIES:
- Requires GH_TOKEN or GITHUB_TOKEN environment variable for gh CLI
- Requires gh CLI to be installed or available via execSync

=============================================================================
`);

module.exports = {
    getReviewTicketsMethod,
    atomicClaimReviewTicketMethod, 
    executeSentinelReviewMethod,
    mergePRMethod,
    stateTransitionMethods,
    pollOnceModification
};
