-- Track deleted Google Drive file IDs to prevent re-syncing
-- This table stores file IDs that were deleted, even if the recording was hard deleted
-- This prevents re-importing recordings that users have explicitly deleted

CREATE TABLE IF NOT EXISTS deleted_recording_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  drive_file_id VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Ensure one entry per file ID per org
  UNIQUE(org_id, drive_file_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deleted_recording_files_org_file ON deleted_recording_files(org_id, drive_file_id);
CREATE INDEX IF NOT EXISTS idx_deleted_recording_files_file_id ON deleted_recording_files(drive_file_id);

-- Enable RLS
ALTER TABLE deleted_recording_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view deleted files for their org" ON deleted_recording_files
  FOR SELECT USING (
    org_id = get_user_org_id()
    OR is_super_admin()
  );

CREATE POLICY "Users can insert deleted files for their org" ON deleted_recording_files
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id()
  );

-- Function to automatically track deleted recordings
CREATE OR REPLACE FUNCTION track_deleted_recording_file()
RETURNS TRIGGER AS $$
BEGIN
  -- If recording is being deleted and has a drive_file_id, track it
  IF OLD.drive_file_id IS NOT NULL AND OLD.drive_file_id != '' THEN
    INSERT INTO deleted_recording_files (org_id, drive_file_id, deleted_by)
    VALUES (OLD.org_id, OLD.drive_file_id, (SELECT id FROM users WHERE auth_id = auth.uid()))
    ON CONFLICT (org_id, drive_file_id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track hard deletes (before migration is applied)
CREATE TRIGGER track_deleted_recording_on_delete
  BEFORE DELETE ON call_recordings
  FOR EACH ROW
  EXECUTE FUNCTION track_deleted_recording_file();

-- Also track soft deletes (after migration is applied)
CREATE OR REPLACE FUNCTION track_deleted_recording_file_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If recording is being soft deleted and has a drive_file_id, track it
  IF NEW.is_deleted = true AND OLD.is_deleted = false AND NEW.drive_file_id IS NOT NULL AND NEW.drive_file_id != '' THEN
    INSERT INTO deleted_recording_files (org_id, drive_file_id, deleted_by)
    VALUES (NEW.org_id, NEW.drive_file_id, (SELECT id FROM users WHERE auth_id = auth.uid()))
    ON CONFLICT (org_id, drive_file_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track soft deletes (only if is_deleted column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_recordings' AND column_name = 'is_deleted'
  ) THEN
    CREATE TRIGGER track_deleted_recording_on_soft_delete
      AFTER UPDATE ON call_recordings
      FOR EACH ROW
      WHEN (NEW.is_deleted = true AND OLD.is_deleted = false)
      EXECUTE FUNCTION track_deleted_recording_file_on_update();
  END IF;
END $$;

