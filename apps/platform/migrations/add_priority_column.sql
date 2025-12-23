-- Migration: Add priority column to tickets table
-- Date: 2024-01-15
-- Description: Adds priority column with CHECK constraint for enum values (high, medium, low)
--              Sets default value to 'medium' and updates existing records

-- Forward migration
BEGIN;

-- Add priority column with CHECK constraint and default value
ALTER TABLE tickets 
ADD COLUMN priority VARCHAR(10) NOT NULL DEFAULT 'medium'
CHECK (priority IN ('high', 'medium', 'low'));

-- Update all existing tickets to have medium priority
-- (This is redundant due to default value but ensures consistency)
UPDATE tickets 
SET priority = 'medium' 
WHERE priority IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN tickets.priority IS 'Ticket priority level: high, medium, or low';

COMMIT;

-- Rollback migration (uncomment to rollback)
-- BEGIN;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS priority;
-- COMMIT;