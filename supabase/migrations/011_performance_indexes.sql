-- Performance optimization indexes
-- Run this migration to speed up common queries

-- Leads table indexes
CREATE INDEX IF NOT EXISTS idx_leads_org_id ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_leads_org_assigned ON leads(org_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(org_id, status);

-- Lead activities table indexes
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_next_followup ON lead_activities(next_followup);
CREATE INDEX IF NOT EXISTS idx_lead_activities_action_date ON lead_activities(action_date DESC);

-- Demos table indexes
CREATE INDEX IF NOT EXISTS idx_demos_lead_id ON demos(lead_id);
CREATE INDEX IF NOT EXISTS idx_demos_status ON demos(status);
CREATE INDEX IF NOT EXISTS idx_demos_scheduled_at ON demos(scheduled_at);

-- Call recordings table indexes
CREATE INDEX IF NOT EXISTS idx_call_recordings_org_id ON call_recordings(org_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_lead_id ON call_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_user_id ON call_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_phone ON call_recordings(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_recordings_date ON call_recordings(recording_date DESC);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Organizations table indexes
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Customer subscriptions table indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON customer_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_lead_id ON customer_subscriptions(lead_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON customer_subscriptions(status);

-- AI config table indexes
CREATE INDEX IF NOT EXISTS idx_ai_config_org_id ON ai_config(org_id);

-- Drive sync settings table indexes
CREATE INDEX IF NOT EXISTS idx_drive_sync_user_id ON drive_sync_settings(user_id);

-- Analyze tables after creating indexes
ANALYZE leads;
ANALYZE lead_activities;
ANALYZE demos;
ANALYZE call_recordings;
ANALYZE users;
ANALYZE organizations;
ANALYZE customer_subscriptions;


