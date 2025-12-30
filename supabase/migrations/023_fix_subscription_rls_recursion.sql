-- Fix infinite recursion in customer_subscriptions RLS policies
-- The issue is multiple overlapping SELECT policies causing recursion

-- Drop all existing policies on customer_subscriptions
DROP POLICY IF EXISTS "Super admin can view all subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Org users can view subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Admin and accountant can manage subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can create subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can view their subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can update their subscriptions" ON customer_subscriptions;

-- Recreate policies with non-overlapping, specific rules

-- 1. Super admin can do everything (highest priority)
CREATE POLICY "Super admin can view all subscriptions" ON customer_subscriptions
  FOR SELECT 
  USING (is_super_admin());

CREATE POLICY "Super admin can manage all subscriptions" ON customer_subscriptions
  FOR ALL 
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 2. Admin and accountant can view and manage subscriptions in their org
CREATE POLICY "Admin and accountant can view subscriptions" ON customer_subscriptions
  FOR SELECT
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() IN ('admin', 'accountant')
  );

CREATE POLICY "Admin and accountant can manage subscriptions" ON customer_subscriptions
  FOR ALL
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    org_id = get_user_org_id() 
    AND get_user_role() IN ('admin', 'accountant')
  );

-- 3. Sales can view subscriptions for leads assigned to them
CREATE POLICY "Sales can view their subscriptions" ON customer_subscriptions
  FOR SELECT
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- 4. Sales can create subscriptions (when marking deal as won)
CREATE POLICY "Sales can create subscriptions" ON customer_subscriptions
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id() 
    AND get_user_role() = 'sales'
  );

-- 5. Sales can update subscriptions they created (pause/resume)
CREATE POLICY "Sales can update their subscriptions" ON customer_subscriptions
  FOR UPDATE
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    org_id = get_user_org_id() 
    AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

