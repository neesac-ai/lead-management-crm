-- Lead Tags Migration
-- =====================================================

-- Create tags table
CREATE TABLE IF NOT EXISTS lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) DEFAULT 'gray',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(org_id, name)
);

-- Create lead_tag_assignments junction table
CREATE TABLE IF NOT EXISTS lead_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(lead_id, tag_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_lead_tags_org_id ON lead_tags(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_lead_id ON lead_tag_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_tag_id ON lead_tag_assignments(tag_id);

-- Enable RLS
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tag_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_tags
CREATE POLICY "Users can view tags in their org" ON lead_tags
  FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Admins and sales can create tags" ON lead_tags
  FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Admins can delete tags" ON lead_tags
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE auth_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for lead_tag_assignments
CREATE POLICY "Users can view tag assignments in their org" ON lead_tag_assignments
  FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM leads 
      WHERE org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "Admins and sales can assign tags" ON lead_tag_assignments
  FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT id FROM leads 
      WHERE org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "Admins and sales can remove tag assignments" ON lead_tag_assignments
  FOR DELETE
  USING (
    lead_id IN (
      SELECT id FROM leads 
      WHERE org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
    )
  );


