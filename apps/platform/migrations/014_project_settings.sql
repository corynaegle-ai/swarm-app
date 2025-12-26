-- Migration: 014_project_settings.sql
-- Purpose: Add settings JSONB column to projects table for per-project agent configuration
-- Date: 2025-12-26

-- Add settings column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Add comment explaining the settings structure
COMMENT ON COLUMN projects.settings IS 'Per-project agent configuration overrides. Schema:
{
  "worker_model": "claude-sonnet-4-20250514",
  "worker_max_tokens": 8192,
  "review_model": "claude-opus-4-5-20251101",
  "review_strictness": "medium",
  "max_review_attempts": 3,
  "auto_merge_on_approve": false
}';

-- Create index for JSONB queries if needed
CREATE INDEX IF NOT EXISTS idx_projects_settings ON projects USING gin (settings);

-- Update existing projects with empty settings if NULL
UPDATE projects SET settings = '{}' WHERE settings IS NULL;
