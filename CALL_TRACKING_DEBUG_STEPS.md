# Call Tracking Debug Steps

## Issue: Calls made from app are not appearing in Analytics → Calls

### Step 1: Check if you're running in Native App
1. Open the app on your Android device
2. Open browser console (if using Chrome DevTools) or check Android Logcat
3. Look for: `[GLOBAL_CALL_TRACKER] Setting up global call tracking`
   - If you see this, native tracking is active
   - If you DON'T see this, the app might not be detecting as native

### Step 2: Check Android Logcat for Call Events
1. Connect your device via USB
2. Open Android Studio → Logcat
3. Filter by tag: `CallStateMonitor`
4. Make a call and watch for:
   - `Starting call monitoring for lead: [leadId], phone: [phone]`
   - `Call state changed: [state]`
   - `Sending CALL_ENDED event - status: [status], duration: [duration]s`

### Step 3: Check Browser Console for Event Reception
1. Open Chrome DevTools (if using remote debugging)
2. Go to Console tab
3. Make a call and look for:
   - `[GLOBAL_NATIVE_EVENT] Received event: CALL_ENDED`
   - `[GLOBAL_CALL_TRACKER] CALL_ENDED event received:`
   - `[GLOBAL_CALL_TRACKER] Call logged successfully:`

### Step 4: Verify Event Structure
The event should have this structure:
```json
{
  "type": "CALL_ENDED",
  "data": {
    "leadId": "[uuid]",
    "phoneNumber": "[phone]",
    "duration": 120,
    "status": "completed"
  }
}
```

### Step 5: Check API Call
1. In browser console, check Network tab
2. Look for POST request to `/api/calls/log`
3. Check:
   - Request payload (should have `lead_id`, `phone_number`, etc.)
   - Response status (should be 200 OK)
   - Response body (should have success message)

### Common Issues:

#### Issue 1: Event not received
**Symptoms:** No `[GLOBAL_CALL_TRACKER] CALL_ENDED event received` in console
**Possible causes:**
- `window.onNativeEvent` is not set up
- GlobalCallTracker component not mounted
- Event listener not registered

**Fix:** Check if `GlobalCallTracker` is in `src/app/layout.tsx`

#### Issue 2: Event received but leadId is empty
**Symptoms:** `[GLOBAL_CALL_TRACKER] Missing required data: { leadId: '', phoneNumber: '...' }`
**Possible causes:**
- `currentLeadId` is null in CallStateMonitor
- Lead ID not passed when initiating call

**Fix:** Check if `leadId` is passed when clicking call button

#### Issue 3: API call fails
**Symptoms:** `[GLOBAL_CALL_TRACKER] Failed to log call: [error]`
**Possible causes:**
- Authentication token missing
- API endpoint error
- Network issue

**Fix:** Check Network tab for error details

### Quick Test:
1. Open browser console
2. Manually trigger the event:
```javascript
window.onNativeEvent({
  type: 'CALL_ENDED',
  data: {
    leadId: '[YOUR_LEAD_ID]',
    phoneNumber: '+1234567890',
    duration: 60,
    status: 'completed'
  }
});
```
3. Check if you see `[GLOBAL_CALL_TRACKER] CALL_ENDED event received` in console
4. Check if API call is made to `/api/calls/log`
5. Check if call appears in Analytics → Calls

### Next Steps:
If the manual test works but real calls don't:
1. Check Android Logcat to see if `CALL_ENDED` event is being sent
2. Check if `window.onNativeEvent` is defined when the event is sent
3. Check timing - the event might be sent before the listener is set up

