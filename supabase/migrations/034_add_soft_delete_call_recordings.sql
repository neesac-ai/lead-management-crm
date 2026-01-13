-- Add soft delete column to call_recordings table
-- This prevents deleted recordings from being re-synced from Google Drive

ALTER TABLE call_recordings
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_call_recordings_is_deleted ON call_recordings(is_deleted) WHERE is_deleted = false;

-- Update RLS policies to exclude deleted recordings by default
-- Users should not see deleted recordings unless explicitly querying for them
DROP POLICY IF EXISTS "Users can view their org call recordings" ON call_recordings;
CREATE POLICY "Users can view their org call recordings" ON call_recordings
  FOR SELECT USING (
    (org_id = get_user_org_id() OR is_super_admin())
    AND is_deleted = false
  );

