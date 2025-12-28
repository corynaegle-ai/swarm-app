const simpleGit = require('simple-git');
const claude = require('../claude-client');
// Global fetch is available in Node 22+

// I need to use native fetch if node 18+ or check what other files use.
// 'apps/platform/services/ticket-generator.js' uses 'fetch' (global).
// 'apps/agents/coder/index.js' uses 'process.env' and native fetch?
// Let's assume global fetch is available (Node 22).

/**
 * Run Sentinel AI Verification Phase
 * 1. Get diff of changes
 * 2. Fetch RAG context (if needed)
 * 3. LLM Review against acceptance criteria
 */
async function run(repoPath, ticket, baseBranch, acceptanceCriteria) {
    const git = simpleGit(repoPath);
    const ticketId = ticket?.id || 'UNKNOWN';

    console.log(`[Sentinel] Starting AI review for ${ticketId}`);

    try {
        // 1. Get Diff
        const diff = await git.diff([baseBranch || 'main', 'HEAD']);
        if (!diff) {
            console.log('[Sentinel] No diff found (empty changes)');
            return {
                status: 'passed',
                decision: 'APPROVE',
                score: 100,
                issues: { critical: [], major: [] },
                summary: 'No code changes detected.'
            };
        }

        // Limit diff size
        const MAX_DIFF_LENGTH = 15000;
        const truncatedDiff = diff.length > MAX_DIFF_LENGTH
            ? diff.substring(0, MAX_DIFF_LENGTH) + '\n... [truncated]'
            : diff;

        // 2. Prepare Context (RAG)
        // We use the ticket's existing RAG context if available, plus the description
        let context = '';
        if (ticket?.rag_context?.snippets) {
            context = ticket.rag_context.snippets
                .map(s => `// File: ${s.file}\n${s.content}`)
                .join('\n\n');
        }

        // 3. Build Prompt
        let criteriaList = acceptanceCriteria;
        if (typeof criteriaList === 'string') {
            try {
                criteriaList = JSON.parse(criteriaList);
            } catch (e) {
                criteriaList = [criteriaList];
            }
        }

        const systemPrompt = `You are Sentinel, a senior code reviewer and security auditor.
Your job is to verify that the provided code changes:
1. Satisfy the Acceptance Criteria completely.
2. Follow existing code patterns (based on provided context).
3. Do not introduce security vulnerabilities or sloppy code.

Return a JSON decision object:
{
  "status": "passed" | "failed",
  "decision": "APPROVE" | "REQUEST_CHANGES",
  "score": number (0-100),
  "issues": {
    "critical": [{ "file": string, "line": number, "issue": string }],
    "major": [] 
  },
  "summary": "Brief summary of review"
}

CRITICAL: Fail (REQUEST_CHANGES) if:
- Acceptance criteria are NOT met.
- Security vulnerabilities are found.
- Code breaks existing patterns significantly.
- "placeholder" comments or incomplete code are found.
`;

        const userPrompt = `
Review this implementation for Ticket ${ticketId}: "${ticket?.title || 'Untitled'}"

## Description
${ticket?.description || 'No description provided.'}

## Acceptance Criteria
${JSON.stringify(criteriaList || [], null, 2)}

## Reference Code (Patterns to follow)
${context ? context.substring(0, 5000) : 'No reference context provided.'}

## Code Changes (Diff)
\`\`\`diff
${truncatedDiff}
\`\`\`
`;

        // 4. Call Claude
        console.log('[Sentinel] Sending to Claude...');
        const response = await claude.chat({
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 2000
        });

        if (!response.success) {
            throw new Error(`Claude API failed: ${response.error}`);
        }

        const result = claude.parseJsonResponse(response.content);
        if (!result) {
            throw new Error('Failed to parse Claude JSON response');
        }

        console.log(`[Sentinel] Decision: ${result.decision} (Score: ${result.score})`);
        return result;

    } catch (error) {
        console.error('[Sentinel] Phase failed:', error);
        // Fallback to warning but don't crash pipeline? 
        // Or fail the phase? Fail is safer.
        return {
            status: 'failed',
            decision: 'SYSTEM_ERROR',
            score: 0,
            issues: {
                critical: [{ file: 'SYSTEM', line: 0, issue: error.message }],
                major: []
            },
            summary: `System error during review: ${error.message}`
        };
    }
}

module.exports = { run };
