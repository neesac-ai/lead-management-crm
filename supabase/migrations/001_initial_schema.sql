-- Lead Management CRM - Initial Database Schema
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types (enums)
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'sales', 'accountant');
CREATE TYPE org_status AS ENUM ('pending', 'active', 'suspended', 'deleted');
CREATE TYPE lead_status AS ENUM (
  'new', 
  'contacted', 
  'qualified', 
  'not_interested', 
  'follow_up_again', 
  'demo_booked', 
  'demo_completed', 
  'negotiation', 
  'deal_won', 
  'deal_lost'
);
CREATE TYPE demo_status AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled');
CREATE TYPE subscription_status AS ENUM ('active', 'expiring_soon', 'expired', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'upi', 'card', 'cheque', 'other');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');
CREATE TYPE org_subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');

-- =====================================================
-- PLATFORM-LEVEL TABLES (Super Admin)
-- =====================================================

-- Platform Plans (SaaS pricing tiers)
CREATE TABLE platform_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  monthly_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  yearly_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_leads_per_month INTEGER NOT NULL DEFAULT 1000,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations (Tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  status org_status DEFAULT 'pending',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Subscriptions (Platform billing)
CREATE TABLE org_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES platform_plans(id),
  billing_cycle billing_cycle DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status org_subscription_status DEFAULT 'trialing',
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  amount_due DECIMAL(10, 2) DEFAULT 0,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (All roles including super_admin)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role user_role DEFAULT 'sales',
  lead_allocation_percent INTEGER DEFAULT 0 CHECK (lead_allocation_percent >= 0 AND lead_allocation_percent <= 100),
  is_approved BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Impersonation Logs (Audit trail for super admin)
CREATE TABLE impersonation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  super_admin_id UUID NOT NULL REFERENCES users(id),
  target_user_id UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Platform Settings
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ORGANIZATION-LEVEL TABLES (Tenants)
-- =====================================================

-- Lead Sources
CREATE TABLE lead_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'facebook', 'instagram', 'linkedin', 'whatsapp', 'website', 'manual', 'csv_import'
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100) DEFAULT 'manual',
  status lead_status DEFAULT 'new',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead Activities
CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL, -- 'status_change', 'note', 'call', 'email', 'meeting'
  comments TEXT,
  action_date TIMESTAMPTZ DEFAULT NOW(),
  next_followup TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Demos
CREATE TABLE demos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  google_meet_link TEXT,
  calendar_event_id VARCHAR(255),
  status demo_status DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Subscriptions (End-customer subscriptions, not platform)
CREATE TABLE customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  validity_days INTEGER NOT NULL,
  status subscription_status DEFAULT 'active',
  deal_value DECIMAL(12, 2) NOT NULL,
  amount_credited DECIMAL(12, 2) DEFAULT 0,
  amount_pending DECIMAL(12, 2) GENERATED ALWAYS AS (deal_value - amount_credited) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method payment_method NOT NULL,
  transaction_ref VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status invoice_status DEFAULT 'draft',
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_leads_org_id ON leads(org_id);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX idx_demos_lead_id ON demos(lead_id);
CREATE INDEX idx_demos_scheduled_at ON demos(scheduled_at);
CREATE INDEX idx_customer_subscriptions_org_id ON customer_subscriptions(org_id);
CREATE INDEX idx_customer_subscriptions_status ON customer_subscriptions(status);
CREATE INDEX idx_customer_subscriptions_end_date ON customer_subscriptions(end_date);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_org_subscriptions_org_id ON org_subscriptions(org_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to get current user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE auth_id = auth.uid() 
    AND role = 'super_admin'
  )
$$ LANGUAGE SQL SECURITY DEFINER;

-- Platform Plans: Everyone can read, only super admin can modify
CREATE POLICY "Anyone can view active plans" ON platform_plans
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "Super admin can manage plans" ON platform_plans
  FOR ALL USING (is_super_admin());

-- Organizations: Super admin sees all, users see their own
CREATE POLICY "Super admin can view all orgs" ON organizations
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Users can view their org" ON organizations
  FOR SELECT USING (id = get_user_org_id());

CREATE POLICY "Super admin can manage orgs" ON organizations
  FOR ALL USING (is_super_admin());

-- Org Subscriptions: Super admin only
CREATE POLICY "Super admin can manage org subscriptions" ON org_subscriptions
  FOR ALL USING (is_super_admin());

CREATE POLICY "Org admin can view their subscription" ON org_subscriptions
  FOR SELECT USING (org_id = get_user_org_id());

-- Users: Complex policies based on role
CREATE POLICY "Users can view themselves" ON users
  FOR SELECT USING (auth_id = auth.uid());

CREATE POLICY "Super admin can view all users" ON users
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Org users can view org members" ON users
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Super admin can manage all users" ON users
  FOR ALL USING (is_super_admin());

CREATE POLICY "Org admin can manage org users" ON users
  FOR UPDATE USING (
    org_id = get_user_org_id() 
    AND get_user_role() = 'admin'
    AND role != 'super_admin'
  );

