# Call Tracking Debugging Guide

## Issue: Call data not appearing after making a call

### Changes Made

1. **Global Event Listener** (`src/lib/global-native-events.ts`)
   - Created a persistent event listener that survives component mounts/unmounts
   - Multiple components can listen to the same events
   - Prevents event loss when navigating away from lead page

2. **Global Call Tracker** (`src/components/global-call-tracker.tsx`)
   - Listens for CALL_ENDED events globally
   - Automatically logs calls to backend
   - Triggers refresh events for UI components

3. **Improved Android Event Sending** (`CallStateMonitor.kt`)
   - Multiple retry attempts to ensure event is received
   - Better logging for debugging
   - Alternative JavaScript evaluation methods

4. **Auto-refresh Call Logs** (`lead-detail-dialog.tsx`)
   - Automatically fetches call logs when dialog opens
   - Ensures data is fresh even if event was missed

## Debugging Steps

### 1. Check Browser Console (Chrome DevTools)

Open Chrome DevTools → Console tab and look for:

```
[GLOBAL_NATIVE_EVENT] Global listener setup complete
[GLOBAL_CALL_TRACKER] Setting up global call tracking
[GLOBAL_CALL_TRACKER] CALL_ENDED event received: {...}
[GLOBAL_CALL_TRACKER] Call logged successfully: {...}
```

**If you don't see these logs:**
- The event listener might not be set up
- Check if `window.onNativeEvent` exists: `console.log(typeof window.onNativeEvent)`
- Should be `"function"`

### 2. Check Android Logcat

In Android Studio → Logcat, filter by:
- `CallStateMonitor`
- `CallTrackingBridge`

Look for:
```
CallStateMonitor: Call state changed: 0 (current state: RINGING)
CallStateMonitor: Sending event to JS: CALL_ENDED with data: {...}
CallStateMonitor: Sending event to JS: CALL_ENDED with data: {...}
```

**If you don't see these logs:**
- Call state monitor might not be detecting call end
- Check permissions: `READ_PHONE_STATE` and `READ_CALL_LOG`

### 3. Test Event Reception

In browser console, manually test:
```javascript
// Check if event handler exists
console.log(typeof window.onNativeEvent)

// Manually trigger an event (for testing)
window.onNativeEvent({
  type: 'CALL_ENDED',
  data: {
    leadId: 'test-lead-id',
    phoneNumber: '1234567890',
    duration: 30,
    status: 'completed'
  }
})
```

You should see:
- `[GLOBAL_CALL_TRACKER] CALL_ENDED event received`
- Toast notification: "Call logged successfully"

### 4. Check API Response

In browser console → Network tab:
- Look for POST request to `/api/calls/log`
- Check response status (should be 200)
- Check response body for errors

### 5. Check Database

In Supabase:
- Go to `call_logs` table
- Check if new records are being inserted
- Verify `lead_id`, `phone_number`, `call_status`, `duration_seconds`

### 6. Verify Permissions

In Android app:
- Settings → Apps → BharatCRM → Permissions
- Ensure "Phone" permission is granted
- Ensure "Call Logs" permission is granted (if available)

## Common Issues

### Issue 1: Event not received
**Symptoms:** No `[GLOBAL_CALL_TRACKER]` logs in console
**Solution:**
- Check if WebView JavaScript is enabled
- Check if `window.onNativeEvent` is defined
- Verify Android code is sending events (check Logcat)

### Issue 2: API call fails
**Symptoms:** `[GLOBAL_CALL_TRACKER] Failed to log call` in console
**Solution:**
- Check Network tab for API errors
- Verify authentication token is valid
- Check API route `/api/calls/log` is accessible

### Issue 3: Call logs not refreshing
**Symptoms:** Call logged but not visible in UI
**Solution:**
- Check if `callLogged` event is dispatched
- Verify `fetchCallLogs` is called when dialog opens
- Check browser console for errors

### Issue 4: Call state not detected
**Symptoms:** No Android logs for call state changes
**Solution:**
- Verify permissions are granted
- Check if `PhoneStateListener` is registered
- Verify `TelephonyManager` is accessible

## Testing Checklist

- [ ] Make a call and answer it
- [ ] Check browser console for `[GLOBAL_CALL_TRACKER]` logs
- [ ] Check Android Logcat for `CallStateMonitor` logs
- [ ] Verify API call to `/api/calls/log` succeeds
- [ ] Check Supabase `call_logs` table for new record
- [ ] Open lead detail dialog → Calls tab → Verify call appears
- [ ] Make a missed call (ring but don't answer)
- [ ] Verify missed call is logged with status="missed"

## Next Steps

1. **Rebuild Android app** to apply native code changes
2. **Test call tracking** with various scenarios
3. **Check logs** in both browser console and Android Logcat
4. **Verify data** in Supabase database
5. **Report any issues** with specific error messages and logs

