-- Add created_by column to leads for tracking who added the lead
-- Run this in Supabase SQL Editor

-- Add created_by column
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);

-- Update existing leads to have created_by = assigned_to (if exists) or first admin
UPDATE leads l
SET created_by = COALESCE(
  l.assigned_to,
  (SELECT u.id FROM users u WHERE u.org_id = l.org_id AND u.role = 'admin' LIMIT 1)
)
WHERE l.created_by IS NULL;