-- Impersonation Logs: Super admin only
CREATE POLICY "Super admin can manage impersonation logs" ON impersonation_logs
  FOR ALL USING (is_super_admin());

-- Platform Settings: Super admin only
CREATE POLICY "Super admin can manage platform settings" ON platform_settings
  FOR ALL USING (is_super_admin());

CREATE POLICY "Anyone can read platform settings" ON platform_settings
  FOR SELECT USING (true);

-- Lead Sources: Org-based access
CREATE POLICY "Users can view org lead sources" ON lead_sources
  FOR SELECT USING (org_id = get_user_org_id() OR is_super_admin());

CREATE POLICY "Admin can manage lead sources" ON lead_sources
  FOR ALL USING (
    (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'sales'))
    OR is_super_admin()
  );

-- Leads: Org-based access with role restrictions
CREATE POLICY "Super admin can view all leads" ON leads
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Admin can view all org leads" ON leads
  FOR SELECT USING (
    org_id = get_user_org_id() 
    AND get_user_role() IN ('admin', 'sales')
  );

CREATE POLICY "Sales can view assigned leads" ON leads
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND (
      get_user_role() = 'admin'
      OR assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "Admin and sales can manage leads" ON leads
  FOR ALL USING (
    (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'sales'))
    OR is_super_admin()
  );

-- Lead Activities: Same as leads
CREATE POLICY "Users can view lead activities" ON lead_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_activities.lead_id 
      AND (leads.org_id = get_user_org_id() OR is_super_admin())
    )
  );

CREATE POLICY "Users can create lead activities" ON lead_activities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_activities.lead_id 
      AND (leads.org_id = get_user_org_id() OR is_super_admin())
    )
  );

-- Demos: Same as leads
CREATE POLICY "Users can view demos" ON demos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = demos.lead_id 
      AND (leads.org_id = get_user_org_id() OR is_super_admin())
    )
  );

CREATE POLICY "Users can manage demos" ON demos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = demos.lead_id 
      AND (
        (leads.org_id = get_user_org_id() AND get_user_role() IN ('admin', 'sales'))
        OR is_super_admin()
      )
    )
  );

-- Customer Subscriptions: Org-based access
CREATE POLICY "Super admin can view all subscriptions" ON customer_subscriptions
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Org users can view subscriptions" ON customer_subscriptions
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Admin and accountant can manage subscriptions" ON customer_subscriptions
  FOR ALL USING (
    (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'accountant'))
    OR is_super_admin()
  );

-- Payments: Same as subscriptions
CREATE POLICY "Users can view payments" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customer_subscriptions 
      WHERE customer_subscriptions.id = payments.subscription_id 
      AND (customer_subscriptions.org_id = get_user_org_id() OR is_super_admin())
    )
  );

CREATE POLICY "Accountant can manage payments" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customer_subscriptions 
      WHERE customer_subscriptions.id = payments.subscription_id 
      AND (
        (customer_subscriptions.org_id = get_user_org_id() AND get_user_role() IN ('admin', 'accountant'))
        OR is_super_admin()
      )
    )
  );

-- Invoices: Same as subscriptions
CREATE POLICY "Users can view invoices" ON invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customer_subscriptions 
      WHERE customer_subscriptions.id = invoices.subscription_id 
      AND (customer_subscriptions.org_id = get_user_org_id() OR is_super_admin())
    )
  );

CREATE POLICY "Accountant can manage invoices" ON invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customer_subscriptions 
      WHERE customer_subscriptions.id = invoices.subscription_id 
      AND (
        (customer_subscriptions.org_id = get_user_org_id() AND get_user_role() IN ('admin', 'accountant'))
        OR is_super_admin()
      )
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_demos_updated_at
  BEFORE UPDATE ON demos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customer_subscriptions_updated_at
  BEFORE UPDATE ON customer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_platform_plans_updated_at
  BEFORE UPDATE ON platform_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_org_subscriptions_updated_at
  BEFORE UPDATE ON org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_lead_sources_updated_at
  BEFORE UPDATE ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default platform plans
INSERT INTO platform_plans (name, description, monthly_price, yearly_price, max_users, max_leads_per_month, features) VALUES
('Starter', 'Perfect for small teams getting started', 29, 290, 5, 500, '{"features": ["Basic lead management", "Email support", "CSV import"]}'),
('Professional', 'For growing businesses with advanced needs', 79, 790, 15, 2000, '{"features": ["Everything in Starter", "Platform integrations", "Demo scheduling", "Priority support"]}'),
('Enterprise', 'Unlimited scale for large organizations', 199, 1990, -1, -1, '{"features": ["Everything in Professional", "Unlimited users", "Unlimited leads", "Custom integrations", "Dedicated support"]}');

-- Insert default platform settings
INSERT INTO platform_settings (key, value, description) VALUES
('app_name', '"LeadFlow CRM"', 'Application name'),
('app_logo', '"/logo.svg"', 'Application logo URL'),
('primary_color', '"#6366f1"', 'Primary brand color'),
('support_email', '"support@leadflow.com"', 'Support email address');

