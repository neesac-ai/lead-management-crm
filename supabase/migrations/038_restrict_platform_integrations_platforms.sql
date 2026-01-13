-- Restrict allowed platform values to the currently supported set.
-- We keep 'google_sheets' because the next iteration will implement OAuth + polling for Sheets.
-- (We intentionally remove 'whatsapp' and 'linkedin' from the allowed values.)

DO $$
BEGIN
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
    CHECK (platform IN ('facebook', 'instagram', 'google_sheets'));
END $$;

