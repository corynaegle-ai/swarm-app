-- Migration: 003-enhance-projects-table.sql
-- Purpose: Add fields needed for Project Specification Input Form
-- Date: 2024-12-11

-- Note: SQLite doesn't support ADD COLUMN with NOT NULL without default
-- So we add columns with defaults, then handle validation in application layer

-- Add description field for natural language spec
ALTER TABLE projects ADD COLUMN description TEXT;

-- Add spec file content (raw markdown from uploaded file)
ALTER TABLE projects ADD COLUMN spec_file_content TEXT;

-- Add spec file name
ALTER TABLE projects ADD COLUMN spec_file_name TEXT;

-- Add tech stack as JSON array
ALTER TABLE projects ADD COLUMN tech_stack TEXT DEFAULT '[]';

-- Add priority with default
ALTER TABLE projects ADD COLUMN priority TEXT DEFAULT 'medium';

-- Add constraints field (timeline, budget, etc)
ALTER TABLE projects ADD COLUMN constraints TEXT;

-- Add status field for tracking project lifecycle
ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'draft';

-- Add created_by for user tracking
ALTER TABLE projects ADD COLUMN created_by TEXT;

-- Add updated_at timestamp
ALTER TABLE projects ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Add design_agent_job_id to link to job tracking
ALTER TABLE projects ADD COLUMN design_agent_job_id TEXT;

-- Add error_message for failed projects
ALTER TABLE projects ADD COLUMN error_message TEXT;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
