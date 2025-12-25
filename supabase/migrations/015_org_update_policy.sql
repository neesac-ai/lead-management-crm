-- Allow admins to update their own organization
CREATE POLICY "Admin can update their org" ON organizations
  FOR UPDATE USING (
    id = get_user_org_id() 
    AND get_user_role() = 'admin'
  )
  WITH CHECK (
    id = get_user_org_id() 
    AND get_user_role() = 'admin'
  );



