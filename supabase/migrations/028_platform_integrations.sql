-- Platform Lead Integrations Migration
-- Creates tables for managing platform integrations (Facebook, WhatsApp, LinkedIn, Instagram)
-- and campaign-based lead assignments

-- =====================================================
-- PLATFORM INTEGRATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS platform_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'whatsapp', 'linkedin', 'instagram')),
  name VARCHAR(255) NOT NULL,
  credentials JSONB DEFAULT '{}', -- Encrypted API keys/tokens
  webhook_url TEXT,
  webhook_secret VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'syncing', 'error'
  error_message TEXT,
  config JSONB DEFAULT '{}', -- Additional platform-specific configuration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, platform, name)
);

-- =====================================================
-- INTEGRATION SYNC LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES platform_integrations(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('webhook', 'manual', 'scheduled')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  leads_created INTEGER DEFAULT 0,
  leads_updated INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}', -- Additional sync details
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CAMPAIGN ASSIGNMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES platform_integrations(id) ON DELETE CASCADE,
  campaign_id VARCHAR(255) NOT NULL, -- Platform-specific campaign identifier
  campaign_name VARCHAR(255) NOT NULL, -- Display name
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, integration_id, campaign_id)
);

-- =====================================================
-- UPDATE LEADS TABLE (NON-BREAKING)
-- =====================================================

-- Add integration_id column (nullable)
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES platform_integrations(id) ON DELETE SET NULL;

-- Add external_id column (nullable) - platform-specific lead ID
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- Add integration_metadata column (nullable) - stores campaign info and platform-specific data
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS integration_metadata JSONB DEFAULT '{}';

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for duplicate detection by external_id
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_id) WHERE external_id IS NOT NULL;

-- Index for integration_id lookups
CREATE INDEX IF NOT EXISTS idx_leads_integration_id ON leads(integration_id) WHERE integration_id IS NOT NULL;

-- Index for campaign_assignments lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_campaign_assignments_lookup 
ON campaign_assignments(org_id, integration_id, campaign_id, is_active) 
WHERE is_active = true;

-- Index for integration_id in campaign_assignments
CREATE INDEX IF NOT EXISTS idx_campaign_assignments_integration_id 
ON campaign_assignments(integration_id);

-- Index for assigned_to in campaign_assignments
CREATE INDEX IF NOT EXISTS idx_campaign_assignments_assigned_to 
ON campaign_assignments(assigned_to);

-- GIN index for JSONB queries on integration_metadata (optional, for campaign_id lookups)
CREATE INDEX IF NOT EXISTS idx_leads_integration_metadata_gin 
ON leads USING GIN (integration_metadata) 
WHERE integration_metadata IS NOT NULL AND integration_metadata != '{}'::jsonb;

-- Index for sync_logs by integration_id
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_integration_id 
ON integration_sync_logs(integration_id);

-- Index for sync_logs by created_at (for recent logs)
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_created_at 
ON integration_sync_logs(created_at DESC);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE platform_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES FOR platform_integrations
-- =====================================================

-- Super admin can view all integrations
CREATE POLICY "Super admin can view all integrations" ON platform_integrations
  FOR SELECT
  USING (is_super_admin());

-- Users can view integrations in their org
CREATE POLICY "Users can view org integrations" ON platform_integrations
  FOR SELECT
  USING (
    org_id = get_user_org_id()
    OR is_super_admin()
  );

-- Admin can manage integrations in their org
CREATE POLICY "Admin can manage org integrations" ON platform_integrations
  FOR ALL
  USING (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  )
  WITH CHECK (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

-- =====================================================
-- RLS POLICIES FOR integration_sync_logs
-- =====================================================

-- Super admin can view all sync logs
CREATE POLICY "Super admin can view all sync logs" ON integration_sync_logs
  FOR SELECT
  USING (is_super_admin());

-- Users can view sync logs for integrations in their org
CREATE POLICY "Users can view org sync logs" ON integration_sync_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_integrations pi
      WHERE pi.id = integration_sync_logs.integration_id
      AND (pi.org_id = get_user_org_id() OR is_super_admin())
    )
  );

-- Admin can manage sync logs in their org
CREATE POLICY "Admin can manage org sync logs" ON integration_sync_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_integrations pi
      WHERE pi.id = integration_sync_logs.integration_id
      AND pi.org_id = get_user_org_id()
      AND get_user_role() = 'admin'
    )
    OR is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_integrations pi
      WHERE pi.id = integration_sync_logs.integration_id
      AND pi.org_id = get_user_org_id()
      AND get_user_role() = 'admin'
    )
    OR is_super_admin()
  );

-- =====================================================
-- RLS POLICIES FOR campaign_assignments
-- =====================================================

-- Super admin can view all campaign assignments
CREATE POLICY "Super admin can view all campaign assignments" ON campaign_assignments
  FOR SELECT
  USING (is_super_admin());

-- Users can view campaign assignments in their org
CREATE POLICY "Users can view org campaign assignments" ON campaign_assignments
  FOR SELECT
  USING (
    org_id = get_user_org_id()
    OR is_super_admin()
  );

-- Admin can manage campaign assignments in their org
CREATE POLICY "Admin can manage org campaign assignments" ON campaign_assignments
  FOR ALL
  USING (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  )
  WITH CHECK (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Trigger function for updated_at (reusable)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_platform_integrations_updated_at
  BEFORE UPDATE ON platform_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_assignments_updated_at
  BEFORE UPDATE ON campaign_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE platform_integrations IS 'Stores platform integration credentials and configuration for each organization';
COMMENT ON TABLE integration_sync_logs IS 'Tracks sync operations (webhook, manual, scheduled) for each integration';
COMMENT ON TABLE campaign_assignments IS 'Maps campaigns to sales reps for automatic lead assignment';
COMMENT ON COLUMN leads.integration_id IS 'Foreign key to platform_integrations - identifies which integration created this lead';
COMMENT ON COLUMN leads.external_id IS 'Platform-specific lead ID for duplicate detection';
COMMENT ON COLUMN leads.integration_metadata IS 'JSONB field storing campaign info (campaign_id, campaign_name, ad_set_id, ad_id) and other platform-specific data';

