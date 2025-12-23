-- Call Recordings and AI Configuration Tables
-- This migration creates tables for storing call recordings and AI model settings

-- Call recordings table - stores metadata and AI-processed data for call recordings
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Call details
  phone_number VARCHAR(20) NOT NULL,
  call_direction VARCHAR(10) DEFAULT 'outbound', -- 'inbound' or 'outbound'
  duration_seconds INTEGER,
  recording_date TIMESTAMPTZ NOT NULL,
  
  -- Google Drive storage
  drive_file_id VARCHAR(255),
  drive_file_url TEXT,
  drive_file_name VARCHAR(255),
  file_size_bytes BIGINT,
  
  -- AI-processed data
  transcript TEXT,
  summary TEXT,
  sentiment VARCHAR(20), -- 'positive', 'neutral', 'negative'
  key_points JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  next_steps TEXT,
  
  -- Processing metadata
  ai_model_used VARCHAR(100),
  transcription_model VARCHAR(100),
  processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI configuration table - stores API keys and settings for AI providers
CREATE TABLE IF NOT EXISTS ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Provider details
  provider VARCHAR(50) NOT NULL, -- 'openai', 'gemini', 'groq'
  model_name VARCHAR(100) NOT NULL, -- e.g., 'gpt-4o-mini', 'gemini-1.5-flash', 'llama-3.1-70b'
  
  -- API credentials (encrypted in practice, stored as text for simplicity)
  api_key TEXT,
  
  -- Settings
  is_active BOOLEAN DEFAULT false,
  is_default_transcription BOOLEAN DEFAULT false,
  is_default_summary BOOLEAN DEFAULT false,
  
  -- Provider-specific config
  config JSONB DEFAULT '{}',
  
  -- Usage tracking
  total_requests INTEGER DEFAULT 0,
  total_tokens_used BIGINT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one config per provider per org
  UNIQUE(org_id, provider)
);

-- Drive sync settings - stores folder configuration for each user
CREATE TABLE IF NOT EXISTS drive_sync_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Drive folder configuration
  folder_id VARCHAR(255),
  folder_name VARCHAR(255) DEFAULT 'LeadFlow_Recordings',
  
  -- Sync status
  is_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_file_count INTEGER DEFAULT 0,
  sync_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_call_recordings_org_id ON call_recordings(org_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_lead_id ON call_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_user_id ON call_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_phone ON call_recordings(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_recordings_date ON call_recordings(recording_date DESC);
CREATE INDEX IF NOT EXISTS idx_call_recordings_status ON call_recordings(processing_status);

CREATE INDEX IF NOT EXISTS idx_ai_config_org_id ON ai_config(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_config_provider ON ai_config(provider);

CREATE INDEX IF NOT EXISTS idx_drive_sync_user_id ON drive_sync_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_org_id ON drive_sync_settings(org_id);

-- Enable RLS
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_sync_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_recordings
CREATE POLICY "Users can view their org call recordings" ON call_recordings
  FOR SELECT USING (
    org_id = get_user_org_id()
    OR is_super_admin()
  );

CREATE POLICY "Users can insert call recordings for their org" ON call_recordings
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
  );

CREATE POLICY "Users can update their org call recordings" ON call_recordings
  FOR UPDATE USING (
    org_id = get_user_org_id()
    OR is_super_admin()
  );

CREATE POLICY "Admin can delete call recordings" ON call_recordings
  FOR DELETE USING (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

-- RLS Policies for ai_config (admin only)
CREATE POLICY "Admin can view AI config" ON ai_config
  FOR SELECT USING (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

CREATE POLICY "Admin can manage AI config" ON ai_config
  FOR ALL USING (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

-- RLS Policies for drive_sync_settings
CREATE POLICY "Users can view their own sync settings" ON drive_sync_settings
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

CREATE POLICY "Users can manage their own sync settings" ON drive_sync_settings
  FOR ALL USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_call_recordings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_recordings_updated_at
  BEFORE UPDATE ON call_recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_call_recordings_updated_at();

CREATE TRIGGER ai_config_updated_at
  BEFORE UPDATE ON ai_config
  FOR EACH ROW
  EXECUTE FUNCTION update_call_recordings_updated_at();

CREATE TRIGGER drive_sync_settings_updated_at
  BEFORE UPDATE ON drive_sync_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_call_recordings_updated_at();


