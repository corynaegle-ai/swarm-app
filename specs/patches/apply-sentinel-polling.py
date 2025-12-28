#!/usr/bin/env python3
"""
Apply Sentinel Polling Patch to Swarm Engine
Adds sentinel review polling and PR merge logic

Usage: python3 apply-sentinel-polling.py
"""

import re

ENGINE_PATH = '/opt/swarm/engine/lib/engine.js'

# Method 1: getReviewTickets - Insert after getTicket method
GET_REVIEW_TICKETS = '''
    /**
     * Get tickets ready for sentinel review
     * @param {number} limit - Max tickets to return
     * @returns {Promise<Array>} Review-ready tickets
     */
    async getReviewTickets(limit = 5) {
        const result = await this.pgPool.query(`
            SELECT * FROM tickets
            WHERE state = 'in_review'
              AND assignee_id = 'sentinel-agent'
              AND assignee_type = 'agent'
              AND vm_id IS NULL
            ORDER BY updated_at ASC
            LIMIT $1
        `, [limit]);
        return result.rows;
    }

    /**
     * Atomically claim a review ticket for sentinel processing
     * @param {string} ticketId - Ticket to claim
     * @returns {Promise<Object|null>} Claimed ticket or null
     */
    async atomicClaimReviewTicket(ticketId) {
        const result = await this.pgPool.query(`
            UPDATE tickets
            SET state = 'reviewing',
                vm_id = -1,
                last_heartbeat = NOW(),
                updated_at = NOW()
            WHERE id = $1
              AND state = 'in_review'
              AND assignee_id = 'sentinel-agent'
            RETURNING *
        `, [ticketId]);
        
        if (result.rows[0]) {
            notifyTicketStateChange(ticketId, 'reviewing', { phase: 'sentinel' });
            await this.emitEvent(ticketId, 'sentinel_started', 'in_review', 'reviewing', {});
        }
        return result.rows[0] || null;
    }
'''

# Method 2: State transitions - Insert after setNeedsReview
STATE_TRANSITIONS = '''
    /**
     * Set ticket to merged state after PR merge
     */
    async setMerged(ticketId, prUrl) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'merged',
                vm_id = NULL,
                merged_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        `, [ticketId]);
        notifyTicketStateChange(ticketId, 'merged', { prUrl });
        await this.emitEvent(ticketId, 'merged', 'reviewing', 'merged', { prUrl });
        log('INFO', `[STATE] Ticket ${ticketId} -> merged`);
    }
    
    /**
     * Set ticket to sentinel_failed state
     */
    async setSentinelFailed(ticketId, reason) {
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'sentinel_failed',
                vm_id = NULL,
                verification_status = 'sentinel_rejected',
                updated_at = NOW()
            WHERE id = $1
        `, [ticketId]);
        notifyTicketStateChange(ticketId, 'sentinel_failed', { reason });
        await this.emitEvent(ticketId, 'sentinel_failed', 'reviewing', 'sentinel_failed', { reason });
        log('WARN', `[STATE] Ticket ${ticketId} -> sentinel_failed: ${reason}`);
    }
'''

