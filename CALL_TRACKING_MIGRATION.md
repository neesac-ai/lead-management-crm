# Call Tracking Migration - Google Drive Sync to Native Tracking

## Summary
Migrating from Google Drive sync-based call tracking to native Android call tracking.

## Changes Made

### 1. Lead Detail Dialog (`src/components/leads/lead-detail-dialog.tsx`)
- ✅ Removed `call_recordings` state and type
- ✅ Removed `fetchCallRecordings` function
- ✅ Removed "Call Recordings" UI section
- ✅ Kept only "Call Tracking" section using `call_logs`

### 2. Analytics Page (`src/app/(dashboard)/[orgSlug]/analytics/page.tsx`)
- ⏳ Replace `fetchRecordings` with `fetchCallLogs`
- ⏳ Replace `call_recordings` table queries with `call_logs`
- ⏳ Remove Google Drive sync UI (sync button, warnings)
- ⏳ Update stats calculation to use call_logs data
- ⏳ Update call list display to show call_logs

### 3. Analytics API (`src/app/api/calls/analytics/route.ts`)
- ✅ Already using `call_logs` table (no changes needed)

### 4. Settings Page
- ⏳ Remove Google Drive sync settings UI
- ⏳ Mark as deprecated

### 5. Recordings API (`src/app/api/recordings/sync/route.ts`)
- ⏳ Mark as deprecated (keep for backward compatibility)

## Database Tables

### Keep:
- `call_logs` - Native call tracking (active)
- `call_recordings` - Keep table for historical data, but stop writing to it

### Deprecate:
- `drive_sync_settings` - No longer needed
- `deleted_recording_files` - No longer needed

## Next Steps
1. Complete analytics page migration
2. Remove sync UI from settings
3. Test native call tracking end-to-end
4. Document the new flow

