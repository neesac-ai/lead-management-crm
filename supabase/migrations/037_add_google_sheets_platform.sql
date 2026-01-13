-- Allow Google Sheets integrations in platform_integrations.platform
-- Extends the existing CHECK constraint to include 'google_sheets'.

DO $$
BEGIN
  -- The original migration used an unnamed CHECK constraint, so Postgres created:
  --   platform_integrations_platform_check
  -- We drop and recreate it with the new allowed value.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_integrations_platform_check'
  ) THEN
    ALTER TABLE platform_integrations
      DROP CONSTRAINT platform_integrations_platform_check;
  END IF;

  ALTER TABLE platform_integrations
    ADD CONSTRAINT platform_integrations_platform_check
    CHECK (platform IN ('facebook', 'whatsapp', 'linkedin', 'instagram', 'google_sheets'));
END $$;

