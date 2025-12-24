-- Migration: Update lead_status enum values
-- Removes: contacted, qualified, negotiation
-- Adds: call_not_picked

-- First, add the new status value to the enum
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'call_not_picked';

-- Note: PostgreSQL doesn't allow removing enum values directly.
-- Existing leads with 'contacted', 'qualified', or 'negotiation' status 
-- will keep those values in the database.
-- The application will handle them gracefully (they just won't show in dropdown).

-- Optional: Update existing leads with old statuses to new appropriate ones
-- Uncomment and run these if you want to migrate existing data:

-- UPDATE leads SET status = 'call_not_picked' WHERE status = 'contacted';
-- UPDATE leads SET status = 'follow_up_again' WHERE status = 'qualified';
-- UPDATE leads SET status = 'demo_completed' WHERE status = 'negotiation';






