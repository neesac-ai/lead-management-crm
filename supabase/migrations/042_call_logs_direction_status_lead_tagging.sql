-- Migration: Normalize call_direction semantics + extend call_status values
-- Goal:
-- - call_direction should represent direction only: incoming | outgoing
-- - call_status should represent outcome/type: completed | missed | rejected | blocked | busy | failed | voicemail | answered_externally | unknown

-- 1) Drop old CHECK constraints (names come from Postgres default naming)
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_call_direction_check;
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_call_status_check;

-- 2) Migrate existing rows where call_direction was overloaded with type-like values
--    Treat missed/rejected/blocked as incoming direction + same status
UPDATE call_logs
SET
  call_direction = 'incoming',
  call_status = call_direction
WHERE call_direction IN ('missed', 'rejected', 'blocked');

-- 3) Add new constraints
ALTER TABLE call_logs
  ADD CONSTRAINT call_logs_call_direction_check
  CHECK (call_direction IN ('incoming', 'outgoing'));

ALTER TABLE call_logs
  ADD CONSTRAINT call_logs_call_status_check
  CHECK (
    call_status IN (
      'completed',
      'missed',
      'rejected',
      'blocked',
      'busy',
      'failed',
      'voicemail',
      'answered_externally',
      'unknown'
    )
  );

