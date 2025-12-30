-- Fix infinite recursion in customer_subscriptions RLS policies
-- Use a simpler approach that avoids function calls in policy conditions where possible

-- Drop all existing policies on customer_subscriptions
DROP POLICY IF EXISTS "Super admin can view all subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Super admin can manage all subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Org users can view subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Admin and accountant can view subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Admin and accountant can manage subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can create subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can view their subscriptions" ON customer_subscriptions;
DROP POLICY IF EXISTS "Sales can update their subscriptions" ON customer_subscriptions;

-- Create a single comprehensive SELECT policy that handles all cases
-- Use direct subqueries to avoid function call recursion
CREATE POLICY "Users can view subscriptions" ON customer_subscriptions
  FOR SELECT
  USING (
    -- Super admin can see everything
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid() 
      AND users.role = 'super_admin'
    )
    OR
    -- Admin and accountant can see all subscriptions in their org
    (
      EXISTS (
        SELECT 1 FROM users 
        WHERE users.auth_id = auth.uid()
        AND users.org_id = customer_subscriptions.org_id
        AND users.role IN ('admin', 'accountant')
      )
    )
    OR
    -- Sales can see subscriptions for leads assigned to them
    (
      EXISTS (
        SELECT 1 FROM users 
        WHERE users.auth_id = auth.uid()
        AND users.org_id = customer_subscriptions.org_id
        AND users.role = 'sales'
      )
      AND EXISTS (
        SELECT 1 FROM leads 
        WHERE leads.id = customer_subscriptions.lead_id 
        AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

-- Super admin can manage everything
CREATE POLICY "Super admin can manage subscriptions" ON customer_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid() 
      AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- Admin and accountant can manage subscriptions in their org
CREATE POLICY "Admin and accountant can manage subscriptions" ON customer_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid()
      AND users.org_id = customer_subscriptions.org_id
      AND users.role IN ('admin', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid()
      AND users.org_id = customer_subscriptions.org_id
      AND users.role IN ('admin', 'accountant')
    )
  );

-- Sales can create subscriptions
CREATE POLICY "Sales can create subscriptions" ON customer_subscriptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid()
      AND users.org_id = customer_subscriptions.org_id
      AND users.role = 'sales'
    )
  );

-- Sales can update subscriptions for their leads
CREATE POLICY "Sales can update their subscriptions" ON customer_subscriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid()
      AND users.org_id = customer_subscriptions.org_id
      AND users.role = 'sales'
    )
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.auth_id = auth.uid()
      AND users.org_id = customer_subscriptions.org_id
      AND users.role = 'sales'
    )
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

