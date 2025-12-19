module.exports = {
  apps: [{
    name: 'deploy-agent',
    script: 'dist/index.js',
    cwd: '/opt/swarm-deploy',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      DEPLOY_AGENT_PORT: 3457,
      MANIFESTS_DIR: '/opt/swarm-deploy/manifests',
      DB_PATH: '/opt/swarm-deploy/data/deployments.db',
      LOG_LEVEL: 'info'
    }
  }]
};
