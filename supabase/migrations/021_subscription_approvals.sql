-- Create subscription_approvals table for accountant approval workflow
-- When a lead is marked as deal_won, it creates a pending approval entry
-- Accountant must approve before it appears in subscriptions

CREATE TABLE subscription_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Subscription details (from deal_won form)
  subscription_type VARCHAR(20), -- 'trial' or 'paid'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  validity_days INTEGER NOT NULL,
  deal_value DECIMAL(12, 2) NOT NULL,
  amount_credited DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  
  -- Approval workflow
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_subscription_approvals_org ON subscription_approvals(org_id);
CREATE INDEX idx_subscription_approvals_status ON subscription_approvals(status);
CREATE INDEX idx_subscription_approvals_lead ON subscription_approvals(lead_id);
CREATE INDEX idx_subscription_approvals_created ON subscription_approvals(created_at DESC);

-- RLS Policies
ALTER TABLE subscription_approvals ENABLE ROW LEVEL SECURITY;

-- Accountant can view pending approvals for their org
CREATE POLICY "Accountant can view pending approvals" ON subscription_approvals
  FOR SELECT
  USING (
    org_id = get_user_org_id() 
    AND (
      get_user_role() = 'accountant'
      OR get_user_role() = 'admin'
      OR is_super_admin()
    )
  );

-- Admin and sales can view approvals they created
CREATE POLICY "Users can view their own approvals" ON subscription_approvals
  FOR SELECT
  USING (
    org_id = get_user_org_id() 
    AND (
      created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR get_user_role() = 'admin'
      OR is_super_admin()
    )
  );

-- Accountant can approve/reject
CREATE POLICY "Accountant can approve/reject" ON subscription_approvals
  FOR UPDATE
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() = 'accountant'
  );

-- Admin and sales can create approval requests
CREATE POLICY "Admin and sales can create approvals" ON subscription_approvals
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id() 
    AND get_user_role() IN ('admin', 'sales')
  );

-- Super admin can do everything
CREATE POLICY "Super admin can manage approvals" ON subscription_approvals
  FOR ALL
  USING (is_super_admin());

-- Function to create subscription from approved approval
CREATE OR REPLACE FUNCTION create_subscription_from_approval(approval_id UUID)
RETURNS UUID AS $$
DECLARE
  approval_record subscription_approvals%ROWTYPE;
  new_subscription_id UUID;
BEGIN
  -- Get the approval record
  SELECT * INTO approval_record
  FROM subscription_approvals
  WHERE id = approval_id AND status = 'approved';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found or not approved';
  END IF;
  
  -- Create the subscription
  INSERT INTO customer_subscriptions (
    org_id,
    lead_id,
    start_date,
    end_date,
    validity_days,
    status,
    deal_value,
    amount_credited,
    notes
  ) VALUES (
    approval_record.org_id,
    approval_record.lead_id,
    approval_record.start_date,
    approval_record.end_date,
    approval_record.validity_days,
    'active',
    approval_record.deal_value,
    approval_record.amount_credited,
    approval_record.notes
  ) RETURNING id INTO new_subscription_id;
  
  RETURN new_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

