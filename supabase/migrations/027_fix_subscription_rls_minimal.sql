-- Minimal fix: Use only the SECURITY DEFINER functions, avoid querying other tables in policies
-- This should prevent any circular RLS dependencies

-- Ensure helper functions are STABLE
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

-- Drop ALL existing policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'customer_subscriptions') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON customer_subscriptions';
    END LOOP;
END $$;

-- Create minimal policies - only use functions, no table queries in policy conditions
-- Super admin can do everything
CREATE POLICY "super_admin_all" ON customer_subscriptions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Admin and accountant can view and manage their org's subscriptions
CREATE POLICY "admin_accountant_all" ON customer_subscriptions
  FOR ALL
  USING (
    org_id = get_user_org_id()
    AND get_user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    org_id = get_user_org_id()
    AND get_user_role() IN ('admin', 'accountant')
  );

-- Sales can view subscriptions in their org (we'll filter by lead assignment in application code)
-- This avoids querying leads table in RLS policy
CREATE POLICY "sales_view" ON customer_subscriptions
  FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
  );

-- Sales can create subscriptions
CREATE POLICY "sales_insert" ON customer_subscriptions
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
  );

-- Sales can update subscriptions in their org
CREATE POLICY "sales_update" ON customer_subscriptions
  FOR UPDATE
  USING (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
  )
  WITH CHECK (
    org_id = get_user_org_id()
    AND get_user_role() = 'sales'
  );

