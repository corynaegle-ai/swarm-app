-- Create ticket_comments table
-- Migration: 20241201_create_ticket_comments_table
-- Description: Create the ticket_comments table to support comment endpoints

CREATE TABLE ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    comment_text TEXT NOT NULL,
    author_id UUID NOT NULL,
    author_type VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint to ensure referential integrity
    CONSTRAINT fk_ticket_comments_ticket_id 
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_created_at ON ticket_comments(created_at);
CREATE INDEX idx_ticket_comments_ticket_created ON ticket_comments(ticket_id, created_at);

-- Add comment for documentation
COMMENT ON TABLE ticket_comments IS 'Stores comments associated with tickets';
COMMENT ON COLUMN ticket_comments.id IS 'Unique identifier for the comment';
COMMENT ON COLUMN ticket_comments.ticket_id IS 'Foreign key reference to tickets table';
COMMENT ON COLUMN ticket_comments.comment_text IS 'The actual comment content';
COMMENT ON COLUMN ticket_comments.author_id IS 'UUID of the user who created the comment';
COMMENT ON COLUMN ticket_comments.author_type IS 'Type of author (user, system, etc.)';
COMMENT ON COLUMN ticket_comments.created_at IS 'Timestamp when comment was created';
COMMENT ON COLUMN ticket_comments.updated_at IS 'Timestamp when comment was last updated';