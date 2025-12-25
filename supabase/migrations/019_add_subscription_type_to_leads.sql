-- Migration: Add subscription_type to leads table
-- This allows tracking whether a lead is interested in trial or paid subscription

-- Add subscription_type column (nullable since existing leads won't have this)
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS subscription_type TEXT CHECK (subscription_type IN ('trial', 'paid'));

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_subscription_type ON leads(subscription_type);

-- Add comment for documentation
COMMENT ON COLUMN leads.subscription_type IS 'Type of subscription the lead is interested in: trial or paid';

