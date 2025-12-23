-- Migration: Add priority column to tickets table
-- Created: 2024-01-01
-- Ticket: TKT-468CEA08

-- Add priority column with CHECK constraint
ALTER TABLE tickets 
ADD COLUMN priority VARCHAR(10) DEFAULT 'medium' 
CHECK (priority IN ('high', 'medium', 'low'));

-- Update all existing tickets to have medium priority
UPDATE tickets 
SET priority = 'medium' 
WHERE priority IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN tickets.priority IS 'Ticket priority level: high, medium, or low';

-- Rollback instructions (commented out)
-- To rollback this migration, run:
-- ALTER TABLE tickets DROP COLUMN priority;