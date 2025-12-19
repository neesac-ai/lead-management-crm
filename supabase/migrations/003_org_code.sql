-- Add org_code to organizations and approved_by to users
-- Run this in your Supabase SQL Editor

-- Add org_code column to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS org_code VARCHAR(8) UNIQUE;

-- Add approved_by column to users (who approved this user)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

-- Add approved_at timestamp
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Function to generate unique org code
CREATE OR REPLACE FUNCTION generate_org_code(org_name TEXT)
RETURNS VARCHAR(8) AS $$
DECLARE
  prefix VARCHAR(4);
  suffix VARCHAR(4);
  new_code VARCHAR(8);
  code_exists BOOLEAN;
BEGIN
  -- Get first 4 chars of org name (uppercase, alphanumeric only)
  prefix := UPPER(SUBSTRING(REGEXP_REPLACE(org_name, '[^a-zA-Z0-9]', '', 'g'), 1, 4));
  
  -- Pad with 'X' if less than 4 chars
  prefix := RPAD(prefix, 4, 'X');
  
  -- Generate random 4-char suffix and check uniqueness
  LOOP
    suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4));
    new_code := prefix || suffix;
    
    SELECT EXISTS(SELECT 1 FROM organizations WHERE org_code = new_code) INTO code_exists;
    
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Generate org codes for existing organizations that don't have one
UPDATE organizations 
SET org_code = generate_org_code(name)
WHERE org_code IS NULL;

-- Now make org_code NOT NULL after populating existing records
ALTER TABLE organizations 
ALTER COLUMN org_code SET NOT NULL;

-- Create index for faster org_code lookups
CREATE INDEX IF NOT EXISTS idx_organizations_org_code ON organizations(org_code);

