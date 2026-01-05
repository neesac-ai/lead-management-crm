-- Migration: Add call_logs table for exact call tracking
-- This replaces the need for Google Drive sync and provides exact call duration/status

-- Create call_logs table
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  call_direction VARCHAR(10) NOT NULL CHECK (call_direction IN ('incoming', 'outgoing', 'missed', 'rejected', 'blocked')),
  call_status VARCHAR(20) NOT NULL CHECK (call_status IN ('completed', 'missed', 'rejected', 'blocked', 'busy', 'failed')),
  call_started_at TIMESTAMPTZ NOT NULL,
  call_ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  ring_duration_seconds INTEGER DEFAULT 0,
  talk_time_seconds INTEGER DEFAULT 0,
  device_info JSONB,
  network_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_logs_org_id ON call_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone_number ON call_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_started_at ON call_logs(call_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_phone ON call_logs(user_id, phone_number);

-- Enable RLS
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_logs

-- Users can view call logs from their organization
CREATE POLICY "Users can view org call logs" ON call_logs
  FOR SELECT USING (
    org_id = get_user_org_id() OR is_super_admin()
  );

-- Users can create call logs for their own calls
CREATE POLICY "Users can create their own call logs" ON call_logs
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- Users can update their own call logs (to update duration, status, etc.)
CREATE POLICY "Users can update their own call logs" ON call_logs
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- Admins can view all call logs in their org
CREATE POLICY "Admins can view all org call logs" ON call_logs
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_call_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_call_logs_updated_at
  BEFORE UPDATE ON call_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_call_logs_updated_at();

