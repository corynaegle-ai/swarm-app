/**
 * Verifier Client
 * HTTP client for Swarm Verifier service integration
 * 
 * Used by: SwarmEngine._executeAsync()
 * Phase: 7 - Agent Integration
 */

const VERIFIER_URL = process.env.VERIFIER_URL || 'http://localhost:8090';
const MAX_VERIFICATION_ATTEMPTS = 3;

/**
 * Call verifier service to validate generated code
 * 
 * @param {Object} params
 * @param {string} params.ticketId - Ticket identifier
 * @param {string} params.branchName - Git branch with generated code
 * @param {string} params.repoUrl - Repository URL
 * @param {number} params.attempt - Current attempt number (1-3)
 * @param {Object} params.acceptanceCriteria - Ticket acceptance criteria
 * @param {string[]} params.phases - Phases to run ['static', 'automated', 'sentinel']
 * @returns {Promise<Object>} Verification result
 */
export async function verify(params) {
  const {
    ticketId,
    branchName,
    repoUrl,
    attempt = 1,
    acceptanceCriteria = null,
    phases = ['static', 'automated', 'sentinel']
  } = params;

  const requestBody = {
    ticket_id: ticketId,
    branch_name: branchName,
    repo_url: repoUrl,
    attempt: attempt,
    phases: phases
  };

  if (acceptanceCriteria) {
    requestBody.acceptance_criteria = acceptanceCriteria;
  }

  try {
    const response = await fetch(`${VERIFIER_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Verifier returned ${response.status}: ${errText}`);
    }

    return await response.json();
  } catch (err) {
    // Return structured error for consistent handling
    return {
      ticket_id: ticketId,
      status: 'error',
      error: err.message,
      phases_completed: [],
      ready_for_pr: false,
      feedback_for_agent: [`Verification service error: ${err.message}`]
    };
  }
}

/**
 * Check verifier service health
 * @returns {Promise<boolean>}
 */
export async function isVerifierHealthy() {
  try {
    const response = await fetch(`${VERIFIER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Format feedback array into prompt context for agent retry
 * 
 * @param {string[]} feedback - Array of feedback messages
 * @returns {string} Formatted prompt context
 */
export function formatFeedbackForRetry(feedback) {
  if (!feedback || feedback.length === 0) {
    return 'No specific feedback provided.';
  }

  return `
## Verification Failed - Please Fix:

${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Please address ALL issues above before regenerating code.
`;
}

export const MAX_ATTEMPTS = MAX_VERIFICATION_ATTEMPTS;
