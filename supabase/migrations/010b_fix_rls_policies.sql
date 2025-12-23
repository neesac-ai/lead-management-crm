-- Fix RLS policies to not depend on custom functions
-- Run this if you're getting permission errors

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their org call recordings" ON call_recordings;
DROP POLICY IF EXISTS "Users can insert call recordings for their org" ON call_recordings;
DROP POLICY IF EXISTS "Users can update their org call recordings" ON call_recordings;
DROP POLICY IF EXISTS "Admin can delete call recordings" ON call_recordings;
DROP POLICY IF EXISTS "Admin can view AI config" ON ai_config;
DROP POLICY IF EXISTS "Admin can manage AI config" ON ai_config;
DROP POLICY IF EXISTS "Users can view their own sync settings" ON drive_sync_settings;
DROP POLICY IF EXISTS "Users can manage their own sync settings" ON drive_sync_settings;

-- Simpler RLS policies for call_recordings
CREATE POLICY "call_recordings_select" ON call_recordings
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "call_recordings_insert" ON call_recordings
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "call_recordings_update" ON call_recordings
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "call_recordings_delete" ON call_recordings
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Simpler RLS policies for ai_config (admin only for write, all org users can read)
CREATE POLICY "ai_config_select" ON ai_config
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "ai_config_insert" ON ai_config
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "ai_config_update" ON ai_config
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "ai_config_delete" ON ai_config
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

-- Simpler RLS policies for drive_sync_settings
CREATE POLICY "drive_sync_select" ON drive_sync_settings
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
    OR org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "drive_sync_insert" ON drive_sync_settings
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "drive_sync_update" ON drive_sync_settings
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "drive_sync_delete" ON drive_sync_settings
  FOR DELETE USING (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );

