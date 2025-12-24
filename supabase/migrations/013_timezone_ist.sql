-- Timezone Configuration for IST (Indian Standard Time)
-- =====================================================
-- 
-- This migration sets the default timezone to IST for the database.
-- All timestamps will be stored in UTC but can be displayed in IST.
--
-- IMPORTANT: Supabase stores all timestamps in UTC. The conversion to IST
-- should primarily happen on the client side using JavaScript's date
-- formatting functions with the 'Asia/Kolkata' timezone.
--
-- However, if you need server-side IST timestamps, you can use these functions:

-- Set database timezone to IST (affects new connections)
ALTER DATABASE postgres SET timezone TO 'Asia/Kolkata';

-- Create a helper function to convert UTC to IST
CREATE OR REPLACE FUNCTION to_ist(ts TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
  SELECT ts AT TIME ZONE 'Asia/Kolkata';
$$ LANGUAGE SQL IMMUTABLE;

-- Create a helper function to get current time in IST
CREATE OR REPLACE FUNCTION now_ist()
RETURNS TIMESTAMPTZ AS $$
  SELECT NOW() AT TIME ZONE 'Asia/Kolkata';
$$ LANGUAGE SQL STABLE;

-- Example usage in queries:
-- SELECT to_ist(created_at) as created_at_ist FROM leads;
-- SELECT * FROM demos WHERE scheduled_at >= now_ist()::date;

-- =====================================================
-- CLIENT-SIDE RECOMMENDATIONS
-- =====================================================
-- 
-- For proper timezone handling in the frontend, use:
-- 
-- 1. date-fns-tz library (already installed):
--    import { formatInTimeZone } from 'date-fns-tz'
--    formatInTimeZone(new Date(timestamp), 'Asia/Kolkata', 'dd MMM yyyy, h:mm a')
--
-- 2. Native JavaScript:
--    new Date(timestamp).toLocaleString('en-IN', { 
--      timeZone: 'Asia/Kolkata',
--      dateStyle: 'medium',
--      timeStyle: 'short'
--    })
--
-- 3. When saving timestamps, always use UTC:
--    const utcDate = new Date(localDate).toISOString()
--
-- =====================================================

