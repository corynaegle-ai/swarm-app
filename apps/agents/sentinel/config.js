const path = require('path');
const os = require('os');

module.exports = {
    PORT: process.env.PORT || 3006,
    REPOS_BASE_PATH: process.env.REPOS_BASE_PATH || path.join(os.tmpdir(), 'swarm-sentinel-repos'),
    DB_PATH: process.env.DB_PATH || path.join(__dirname, 'verification.db'),
    AGENT_ID: process.env.AGENT_ID || 'sentinel-agent-01',
    TICKET_API_URL: process.env.TICKET_API_URL || 'http://localhost:3002',
    AGENT_SERVICE_KEY: process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev'
};
