-- Migration: org_devices for device enrollment + device key auth
--
-- Goal: allow call tracking uploads even when user is logged out by authorizing uploads with a
-- revocable device key (stored hashed server-side).

CREATE TABLE IF NOT EXISTS org_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  platform VARCHAR(20) NOT NULL DEFAULT 'android', -- android/ios/etc
  device_label VARCHAR(120),

  -- Device key auth (store only hash + prefix for debugging)
  device_key_hash TEXT NOT NULL,
  device_key_prefix VARCHAR(12) NOT NULL,

  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_devices_key_hash ON org_devices(device_key_hash);
CREATE INDEX IF NOT EXISTS idx_org_devices_org_id ON org_devices(org_id);
CREATE INDEX IF NOT EXISTS idx_org_devices_assigned_user_id ON org_devices(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_org_devices_revoked_at ON org_devices(revoked_at);

-- Enable RLS (device endpoints will use service-role, but keep RLS on by default)
ALTER TABLE org_devices ENABLE ROW LEVEL SECURITY;

-- Only allow reads within org (admins/super admins). We keep it conservative.
CREATE POLICY "Admins can view org devices" ON org_devices
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- Allow users to enroll their own device (creates record assigned to self).
-- NOTE: if you want admin-only enrollment, remove this policy and rely on service-role routes.
CREATE POLICY "Users can enroll devices for self" ON org_devices
  FOR INSERT WITH CHECK (
    assigned_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND org_id = get_user_org_id()
  );

-- Update updated_at trigger (reuse existing pattern)
CREATE OR REPLACE FUNCTION update_org_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_org_devices_updated_at ON org_devices;
CREATE TRIGGER update_org_devices_updated_at
  BEFORE UPDATE ON org_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_org_devices_updated_at();