# Method 3: Sentinel review execution - Insert before _pollLoop
SENTINEL_REVIEW = '''
    /**
     * Execute sentinel review on a ticket's PR
     * Reviews the PR diff against acceptance criteria
     * If approved, merges the PR
     */
    async executeSentinelReview(ticket) {
        const ticketId = ticket.id.toString();
        log('INFO', `[SENTINEL] Starting review for ${ticketId}`);
        
        try {
            const claimed = await this.atomicClaimReviewTicket(ticketId);
            if (!claimed) {
                log('WARN', `[SENTINEL] Could not claim ticket ${ticketId}`);
                return;
            }
            
            const prUrl = ticket.pr_url;
            const branchName = ticket.branch_name;
            const repoUrl = ticket.repo_url || await this._getRepoUrlForTicket(ticket);
            
            if (!prUrl) {
                log('ERROR', `[SENTINEL] No PR URL for ticket ${ticketId}`);
                await this.setSentinelFailed(ticketId, 'No PR URL found');
                return;
            }
            
            // Call verifier with sentinel-only phase
            const verifyResult = await verify({
                ticketId,
                branchName,
                repoUrl,
                attempt: 1,
                acceptanceCriteria: ticket.acceptance_criteria,
                phases: ['sentinel']
            });
            
            log('INFO', `[SENTINEL] Review result for ${ticketId}: ${verifyResult.status}`);
            
            if (verifyResult.status === 'passed') {
                log('INFO', `[SENTINEL] Approved! Merging PR for ${ticketId}`);
                try {
                    await this.mergePR(ticketId, prUrl, branchName);
                } catch (mergeErr) {
                    log('ERROR', `[SENTINEL] Merge failed for ${ticketId}: ${mergeErr.message}`);
                    await this.setSentinelFailed(ticketId, `Merge failed: ${mergeErr.message}`);
                }
            } else {
                const feedback = verifyResult.feedback_for_agent?.join(', ') || 'No feedback';
                log('WARN', `[SENTINEL] Review failed for ${ticketId}: ${feedback}`);
                await this.setSentinelFailed(ticketId, JSON.stringify(verifyResult));
            }
        } catch (err) {
            log('ERROR', `[SENTINEL] Error reviewing ${ticketId}: ${err.message}`);
            await this.setSentinelFailed(ticketId, err.message);
        }
    }
    
    /**
     * Get repo URL for a ticket (from project or session)
     */
    async _getRepoUrlForTicket(ticket) {
        if (ticket.repo_url) return ticket.repo_url;
        if (ticket.project_id) {
            const project = await this.getProject(ticket.project_id);
            if (project?.repo_url) return project.repo_url;
        }
        if (ticket.design_session) {
            const result = await this.pgPool.query(
                'SELECT repo_url FROM hitl_sessions WHERE id = $1',
                [ticket.design_session]
            );
            if (result.rows[0]?.repo_url) return result.rows[0].repo_url;
        }
        return null;
    }
    
    /**
     * Merge a PR via GitHub CLI
     */
    async mergePR(ticketId, prUrl, branchName) {
        const match = prUrl.match(/github\\.com\\/([^\\/]+)\\/([^\\/]+)\\/pull\\/(\\d+)/);
        if (!match) throw new Error(`Invalid PR URL: ${prUrl}`);
        
        const [, owner, repo, prNumber] = match;
        const fullRepo = `${owner}/${repo}`;
        
        log('INFO', `[MERGE] Merging PR #${prNumber} in ${fullRepo}`);
        
        const mergeCmd = `gh pr merge ${prNumber} --repo ${fullRepo} --squash --delete-branch`;
        
        try {
            execSync(mergeCmd, {
                env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN },
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 60000
            });
            await this.setMerged(ticketId, prUrl);
        } catch (err) {
            if (err.message?.includes('already been merged') || err.stderr?.toString().includes('already been merged')) {
                log('INFO', `[MERGE] PR #${prNumber} was already merged`);
                await this.setMerged(ticketId, prUrl);
                return;
            }
            throw err;
        }
    }

'''

# Sentinel polling addition to _pollOnce
SENTINEL_POLL_CODE = '''
        // =========== SENTINEL REVIEW POLLING ===========
        if (!this.shuttingDown) {
            const reviewTickets = await this.getReviewTickets(Math.max(1, available - dispatched));
            for (const ticket of reviewTickets) {
                if (this.shuttingDown) break;
                log('INFO', `[SENTINEL] Found review ticket: ${ticket.id}`);
                this.executeSentinelReview(ticket).catch(err => {
                    log('ERROR', `[SENTINEL] Async review error for ${ticket.id}: ${err.message}`);
                });
                dispatched++;
            }
        }
        
        return dispatched;'''

