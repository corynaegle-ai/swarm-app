/**
 * P1-1: Verification Retry with Exponential Backoff
 * 
 * Changes to engine.js _postCodeGeneration method:
 * - Auto-retry verification up to 3 times
 * - Exponential backoff: 1s, 2s, 4s delays
 * - Only mark needs_review after all retries exhausted
 */

// Add this constant near top of file (after imports)
const VERIFICATION_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,  // 1 second
    maxDelayMs: 8000,   // Cap at 8 seconds
    backoffMultiplier: 2
};

// Add this utility function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelay(attempt) {
    const delay = VERIFICATION_RETRY_CONFIG.baseDelayMs * 
                  Math.pow(VERIFICATION_RETRY_CONFIG.backoffMultiplier, attempt - 1);
    return Math.min(delay, VERIFICATION_RETRY_CONFIG.maxDelayMs);
}

/**
 * REPLACEMENT for _postCodeGeneration method
 * Now with automatic retry and exponential backoff
 */
async _postCodeGeneration(ticketId, branchName, repoUrl, ticket, result, attempt = 1) {
    const maxAttempts = VERIFICATION_RETRY_CONFIG.maxRetries;
    log('INFO', `Starting verification for ${ticketId} (attempt ${attempt}/${maxAttempts})`);
    
    // Update to verifying state
    await this.setVerifying(ticketId);
    
    // Update branch name if not set
    if (!ticket.branch_name) {
        await this.updateBranch(branchName, ticketId);
    }
    
    try {
        // Call verifier service
        const verifyResult = await verify({
            ticketId,
            branchName,
            repoUrl,
            attempt,
            acceptanceCriteria: ticket.acceptance_criteria,
            phases: ['static', 'automated', 'sentinel']
        });
        
        log('INFO', `Verification result for ${ticketId}: ${verifyResult.status}`);
        
        if (verifyResult.status === 'passed' || verifyResult.ready_for_pr) {
            // Verification passed - create PR
            const prUrl = await this._createPR(ticketId, branchName, repoUrl, ticket);
            const evidence = JSON.stringify(verifyResult);
            await this.setInReview(prUrl, evidence, ticketId);
            log('INFO', `PR created for ${ticketId}: ${prUrl}`);
            
        } else if (attempt < maxAttempts) {
            // Verification failed but can retry with backoff
            const delay = getRetryDelay(attempt);
            log('WARN', `Verification failed for ${ticketId}, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
            
            // Store feedback for context
            const feedback = formatFeedbackForRetry(verifyResult.feedback_for_agent);
            this.registryStmts.storeArtifact.run(
                randomUUID(), 
                ticketId, 
                `verification_feedback_attempt_${attempt}`, 
                feedback
            );
            
            // Exponential backoff delay
            await sleep(delay);
            
            // Recursive retry
            return this._postCodeGeneration(ticketId, branchName, repoUrl, ticket, result, attempt + 1);
            
        } else {
            // Max retries exhausted - mark for human review
            log('ERROR', `Max verification attempts (${maxAttempts}) exceeded for ${ticketId}`);
            const evidence = JSON.stringify({
                ...verifyResult,
                _retryExhausted: true,
                _totalAttempts: attempt
            });
            await this.setNeedsReview(evidence, ticketId);
        }
        
    } catch (e) {
        // Verification service error - also retry with backoff
        log('ERROR', `Verification error for ${ticketId}: ${e.message}`);
        
        if (attempt < maxAttempts && this._isRetryableError(e)) {
            const delay = getRetryDelay(attempt);
            log('WARN', `Retrying verification after error in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
            await sleep(delay);
            return this._postCodeGeneration(ticketId, branchName, repoUrl, ticket, result, attempt + 1);
        }
        
        // Non-retryable or exhausted - fail the ticket
        await this.failTicket(`Verification failed after ${attempt} attempts: ${e.message}`, ticketId);
    }
}

/**
 * NEW: Check if error is retryable
 */
_isRetryableError(error) {
    const retryablePatterns = [
        /timeout/i,
        /ECONNREFUSED/i,
        /ECONNRESET/i,
        /ETIMEDOUT/i,
        /rate.?limit/i,
        /429/,
        /503/,
        /502/,
        /504/
    ];
    
    const message = error.message || String(error);
    return retryablePatterns.some(pattern => pattern.test(message));
}
