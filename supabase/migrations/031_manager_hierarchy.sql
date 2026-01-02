-- Manager-Reportee Hierarchy Migration
-- Implements multi-level organizational hierarchy where users can be assigned managers
-- Managers can view and manage all leads assigned to their direct and indirect reportees

-- =====================================================
-- ADD MANAGER_ID COLUMN TO USERS TABLE
-- =====================================================

-- Add manager_id column to users table (self-referencing foreign key)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add indexes for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_org_manager ON users(org_id, manager_id);

-- Add constraint to prevent circular references (user cannot be their own manager)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_no_self_manager'
  ) THEN
    ALTER TABLE users 
    ADD CONSTRAINT check_no_self_manager CHECK (manager_id != id);
  END IF;
END $$;

-- =====================================================
-- HELPER FUNCTIONS FOR HIERARCHY QUERIES
-- =====================================================

-- Function to get all reportee IDs (direct and indirect) for a manager
CREATE OR REPLACE FUNCTION get_all_reportees(manager_user_id UUID)
RETURNS TABLE(reportee_id UUID) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE reportee_tree AS (
    -- Direct reportees
    SELECT id, manager_id, 1 as level
    FROM users
    WHERE manager_id = manager_user_id
      AND org_id = (SELECT org_id FROM users WHERE id = manager_user_id)
    
    UNION ALL
    
    -- Indirect reportees (recursive)
    SELECT u.id, u.manager_id, rt.level + 1
    FROM users u
    INNER JOIN reportee_tree rt ON u.manager_id = rt.id
    WHERE u.org_id = (SELECT org_id FROM users WHERE id = manager_user_id)
  )
  SELECT id FROM reportee_tree;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user A can manage user B (direct or indirect reportee)
CREATE OR REPLACE FUNCTION can_manage_user(manager_id UUID, target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admin can always manage
  IF (SELECT role FROM users WHERE id = manager_id) = 'super_admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Admin can manage users in same org
  IF (SELECT role FROM users WHERE id = manager_id) = 'admin' THEN
    RETURN (
      SELECT org_id FROM users WHERE id = manager_id
    ) = (
      SELECT org_id FROM users WHERE id = target_user_id
    );
  END IF;
  
  -- Check if target is a reportee (direct or indirect)
  RETURN EXISTS (
    SELECT 1 FROM get_all_reportees(manager_id) 
    WHERE reportee_id = target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get all reportee IDs for current user (if they are a manager)
-- Used in RLS policies
CREATE OR REPLACE FUNCTION get_user_reportees()
RETURNS TABLE(reportee_id UUID) AS $$
DECLARE
  current_user_id UUID;
BEGIN
  SELECT id INTO current_user_id 
  FROM users 
  WHERE auth_id = auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT * FROM get_all_reportees(current_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- UPDATE RLS POLICIES FOR LEADS TABLE
-- =====================================================

-- Drop existing policies that will be replaced
DROP POLICY IF EXISTS "Admin can view all org leads" ON leads;
DROP POLICY IF EXISTS "Sales can view assigned leads" ON leads;
DROP POLICY IF EXISTS "Users can view leads based on hierarchy" ON leads;

-- New policy: Users can view leads if:
-- 1. They are super admin (all leads)
-- 2. They are admin (all org leads)
-- 3. They are assigned to the lead
-- 4. The lead is assigned to one of their reportees
CREATE POLICY "Users can view leads based on hierarchy" ON leads
  FOR SELECT USING (
    -- Super admin can see all
    is_super_admin()
    OR
    -- Admin can see all org leads
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR
    -- User can see their own assigned leads
    (org_id = get_user_org_id() 
     AND assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR
    -- Manager can see leads assigned to their reportees
    (org_id = get_user_org_id()
     AND assigned_to IN (SELECT reportee_id FROM get_user_reportees()))
  );

-- Drop existing update policy
DROP POLICY IF EXISTS "Admin and sales can manage leads" ON leads;
DROP POLICY IF EXISTS "Users can manage leads based on hierarchy" ON leads;

-- New policy: Users can update leads if:
-- 1. They are super admin
-- 2. They are admin (all org leads)
-- 3. They are assigned to the lead
-- 4. The lead is assigned to one of their reportees
CREATE POLICY "Users can manage leads based on hierarchy" ON leads
  FOR UPDATE USING (
    is_super_admin()
    OR
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR
    (org_id = get_user_org_id() 
     AND assigned_to = (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR
    (org_id = get_user_org_id()
     AND assigned_to IN (SELECT reportee_id FROM get_user_reportees()))
  );

-- Also update INSERT policy to allow managers to create leads for reportees
DROP POLICY IF EXISTS "Users can create leads" ON leads;
DROP POLICY IF EXISTS "Admin and sales can create leads" ON leads;

CREATE POLICY "Users can create leads based on hierarchy" ON leads
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR
    (org_id = get_user_org_id() 
     AND created_by = (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR
    (org_id = get_user_org_id()
     AND assigned_to IN (
       SELECT reportee_id FROM get_user_reportees()
       UNION
       SELECT id FROM users WHERE auth_id = auth.uid()
     ))
  );

-- Also update DELETE policy
DROP POLICY IF EXISTS "Admin can delete leads" ON leads;

CREATE POLICY "Users can delete leads based on hierarchy" ON leads
  FOR DELETE USING (
    is_super_admin()
    OR
    (org_id = get_user_org_id() AND get_user_role() = 'admin')
    OR
    (org_id = get_user_org_id() 
     AND created_by = (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR
    (org_id = get_user_org_id()
     AND assigned_to IN (SELECT reportee_id FROM get_user_reportees()))
  );

