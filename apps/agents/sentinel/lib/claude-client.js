/**
 * Claude Client for Sentinel Agent
 * Direct integration with Anthropic API for code verification
 */

const https = require('https');

// Reuse platform key if available, or allow local override
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_MODEL = 'claude-3-haiku-20240307';

/**
 * Send chat completion request to Claude
 */
async function chat({ messages, system, model = DEFAULT_MODEL, maxTokens = 4096, temperature = 0 }) {
    if (!ANTHROPIC_API_KEY) {
        return { success: false, error: 'Missing ANTHROPIC_API_KEY' };
    }

    const body = {
        model,
        messages,
        system,
        max_tokens: maxTokens,
        temperature
    };

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);

                    if (res.statusCode !== 200) {
                        return resolve({
                            success: false,
                            error: response.error?.message || `API Error ${res.statusCode}`
                        });
                    }

                    if (!response.content || !response.content[0]) {
                        return resolve({ success: false, error: 'Empty response from Claude' });
                    }

                    resolve({
                        success: true,
                        content: response.content[0].text,
                        usage: response.usage
                    });
                } catch (e) {
                    resolve({ success: false, error: 'Failed to parse response: ' + e.message });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Extract JSON from Claude's response (handles markdown wrapping)
 */
function parseJsonResponse(content) {
    try {
        // 1. Try direct parse
        return JSON.parse(content);
    } catch (e) {
        // 2. Try extracting from markdown blocks
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
            try {
                return JSON.parse(match[1]);
            } catch (e2) {
                return null;
            }
        }
        return null;
    }
}

module.exports = { chat, parseJsonResponse };
