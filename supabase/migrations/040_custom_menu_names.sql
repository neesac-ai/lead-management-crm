-- Migration: Add custom menu names table
-- Allows organizations to customize sidebar menu item labels

CREATE TABLE IF NOT EXISTS menu_names (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  menu_key VARCHAR(100) NOT NULL, -- The internal key (e.g., 'dashboard', 'leads', 'follow-ups')
  custom_label VARCHAR(100) NOT NULL, -- Custom label (e.g., 'Home', 'Prospects', 'Follow-ups')
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, menu_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_menu_names_org_id ON menu_names(org_id);
CREATE INDEX IF NOT EXISTS idx_menu_names_org_key ON menu_names(org_id, menu_key);

-- Enable RLS
ALTER TABLE menu_names ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view menu names for their organization
CREATE POLICY "Users can view menu names for their organization"
  ON menu_names
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- RLS Policy: Only admins can manage menu names
CREATE POLICY "Admins can manage menu names for their organization"
  ON menu_names
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

COMMENT ON TABLE menu_names IS 'Custom sidebar menu item labels per organization. Allows organizations to rename menu items while keeping the underlying menu keys.';
COMMENT ON COLUMN menu_names.menu_key IS 'The internal menu key (e.g., dashboard, leads, follow-ups)';
COMMENT ON COLUMN menu_names.custom_label IS 'The custom label to display in the sidebar';
