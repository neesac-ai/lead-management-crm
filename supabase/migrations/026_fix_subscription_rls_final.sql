-- Fix infinite recursion by using existing SECURITY DEFINER functions correctly
-- The issue is that we need to ensure functions are STABLE and used properly

-- First, ensure the helper functions are STABLE (they don't modify data)
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid() LIMIT 1
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE auth_id = auth.uid() 
    AND role = 'super_admin'
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Drop all existing policies on customer_subscriptions
DROP POLICY IF EXISTS "Users can view subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Super admin can view all subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Super admin can manage all subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Super admin can manage subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Org users can view subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Admin and accountant can view subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Admin and accountant can manage subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can create subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can view their subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can update their subscriptions" ON customer_subscriptions;

-- Create a single SELECT policy using the SECURITY DEFINER functions
CREATE POLICY "Users can view subscriptions" ON customer_subscriptions
  FOR SELECT
  USING (
    is_super_admin()
    OR
    (
      org_id = get_user_org_id()
      AND get_user_role() IN ('admin', 'accountant')
    )
    OR
    (
      org_id = get_user_org_id()
      AND get_user_role() = 'sales'
      AND EXISTS (
        SELECT 1 FROM leads 
        WHERE leads.id = customer_subscriptions.lead_id 
        AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1)
      )
    )
  );

-- Super admin can manage everything
CREATE POLICY "Super admin can manage subscriptions" ON customer_subscriptions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Admin and accountant can manage subscriptions in their org
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

-- Sales can create subscriptions
CREATE POLICY "Sales can create subscriptions" ON customer_subscriptions
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
  );

-- Sales can update subscriptions for their leads
CREATE POLICY "Sales can update their subscriptions" ON customer_subscriptions
  FOR UPDATE
  USING (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1)
    )
  );


