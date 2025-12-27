module.exports = {
    apps: [
        // --- CORE PLATFORM ---
        {
            name: 'swarm-platform-dev',
            cwd: '/opt/swarm-app/apps/platform',
            script: 'server.js',
            env_file: '/opt/swarm-app/apps/platform/.env',
            env: {
                NODE_ENV: 'development',
                PORT: 3002
            }
        },
        {
            name: 'swarm-dashboard-dev',
            cwd: '/opt/swarm-app/apps/dashboard',
            script: 'node_modules/vite/bin/vite.js',
            args: ['preview', '--port', '3000']
        },

        // --- CORE ENGINE ---
        {
            name: 'swarm-engine',
            cwd: '/opt/swarm-app/packages/engine',
            script: 'lib/engine.js'
        },
        {
            name: 'swarm-orchestrator-api',
            cwd: '/opt/swarm-app/apps/orchestrator/api',
            script: 'node_modules/tsx/dist/cli.mjs',
            args: ['watch', 'src/index.ts']
        },
        {
            name: 'swarm-orchestrator-ui',
            cwd: '/opt/swarm-app/apps/orchestrator/ui',
            script: 'node_modules/vite/bin/vite.js', // CHANGED: Use vite preview
            args: ['preview', '--port', '3500']
        },

        // --- AGENTS ---
        {
            name: 'swarm-coder-agent',
            cwd: '/opt/swarm-app/apps/agents/coder',
            script: 'index.js',
            env: {
                AGENT_ID: 'forge-agent-001',
                POLL_INTERVAL: '5',
                PERSONA_PATH: '/opt/swarm-app/docs/personas/forge.md',
                ANTHROPIC_API_KEY: 'SECRET',
                GITHUB_TOKEN: 'SECRET',
                API_URL: 'http://localhost:3002'
            }
        },
        {
            name: 'swarm-verifier',
            cwd: '/opt/swarm-app/apps/agents/sentinel',
            script: 'server.js'
        },
        {
            name: 'deploy-agent',
            cwd: '/opt/swarm-app/apps/agents/deploy',
            script: 'dist/index.js'
        },
        {
            name: 'swarm-rag',
            cwd: '/opt/swarm-app/apps/services/rag',
            script: 'index.js'
        }
    ]
};
