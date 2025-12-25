-- Rename lead status from demo to meeting
-- Run this in Supabase SQL Editor to update existing leads

UPDATE leads 
SET lead_status = 'meeting_booked' 
WHERE lead_status = 'demo_booked';

UPDATE leads 
SET lead_status = 'meeting_completed' 
WHERE lead_status = 'demo_completed';

-- Also update any lead_activities that reference these statuses
UPDATE lead_activities 
SET details = REPLACE(details::text, 'demo_booked', 'meeting_booked')::jsonb
WHERE details::text LIKE '%demo_booked%';

UPDATE lead_activities 
SET details = REPLACE(details::text, 'demo_completed', 'meeting_completed')::jsonb
WHERE details::text LIKE '%demo_completed%';



