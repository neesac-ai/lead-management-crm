-- Auto-create user profile when a new user signs up
-- Run this in your Supabase SQL Editor AFTER 001_initial_schema.sql
-- NOTE: With the new registration flow, profiles are created by the API routes
-- This trigger is kept as a fallback for edge cases

-- Function to handle new user signup (fallback only)
-- The main registration flow creates profiles via API
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create profile if it doesn't exist
  -- The API routes handle the main registration flow
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE auth_id = NEW.id) THEN
    INSERT INTO public.users (auth_id, email, name, role, is_approved)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'role', 'admin')::user_role,
      false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on signup (fallback)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT ON public.users TO supabase_auth_admin;
GRANT SELECT ON public.users TO supabase_auth_admin;

