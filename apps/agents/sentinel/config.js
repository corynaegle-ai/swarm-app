require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3006,
    REPOS_BASE_PATH: process.env.REPOS_BASE_PATH || '/tmp/swarm-sentinel-repos',
    AGENT_ID: process.env.AGENT_ID || 'sentinel-agent-01',
    TICKET_API_URL: process.env.TICKET_API_URL || 'http://localhost:3002',
    AGENT_SERVICE_KEY: process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev',
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    PG_HOST: process.env.PG_HOST || 'localhost',
    PG_PORT: process.env.PG_PORT || 5432,
    PG_USER: process.env.PG_USER || 'swarm',
    PG_PASSWORD: process.env.PG_PASSWORD || 'swarm_dev_2024',
    PG_DB: process.env.PG_DB || 'swarmdb'
};
