-- Migration: 013_mcp_servers.sql
-- Add MCP server configuration to tickets and projects
-- Author: Alex Chen (Swarm Architect)
-- Date: 2024-12-24

-- Add mcp_servers JSONB column to tickets table
-- Stores array of MCP server IDs that the agent can use for this ticket
-- Example: ["ai.shawndurrani/mcp-merchant", "filesystem-server"]
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;

-- Add mcp_servers JSONB column to projects table  
-- Default MCP servers for all tickets in this project
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;

-- Add user_id column to tickets if not exists (needed for MCP client userId)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Create index for querying tickets with MCP servers configured
CREATE INDEX IF NOT EXISTS idx_tickets_mcp_servers ON tickets USING GIN (mcp_servers);

-- Comment on columns
COMMENT ON COLUMN tickets.mcp_servers IS 'Array of MCP server IDs available to the agent for this ticket';
COMMENT ON COLUMN projects.mcp_servers IS 'Default MCP server IDs for all tickets in this project';
COMMENT ON COLUMN tickets.user_id IS 'User ID for MCP client authentication and instance isolation';
