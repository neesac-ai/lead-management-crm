-- Organization Subscriptions table
-- Tracks subscription details for each organization

CREATE TABLE IF NOT EXISTS org_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL CHECK (subscription_type IN ('trial', 'paid')),
  validity_days INTEGER NOT NULL DEFAULT 30,
  sales_quota INTEGER, -- NULL means unlimited
  accountant_quota INTEGER, -- NULL means unlimited
  subscription_value DECIMAL(10, 2) DEFAULT 0,
  amount_credited DECIMAL(10, 2) DEFAULT 0,
  amount_pending DECIMAL(10, 2) GENERATED ALWAYS AS (subscription_value - amount_credited) STORED,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'paused')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_id ON org_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON org_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_end_date ON org_subscriptions(end_date);

-- Enable RLS
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything
CREATE POLICY "Super admin full access on org_subscriptions"
  ON org_subscriptions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- Admin can view their own organization's subscription
CREATE POLICY "Admin can view own org subscription"
  ON org_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid() 
      AND users.org_id = org_subscriptions.org_id
      AND users.role = 'admin'
    )
  );

-- Function to check if organization has reached quota
CREATE OR REPLACE FUNCTION check_org_quota(p_org_id UUID, p_role TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  quota INTEGER,
  is_unlimited BOOLEAN
) AS $$
DECLARE
  v_quota INTEGER;
  v_current_count INTEGER;
  v_subscription_status TEXT;
BEGIN
  -- Get the quota from org_subscriptions
  SELECT 
    CASE WHEN p_role = 'sales' THEN os.sales_quota ELSE os.accountant_quota END,
    os.status
  INTO v_quota, v_subscription_status
  FROM org_subscriptions os
  WHERE os.org_id = p_org_id
  ORDER BY os.created_at DESC
  LIMIT 1;

  -- If no subscription found or subscription is not active, don't allow
  IF v_subscription_status IS NULL OR v_subscription_status != 'active' THEN
    RETURN QUERY SELECT FALSE, 0, 0, FALSE;
    RETURN;
  END IF;

  -- Count current users with this role in the org
  SELECT COUNT(*)::INTEGER INTO v_current_count
  FROM users
  WHERE org_id = p_org_id 
  AND role = p_role
  AND is_active = TRUE;

  -- NULL quota means unlimited
  IF v_quota IS NULL THEN
    RETURN QUERY SELECT TRUE, v_current_count, NULL::INTEGER, TRUE;
  ELSE
    RETURN QUERY SELECT (v_current_count < v_quota), v_current_count, v_quota, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_org_quota(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_org_quota(UUID, TEXT) TO anon;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_org_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_subscriptions_updated_at
  BEFORE UPDATE ON org_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_org_subscriptions_updated_at();


