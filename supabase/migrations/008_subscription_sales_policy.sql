-- Add policy for sales to create subscriptions when a deal is won
-- Sales users need to be able to insert subscriptions when they mark a lead as "deal_won"

-- Drop the existing policy and recreate with sales included
DROP POLICY IF EXISTS "Admin and accountant can manage subscriptions" ON customer_subscriptions;

-- Recreate the policy including sales role for INSERT
CREATE POLICY "Admin and accountant can manage subscriptions" ON customer_subscriptions
  FOR ALL USING (
    (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'accountant'))
    OR is_super_admin()
  )
  WITH CHECK (
    (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'accountant'))
    OR is_super_admin()
  );

-- Separate policy for sales to INSERT subscriptions (when marking deal as won)
CREATE POLICY "Sales can create subscriptions" ON customer_subscriptions
  FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id() AND get_user_role() = 'sales'
  );

-- Allow sales to view subscriptions they created (by checking lead assignment)
CREATE POLICY "Sales can view their subscriptions" ON customer_subscriptions
  FOR SELECT
  USING (
    org_id = get_user_org_id() AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Allow sales to update subscriptions they created (pause/resume)
CREATE POLICY "Sales can update their subscriptions" ON customer_subscriptions
  FOR UPDATE
  USING (
    org_id = get_user_org_id() AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    org_id = get_user_org_id() AND get_user_role() = 'sales'
    AND EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = customer_subscriptions.lead_id 
      AND leads.assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

