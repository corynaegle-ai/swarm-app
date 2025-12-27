// ecosystem.config.js - PM2 Configuration for Swarm RAG
module.exports = {
  apps: [{
    name: 'swarm-rag',
    script: 'index.js',
    cwd: '/opt/swarm-rag',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/swarm-rag-error.log',
    out_file: '/var/log/swarm-rag-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
