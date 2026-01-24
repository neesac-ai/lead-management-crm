# BharatCRM Native Android Wrapper

Native Android wrapper app that loads the PWA (bharatcrm.neesac.ai) in a WebView and provides JavaScript bridges for:
- Call tracking (exact duration and status)
- Geo location tracking (foreground-only)

## Project Structure

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/neesac/bharatcrm/
│   │   │   │   ├── MainActivity.kt          # Main activity with WebView
│   │   │   │   ├── NativeBridge.kt          # Base JavaScript bridge
│   │   │   │   ├── CallTrackingBridge.kt     # Call tracking bridge
│   │   │   │   ├── CallLogReader.kt         # Call log reader
│   │   │   │   ├── CallStateMonitor.kt       # Call state monitor
│   │   │   │   ├── LocationBridge.kt        # Location bridge
│   │   │   │   ├── LocationManager.kt        # Location manager
│   │   │   │   └── (no background tracking service in Phase 1)
│   │   │   ├── res/
│   │   │   │   ├── layout/
│   │   │   │   │   └── activity_main.xml
│   │   │   │   └── values/
│   │   │   │       ├── strings.xml
│   │   │   │       ├── colors.xml
│   │   │   │       └── themes.xml
│   │   │   └── AndroidManifest.xml
│   │   └── build.gradle
│   └── build.gradle
├── build.gradle
└── settings.gradle
```

## Requirements

- Android Studio Hedgehog (2023.1.1) or later
- JDK 8 or later
- Android SDK 21 (Android 5.0) minimum
- Target SDK 34 (Android 14)

## Setup

1. Open Android Studio
2. Open the `android` folder as a project
3. Sync Gradle files
4. Build and run on device or emulator

## Building APK

### Debug APK
```bash
./gradlew assembleDebug
```

### Release APK
```bash
./gradlew assembleRelease
```

The APK will be generated at: `app/build/outputs/apk/release/app-release.apk`

## Permissions

The app requires the following permissions:
- `READ_CALL_LOG` - For call tracking
- `READ_PHONE_STATE` - For call state monitoring
- `ACCESS_FINE_LOCATION` - For location tracking
- `INTERNET` - For API calls

## JavaScript Bridge API

The PWA can interact with native features via `window.NativeBridge`:

### Call Tracking
```javascript
// Initiate call and start tracking
window.NativeBridge.initiateCall(leadId, phoneNumber)

// Get call logs
const logs = JSON.parse(window.NativeBridge.getCallLogs(phoneNumber, limit))

// Get last call status
const status = JSON.parse(window.NativeBridge.getLastCallStatus())
```

### Recording
```javascript
// Call recording is disabled for now
```

### Location
```javascript
// Get current location
const location = JSON.parse(window.NativeBridge.getCurrentLocation())

// Start continuous tracking
window.NativeBridge.startTracking(intervalSeconds)

// Stop tracking
window.NativeBridge.stopTracking()

// Manual check-in
window.NativeBridge.checkIn(leadId, notes)

// Add geofence
window.NativeBridge.addGeofence(leadId, lat, lng, radius)

// Remove geofence
window.NativeBridge.removeGeofence(leadId)
```

### Events from Native to JavaScript

The native app can send events to JavaScript:
```javascript
window.onNativeEvent = (event) => {
  console.log('Native event:', event.type, event.data)
  // Handle events like: CALL_COMPLETED, RECORDING_STOPPED, LOCATION_UPDATED, etc.
}
```

## Implementation Status

- ✅ Phase 1: Android project structure and base files
- ⏳ Phase 2: Call tracking implementation
- ⏳ Phase 3: Call recording implementation
- ⏳ Phase 4: Geo location tracking implementation
- ⏳ Phase 5: PWA integration
- ⏳ Phase 6: Backend API endpoints
- ⏳ Phase 7: APK build and distribution

## Development Notes

- The app loads `https://bharatcrm.neesac.ai` in a WebView
- All native functionality is exposed via JavaScript bridges
- Permissions are requested dynamically when needed
- The app supports deep links: `bharatcrm://app/path`

## Next Steps

1. Implement Phase 2: Call tracking (CallLogReader, CallStateMonitor)
2. Implement Phase 3: Location tracking (LocationManager)
4. Create backend API endpoints
5. Create database migrations
6. Build and test APK


