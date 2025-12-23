-- Migration: Add Google OAuth tokens to users table
-- This stores the OAuth tokens for Google Calendar integration

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;

-- Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_google_tokens ON users(id) WHERE google_refresh_token IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN users.google_access_token IS 'Google OAuth access token for Calendar API';
COMMENT ON COLUMN users.google_refresh_token IS 'Google OAuth refresh token for obtaining new access tokens';
COMMENT ON COLUMN users.google_token_expiry IS 'Expiry timestamp for the Google access token';








