-- Migration: 015_register_sentinel_deploy_agents.sql
-- Description: Register Sentinel and Deploy agents in agent_definitions table
-- Required for agent routing convention (ready/in_review/approved)
-- Date: 2025-12-26

-- Register Sentinel Agent (claims in_review tickets)
INSERT INTO agent_definitions (
    id,
    name,
    version,
    path,
    description,
    capabilities,
    runtime,
    memory_mb,
    timeout_seconds,
    author,
    tags,
    tenant_id
) VALUES (
    'sentinel-agent-001',
    'sentinel',
    '1.0.0',
    '/opt/swarm-sentinel',
    'SENTINEL code review agent - validates PRs against acceptance criteria',
    '{"tags": ["review", "validation", "quality-gate"], "entry": "index.js"}'::jsonb,
    'node',
    256,
    600,
    'swarm-system',
    '["sentinel", "review", "qa"]'::jsonb,
    'default'
) ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    updated_at = NOW();

-- Register Deploy Agent (claims approved tickets)
INSERT INTO agent_definitions (
    id,
    name,
    version,
    path,
    description,
    capabilities,
    runtime,
    memory_mb,
    timeout_seconds,
    author,
    tags,
    tenant_id
) VALUES (
    'deploy-agent-001',
    'deploy',
    '1.0.0',
    '/opt/swarm-deploy',
    'DEPLOY agent - handles deployment of approved tickets to target environments',
    '{"tags": ["deploy", "release", "staging", "production"], "entry": "index.js"}'::jsonb,
    'node',
    128,
    300,
    'swarm-system',
    '["deploy", "release", "devops"]'::jsonb,
    'default'
) ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    updated_at = NOW();

-- Verify registration
-- SELECT id, name, version, description FROM agent_definitions ORDER BY name;
