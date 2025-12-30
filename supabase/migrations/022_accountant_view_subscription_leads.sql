-- Allow accountants to view leads that are associated with subscriptions
-- This is needed so accountants can see customer details in subscriptions view

-- Add policy for accountants to view leads that have subscriptions
CREATE POLICY "Accountant can view subscription leads" ON leads
  FOR SELECT
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() = 'accountant'
    AND EXISTS (
      SELECT 1 FROM customer_subscriptions 
      WHERE customer_subscriptions.lead_id = leads.id
      AND customer_subscriptions.org_id = get_user_org_id()
    )
  );

-- Also allow accountants to view leads that have pending approvals
CREATE POLICY "Accountant can view approval leads" ON leads
  FOR SELECT
  USING (
    org_id = get_user_org_id() 
    AND get_user_role() = 'accountant'
    AND EXISTS (
      SELECT 1 FROM subscription_approvals 
      WHERE subscription_approvals.lead_id = leads.id
      AND subscription_approvals.org_id = get_user_org_id()
    )
  );

-- Allow accountants to view lead activities for subscription-related leads
CREATE POLICY "Accountant can view subscription lead activities" ON lead_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_activities.lead_id 
      AND leads.org_id = get_user_org_id()
      AND get_user_role() = 'accountant'
      AND (
        EXISTS (
          SELECT 1 FROM customer_subscriptions 
          WHERE customer_subscriptions.lead_id = leads.id
          AND customer_subscriptions.org_id = get_user_org_id()
        )
        OR EXISTS (
          SELECT 1 FROM subscription_approvals 
          WHERE subscription_approvals.lead_id = leads.id
          AND subscription_approvals.org_id = get_user_org_id()
        )
      )
    )
  );