def apply_patch():
    print("[1/5] Reading engine.js...")
    with open(ENGINE_PATH, 'r') as f:
        content = f.read()
    
    # Backup
    with open(ENGINE_PATH + '.bak-sentinel', 'w') as f:
        f.write(content)
    print("      Backup created: engine.js.bak-sentinel")
    
    # Check if already patched
    if 'getReviewTickets' in content:
        print("[!] Engine already contains sentinel polling. Skipping patch.")
        return
    
    # Step 2: Add getReviewTickets after getTicket method
    print("[2/5] Adding getReviewTickets and atomicClaimReviewTicket...")
    # Find getTicket method and insert after it
    pattern = r'(async getTicket\(ticketId\) \{[^}]+\})'
    match = re.search(pattern, content)
    if match:
        insert_pos = match.end()
        content = content[:insert_pos] + GET_REVIEW_TICKETS + content[insert_pos:]
        print("      Added after getTicket()")
    else:
        print("[!] Could not find getTicket method - trying alternative location")
        # Insert after getProject method instead
        pattern = r'(async getProject\(projectId\) \{[^}]+\})'
        match = re.search(pattern, content)
        if match:
            insert_pos = match.end()
            content = content[:insert_pos] + GET_REVIEW_TICKETS + content[insert_pos:]
            print("      Added after getProject()")
    
    # Step 3: Add state transition methods after setNeedsReview
    print("[3/5] Adding setMerged and setSentinelFailed...")
    pattern = r'(async setNeedsReview\(evidence, ticketId\) \{[^}]+await this\.emitEvent[^}]+\})'
    match = re.search(pattern, content)
    if match:
        insert_pos = match.end()
        content = content[:insert_pos] + STATE_TRANSITIONS + content[insert_pos:]
        print("      Added after setNeedsReview()")
    else:
        print("[!] Could not find setNeedsReview - trying alternative")
        # Find setVerifying and add before it
        idx = content.find('async setVerifying(ticketId)')
        if idx > 0:
            content = content[:idx] + STATE_TRANSITIONS + '\n    ' + content[idx:]
            print("      Added before setVerifying()")
    
    # Step 4: Add sentinel review methods before _pollLoop
    print("[4/5] Adding executeSentinelReview and mergePR...")
    pattern = r'(/\*\*\s*\n\s*\* Main polling loop)'
    match = re.search(pattern, content)
    if match:
        insert_pos = match.start()
        content = content[:insert_pos] + SENTINEL_REVIEW + '\n    ' + content[insert_pos:]
        print("      Added before _pollLoop()")
    else:
        print("[!] Could not find _pollLoop - adding before class end")
        # Find last method and add after
        idx = content.rfind('    async ')
        if idx > 0:
            # Find end of that method
            end_idx = content.find('\n    }', idx) + 6
            content = content[:end_idx] + SENTINEL_REVIEW + content[end_idx:]
            print("      Added at end of class methods")
    
    # Step 5: Modify _pollOnce to add sentinel polling
    print("[5/5] Modifying _pollOnce to add sentinel polling...")
    # Find the return statement in _pollOnce
    pattern = r'(\n        return dispatched;\n    \}\n\n    /\*\*\n     \* Execute a single ticket)'
    match = re.search(pattern, content)
    if match:
        # Replace just the return statement
        old_return = '\n        return dispatched;\n'
        new_return = SENTINEL_POLL_CODE + '\n'
        
        # Find _pollOnce method and replace its return
        poll_once_start = content.find('async _pollOnce()')
        if poll_once_start > 0:
            poll_once_end = content.find('\n    /**\n     * Execute a single ticket', poll_once_start)
            if poll_once_end > 0:
                poll_once_content = content[poll_once_start:poll_once_end]
                # Replace return dispatched in this section
                if 'return dispatched;' in poll_once_content and '// =========== SENTINEL REVIEW POLLING' not in poll_once_content:
                    new_poll_once = poll_once_content.replace('return dispatched;', SENTINEL_POLL_CODE.strip())
                    content = content[:poll_once_start] + new_poll_once + content[poll_once_end:]
                    print("      Modified _pollOnce() to include sentinel polling")
                else:
                    print("[!] _pollOnce already modified or return not found")
    else:
        print("[!] Could not locate _pollOnce return statement")
    
    # Write modified content
    print("\n[*] Writing patched engine.js...")
    with open(ENGINE_PATH, 'w') as f:
        f.write(content)
    
    print("[✓] Patch applied successfully!")
    print("\n[!] Remember to restart the engine: pm2 restart swarm-engine")

if __name__ == '__main__':
    apply_patch()
