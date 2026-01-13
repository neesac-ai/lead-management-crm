-- Lead Form Assignments (Meta Instant Forms)
-- Adds form-based routing for Meta Lead Ads (Facebook/Instagram)
-- Priority: form_id -> campaign_id -> fallback assignment

-- =====================================================
-- LEAD FORM ASSIGNMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS lead_form_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES platform_integrations(id) ON DELETE CASCADE,
  form_id VARCHAR(255) NOT NULL, -- Meta lead form id
  form_name VARCHAR(255) NOT NULL, -- Display name
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, integration_id, form_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_lead_form_assignments_lookup
ON lead_form_assignments(org_id, integration_id, form_id, is_active)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_lead_form_assignments_integration_id
ON lead_form_assignments(integration_id);

CREATE INDEX IF NOT EXISTS idx_lead_form_assignments_assigned_to
ON lead_form_assignments(assigned_to);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE lead_form_assignments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES FOR lead_form_assignments
-- =====================================================

CREATE POLICY "Super admin can view all lead form assignments" ON lead_form_assignments
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Users can view org lead form assignments" ON lead_form_assignments
  FOR SELECT
  USING (
    org_id = get_user_org_id()
    OR is_super_admin()
  );

CREATE POLICY "Admin can manage org lead form assignments" ON lead_form_assignments
  FOR ALL
  USING (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  )
  WITH CHECK (
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR is_super_admin()
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER update_lead_form_assignments_updated_at
  BEFORE UPDATE ON lead_form_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE lead_form_assignments IS 'Maps Meta Lead Forms (Instant Forms) to sales reps for automatic lead routing';


