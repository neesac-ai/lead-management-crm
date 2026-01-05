# Android App Build and Testing Guide

## Prerequisites

1. **Android Studio** (Hedgehog 2023.1.1 or later)
   - Download from: https://developer.android.com/studio

2. **JDK 8 or later**
   - Usually comes with Android Studio

3. **Android SDK**
   - Minimum SDK: 21 (Android 5.0)
   - Target SDK: 34 (Android 14)
   - Install via Android Studio SDK Manager

4. **Physical Device or Emulator**
   - For testing call tracking, a physical device is recommended
   - Emulator can work for location tracking

## Step 1: Configure PWA URL (Optional for Local Testing)

If you want to test against your local dev server instead of production:

1. Open `android/app/src/main/res/values/strings.xml`
2. Change the URL:
   ```xml
   <string name="pwa_url">http://10.0.2.2:3000</string>
   ```
   - `10.0.2.2` is the special IP for Android emulator to access host machine
   - For physical device, use your computer's local IP (e.g., `http://192.168.1.100:3000`)

**Note:** For production, keep it as `https://bharatcrm.neesac.ai`

## Step 2: Build the APK

### Option A: Using Android Studio (Recommended)

1. Open Android Studio
2. Click "Open" and select the `android` folder
3. Wait for Gradle sync to complete
4. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. Wait for build to complete
6. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Option B: Using Command Line

```bash
# Navigate to android directory
cd android

# Build debug APK
./gradlew assembleDebug

# On Windows (Git Bash)
./gradlew.bat assembleDebug

# APK will be at: app/build/outputs/apk/debug/app-debug.apk
```

## Step 3: Install APK on Device

### Physical Device

1. Enable **Developer Options** on your Android device:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times

2. Enable **USB Debugging**:
   - Settings → Developer Options → USB Debugging (ON)

3. Connect device via USB

4. Install APK:
   ```bash
   # Using ADB (Android Debug Bridge)
   adb install app/build/outputs/apk/debug/app-debug.apk

   # Or transfer APK to device and install manually
   ```

### Emulator

1. Start Android Emulator from Android Studio
2. Drag and drop the APK file onto the emulator
3. Or use ADB:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

## Step 4: Grant Permissions

When you first open the app, it will request permissions:

1. **Phone** - For call tracking (READ_CALL_LOG, READ_PHONE_STATE)
2. **Location** - For location tracking (ACCESS_FINE_LOCATION)
3. **Microphone** - For call recording (RECORD_AUDIO) - Optional for now

**Grant all permissions** when prompted.

## Step 5: Testing Features

### Test 1: PWA Loading

1. Open the app
2. You should see the PWA loading in the WebView
3. Log in with your credentials
4. Verify the app loads correctly

### Test 2: Native Bridge Detection

1. Open browser console in the PWA (if possible via remote debugging)
2. Or add a test button in your PWA that checks:
   ```javascript
   if (window.NativeBridge) {
     console.log('✅ Native bridge detected!')
   } else {
     console.log('❌ Native bridge not found')
   }
   ```

### Test 3: Call Tracking

**Prerequisites:** Physical device with SIM card

1. Navigate to a lead in the PWA
2. Click the call button
3. The app should:
   - Request phone permission (if not granted)
   - Initiate the call
   - Track call duration
   - Log call to backend when call ends

**Verify:**
- Check Supabase `call_logs` table for the call entry
- Check call duration is accurate
- Check call status (completed, missed, etc.)

### Test 4: Location Tracking

1. **Manual Check-In:**
   - Navigate to a lead detail page
   - Click "Check In" button
   - Grant location permission if prompted
   - Verify location is saved to `team_locations` table

2. **Continuous Tracking:**
   - In browser console or via PWA UI:
     ```javascript
     window.NativeBridge.startTracking(60) // Track every 60 seconds
     ```
   - Wait a few minutes
   - Check `team_locations` table for tracking entries
   - Stop tracking:
     ```javascript
     window.NativeBridge.stopTracking()
     ```

**Verify:**
- Check Supabase `team_locations` table
- Verify `location_type` is 'tracking' for continuous tracking
- Verify `location_type` is 'checkin' for manual check-ins

### Test 5: Get Current Location

In browser console:
```javascript
const location = JSON.parse(window.NativeBridge.getCurrentLocation())
console.log('Location:', location)
```

### Test 6: Call Logs

In browser console:
```javascript
// Get call logs for a phone number
const logs = JSON.parse(window.NativeBridge.getCallLogs('+1234567890', 10))
console.log('Call logs:', logs)
```

## Step 6: Debugging

### Enable Remote Debugging

1. Connect device via USB
2. Enable USB Debugging
3. Open Chrome browser on your computer
4. Go to: `chrome://inspect`
5. Find your device and click "Inspect"
6. You can now see console logs, network requests, etc.

### View Android Logs

```bash
# View all logs
adb logcat

# Filter by app
adb logcat | grep BharatCRM

# Filter by tag
adb logcat | grep CallTrackingBridge
adb logcat | grep LocationBridge
```

### Common Issues

1. **App crashes on startup:**
   - Check Android logs: `adb logcat`
   - Verify all dependencies are synced in Android Studio

2. **Native bridge not found:**
   - Check WebView JavaScript is enabled
   - Verify `NativeBridge` is initialized in `MainActivity`
   - Check browser console for errors

3. **Permissions not working:**
   - Go to Settings → Apps → BharatCRM → Permissions
   - Manually grant permissions
   - Restart app

4. **Location not working:**
   - Verify location services are enabled on device
   - Check if GPS is enabled
   - For emulator, set location via Extended Controls

5. **Call tracking not working:**
   - Requires physical device (emulator may not work)
   - Verify phone permissions are granted
   - Check if device supports call log access

## Step 7: Verify Backend Integration

After testing native features, verify data is saved:

1. **Check Supabase Dashboard:**
   - `call_logs` table → Should have call entries
   - `team_locations` table → Should have location entries

2. **Check API responses:**
   - Use the test page: `http://localhost:3000/test-apis.html`
   - Or check Supabase directly

## Next Steps

Once everything works:

1. ✅ Test all features thoroughly
2. ✅ Fix any bugs found
3. ✅ Implement Phase 3 (Call Recording) if needed
4. ✅ Build release APK for distribution
5. ✅ Set up app signing for Play Store

## Build Release APK (When Ready)

```bash
cd android

# Build release APK (unsigned)
./gradlew assembleRelease

# APK will be at: app/build/outputs/apk/release/app-release-unsigned.apk

# For Play Store, you'll need to sign it (see Android documentation)
```

---

**Need Help?** Check Android logs, browser console, and Supabase dashboard for errors.

