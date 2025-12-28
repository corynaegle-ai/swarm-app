-- Fix HITL schema - add missing columns
-- Date: 2024-12-18

-- Add message_type to hitl_messages
ALTER TABLE hitl_messages 
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';

-- Add tenant_id to hitl_events
ALTER TABLE hitl_events 
ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Add spec_card column to hitl_sessions if missing (for spec generation)
ALTER TABLE hitl_sessions
ADD COLUMN IF NOT EXISTS spec_card TEXT;

-- Add approved_at and approved_by columns if missing
ALTER TABLE hitl_sessions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE hitl_sessions
ADD COLUMN IF NOT EXISTS approved_by TEXT;

-- Verify changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'hitl_messages'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'hitl_events'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'hitl_sessions'
ORDER BY ordinal_position;
