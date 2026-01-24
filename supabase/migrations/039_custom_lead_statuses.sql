-- Migration: Add custom lead statuses table
-- Allows organizations to customize lead status labels

CREATE TABLE IF NOT EXISTS lead_statuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status_value VARCHAR(50) NOT NULL, -- The enum value (e.g., 'call_not_picked', 'follow_up_again')
  label VARCHAR(100) NOT NULL, -- Custom label (e.g., 'Call Not Picked', 'Follow Up Again')
  color VARCHAR(50) DEFAULT 'bg-gray-500', -- Tailwind color class
  display_order INTEGER DEFAULT 0, -- Order in which statuses appear
  is_protected BOOLEAN DEFAULT false, -- Cannot be deleted if true
  is_active BOOLEAN DEFAULT true, -- Can be hidden without deleting
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, status_value)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lead_statuses_org_id ON lead_statuses(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_statuses_org_active ON lead_statuses(org_id, is_active);

-- Enable RLS
ALTER TABLE lead_statuses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view statuses for their organization
CREATE POLICY "Users can view lead statuses for their organization"
  ON lead_statuses
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- RLS Policy: Only admins can manage lead statuses
CREATE POLICY "Admins can manage lead statuses for their organization"
  ON lead_statuses
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

-- Insert default statuses for existing organizations
-- These will be created for each organization when they first access the status management page
-- Protected statuses: follow_up_again, demo_booked, deal_won

COMMENT ON TABLE lead_statuses IS 'Custom lead status labels per organization. Allows organizations to rename status labels while keeping the underlying enum values.';
COMMENT ON COLUMN lead_statuses.status_value IS 'The underlying enum value from lead_status enum';
COMMENT ON COLUMN lead_statuses.is_protected IS 'Protected statuses cannot be deleted (follow_up_again, demo_booked, deal_won)';
