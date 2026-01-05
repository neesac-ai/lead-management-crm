# Testing Guide - Native Android App Integration

## Current Status

### ✅ What's Already Built

1. **Backend API Endpoints** (Ready to use)
   - Call Tracking: `/api/calls/log`, `/api/calls/[leadId]`, `/api/calls/analytics`
   - Location Tracking: `/api/locations/checkin`, `/api/locations/track`, `/api/locations/geofence`, `/api/locations/[leadId]`, `/api/locations/team`

2. **Database Migrations** (Need to be applied)
   - `supabase/migrations/032_call_logs.sql` - Call logs table
   - `supabase/migrations/033_location_tracking.sql` - Location tracking tables

3. **PWA Frontend Integration** (Ready to test)
   - Native bridge detection (`src/lib/native-bridge.ts`)
   - Updated contact actions with call tracking
   - Location check-in button
   - Download page
   - Settings page updates

4. **Android Native Code** (Needs to be built)
   - Call tracking bridge
   - Location tracking bridge
   - MainActivity with WebView

## What You Can Test Right Now (Without Android App)

### 1. PWA Frontend Changes

You can test the PWA frontend changes locally:

```bash
# Start your Next.js dev server
npm run dev
```

**Test these features:**
- ✅ Native bridge detection (will return `false` in browser, but code is ready)
- ✅ Download page at `/download`
- ✅ Settings page updates (shows native app download section)
- ✅ Contact actions UI (will fallback to `tel:` links in browser)
- ✅ Location check-in button (will use browser Geolocation API as fallback)

**Note:** The native features won't work in browser, but the UI and fallback behavior will work.

### 2. Backend API Endpoints

The API endpoints are ready, but you need to apply migrations first:

```bash
# Apply database migrations to your Supabase instance
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Apply manually via Supabase Dashboard
# Go to SQL Editor and run:
# - supabase/migrations/032_call_logs.sql
# - supabase/migrations/033_location_tracking.sql
```

**After migrations are applied, you can test:**
- ✅ POST `/api/calls/log` - Log call from native app
- ✅ GET `/api/calls/[leadId]` - Get call history for a lead
- ✅ POST `/api/locations/checkin` - Manual check-in
- ✅ POST `/api/locations/track` - Continuous location tracking
- ✅ GET `/api/locations/[leadId]` - Get location history

## What Requires Android App Build

### To Test Native Features Fully:

1. **Build Android APK**
   ```bash
   cd android
   ./gradlew assembleDebug
   # APK will be at: android/app/build/outputs/apk/debug/app-debug.apk
   ```

2. **Install on Android Device**
   - Enable "Install from Unknown Sources" in Android settings
   - Transfer APK to device and install
   - Grant required permissions when prompted

3. **Test Native Features**
   - Call tracking (exact duration from device call logs)
   - Location check-in (GPS coordinates)
   - Geofencing (automatic check-ins)

## Step-by-Step Testing Plan

### Phase 1: Test PWA Frontend (No Android App Needed)

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Test download page:**
   - Navigate to `http://localhost:3000/download`
   - Verify UI shows correctly
   - Check platform detection (should show "Desktop/Other Devices" on desktop)

3. **Test settings page:**
   - Navigate to `/[orgSlug]/settings`
   - Verify native app download section appears
   - Check that Google Drive sync shows as deprecated when using native app

4. **Test contact actions:**
   - Open any lead detail dialog
   - Click call button (should open `tel:` link in browser)
   - Verify UI shows correctly

5. **Test location check-in (browser fallback):**
   - Open lead detail dialog
   - Click "Check In" button (if visible - only shows in native app)
   - In browser, it will use Geolocation API

### Phase 2: Apply Database Migrations

1. **Apply migrations:**
   ```bash
   # Using Supabase CLI
   supabase db push

   # OR manually via Supabase Dashboard SQL Editor
   ```

2. **Verify tables created:**
   - Check Supabase Dashboard → Table Editor
   - Verify `call_logs` table exists
   - Verify `team_locations`, `geofences`, `visit_sessions`, `location_tracking_settings` tables exist

3. **Test API endpoints (using Postman/curl):**
   ```bash
   # Test call log endpoint
   curl -X POST http://localhost:3000/api/calls/log \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{
       "lead_id": "lead-uuid",
       "phone_number": "+1234567890",
       "call_direction": "OUTGOING",
       "call_status": "COMPLETED",
       "duration_seconds": 120
     }'

   # Test location check-in endpoint
   curl -X POST http://localhost:3000/api/locations/checkin \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{
       "lead_id": "lead-uuid",
       "latitude": 12.9716,
       "longitude": 77.5946,
       "accuracy": 10.5
     }'
   ```

### Phase 3: Build and Test Android App

1. **Build APK:**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

2. **Install on device:**
   - Transfer `android/app/build/outputs/apk/debug/app-debug.apk` to Android device
   - Install APK
   - Grant permissions: Location, Phone, Call Logs

3. **Test native features:**
   - Open app (should load PWA)
   - Navigate to a lead
   - Click "Call" button → Should open dialer and track call
   - Click "Check In" button → Should get GPS location and log check-in
   - Verify call logs appear in lead detail dialog
   - Verify location history appears

## Quick Test Checklist

### ✅ Can Test Now (PWA Frontend)
- [ ] Download page UI
- [ ] Settings page native app section
- [ ] Contact actions UI (browser fallback)
- [ ] Location check-in UI (browser Geolocation fallback)
- [ ] Native bridge detection (returns false in browser)

### ⚠️ Needs Database Migrations
- [ ] Apply `032_call_logs.sql` migration
- [ ] Apply `033_location_tracking.sql` migration
- [ ] Test API endpoints with Postman/curl

### 📱 Needs Android App Build
- [ ] Build APK (`./gradlew assembleDebug`)
- [ ] Install on Android device
- [ ] Test call tracking
- [ ] Test location check-in
- [ ] Test geofencing

## Troubleshooting

### API Endpoints Return 500 Error
- **Cause:** Database migrations not applied
- **Fix:** Apply migrations via `supabase db push` or Supabase Dashboard

### Native Bridge Not Detected
- **Cause:** Running in browser, not native app
- **Fix:** This is expected. Native bridge only works in Android app.

### Location Check-In Not Working in Browser
- **Cause:** Browser Geolocation API requires HTTPS (or localhost)
- **Fix:** Use `http://localhost:3000` or deploy with HTTPS

### Android App Build Fails
- **Cause:** Missing dependencies or configuration
- **Fix:**
  - Check `android/build.gradle` and `android/app/build.gradle`
  - Ensure Android SDK is installed
  - Run `./gradlew clean` and try again

## Next Steps

1. **Test PWA frontend** (can do now)
2. **Apply database migrations** (required for API endpoints)
3. **Build Android app** (required for native features)
4. **Test end-to-end** (native app → PWA → backend)

## Summary

**You can test the PWA frontend changes right now** without the Android app or migrations. The UI will work with browser fallbacks.

**To test the full functionality**, you need:
1. ✅ Database migrations applied (5 minutes)
2. ✅ Android app built and installed (15-30 minutes)

The backend APIs are already created and ready - they just need the database tables to exist!
