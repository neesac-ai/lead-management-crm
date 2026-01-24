-- Migration: Add product_id to subscription_approvals table
-- This allows each subscription approval to have its own product, independent of lead activities

-- Add product_id to subscription_approvals table
ALTER TABLE subscription_approvals
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_subscription_approvals_product_id ON subscription_approvals(product_id);

-- Add comment
COMMENT ON COLUMN subscription_approvals.product_id IS 'Product for this specific subscription approval';

-- Update the function to include product_id when creating subscription from approval
-- This function handles both cases: with and without product_id column
CREATE OR REPLACE FUNCTION create_subscription_from_approval(approval_id UUID)
RETURNS UUID AS $$
DECLARE
  approval_record subscription_approvals%ROWTYPE;
  new_subscription_id UUID;
  has_product_id_column BOOLEAN;
BEGIN
  -- Get the approval record
  SELECT * INTO approval_record
  FROM subscription_approvals
  WHERE id = approval_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found or not approved';
  END IF;

  -- Check if product_id column exists in customer_subscriptions table
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'customer_subscriptions'
    AND column_name = 'product_id'
  ) INTO has_product_id_column;

  -- Create the subscription
  IF has_product_id_column THEN
    -- Include product_id if column exists
    INSERT INTO customer_subscriptions (
      org_id,
      lead_id,
      start_date,
      end_date,
      validity_days,
      status,
      deal_value,
      amount_credited,
      notes,
      product_id
    ) VALUES (
      approval_record.org_id,
      approval_record.lead_id,
      approval_record.start_date,
      approval_record.end_date,
      approval_record.validity_days,
      'active',
      approval_record.deal_value,
      approval_record.amount_credited,
      approval_record.notes,
      approval_record.product_id
    ) RETURNING id INTO new_subscription_id;
  ELSE
    -- Exclude product_id if column doesn't exist
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
  END IF;

  RETURN new_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
