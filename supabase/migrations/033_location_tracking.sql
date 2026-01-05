-- Migration: Add location tracking tables
-- Supports check-in, continuous tracking, and geofencing

-- Create team_locations table for location tracking
CREATE TABLE IF NOT EXISTS team_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy FLOAT,
  address TEXT,
  location_type VARCHAR(20) NOT NULL CHECK (location_type IN ('checkin', 'tracking', 'geofence')),
  tracking_session_id UUID,
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create geofences table
CREATE TABLE IF NOT EXISTS geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_meters DECIMAL(10, 2) NOT NULL,
  name VARCHAR(255),
  auto_checkin_enabled BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create visit_sessions table for visit tracking
CREATE TABLE IF NOT EXISTS visit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  start_latitude DECIMAL(10, 8),
  start_longitude DECIMAL(11, 8),
  end_latitude DECIMAL(10, 8),
  end_longitude DECIMAL(11, 8),
  verified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create location_tracking_settings table for user preferences
CREATE TABLE IF NOT EXISTS location_tracking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_tracking_enabled BOOLEAN DEFAULT false,
  tracking_mode VARCHAR(20) DEFAULT 'manual' CHECK (tracking_mode IN ('manual', 'continuous', 'geofence')),
  work_hours_start TIME,
  work_hours_end TIME,
  privacy_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_locations_org_id ON team_locations(org_id);
CREATE INDEX IF NOT EXISTS idx_team_locations_user_id ON team_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_team_locations_lead_id ON team_locations(lead_id);
CREATE INDEX IF NOT EXISTS idx_team_locations_recorded_at ON team_locations(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_locations_tracking_session ON team_locations(tracking_session_id);
CREATE INDEX IF NOT EXISTS idx_team_locations_user_recorded ON team_locations(user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_geofences_org_id ON geofences(org_id);
CREATE INDEX IF NOT EXISTS idx_geofences_lead_id ON geofences(lead_id);
CREATE INDEX IF NOT EXISTS idx_geofences_location ON geofences(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_visit_sessions_org_id ON visit_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_user_id ON visit_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_lead_id ON visit_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_started_at ON visit_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_tracking_settings_user_id ON location_tracking_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_settings_org_id ON location_tracking_settings(org_id);

-- Enable RLS
ALTER TABLE team_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_tracking_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_locations

-- Users can view their own locations
CREATE POLICY "Users can view their own locations" ON team_locations
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR is_super_admin()
  );

-- Admins can view all locations in their org
CREATE POLICY "Admins can view org locations" ON team_locations
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- Users can create their own location entries
CREATE POLICY "Users can create their own locations" ON team_locations
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- RLS Policies for geofences

-- Users can view geofences in their org
CREATE POLICY "Users can view org geofences" ON geofences
  FOR SELECT USING (
    org_id = get_user_org_id() OR is_super_admin()
  );

-- Users can create geofences for leads in their org
CREATE POLICY "Users can create geofences" ON geofences
  FOR INSERT WITH CHECK (
    created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- Users can update their own geofences
CREATE POLICY "Users can update their geofences" ON geofences
  FOR UPDATE USING (
    created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- Users can delete their own geofences
CREATE POLICY "Users can delete their geofences" ON geofences
  FOR DELETE USING (
    created_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- RLS Policies for visit_sessions

-- Users can view their own visit sessions
CREATE POLICY "Users can view their own visits" ON visit_sessions
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR is_super_admin()
  );

-- Admins can view all visits in their org
CREATE POLICY "Admins can view org visits" ON visit_sessions
  FOR SELECT USING (
    org_id = get_user_org_id()
    AND get_user_role() IN ('admin', 'super_admin')
  );

-- Users can create their own visit sessions
CREATE POLICY "Users can create their own visits" ON visit_sessions
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- Users can update their own visit sessions
CREATE POLICY "Users can update their own visits" ON visit_sessions
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- RLS Policies for location_tracking_settings

-- Users can view their own settings
CREATE POLICY "Users can view their own settings" ON location_tracking_settings
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR is_super_admin()
  );

-- Users can create/update their own settings
CREATE POLICY "Users can manage their own settings" ON location_tracking_settings
  FOR ALL USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (org_id = get_user_org_id() OR is_super_admin())
  );

-- Add triggers to update updated_at
CREATE OR REPLACE FUNCTION update_geofences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_geofences_updated_at
  BEFORE UPDATE ON geofences
  FOR EACH ROW
  EXECUTE FUNCTION update_geofences_updated_at();

CREATE OR REPLACE FUNCTION update_visit_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_visit_sessions_updated_at
  BEFORE UPDATE ON visit_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_visit_sessions_updated_at();

CREATE OR REPLACE FUNCTION update_location_tracking_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_location_tracking_settings_updated_at
  BEFORE UPDATE ON location_tracking_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_location_tracking_settings_updated_at();

