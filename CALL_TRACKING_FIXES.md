# Call Tracking Fixes

## Issues Fixed

### 1. **Duplicate CALL_ENDED Events**
- **Problem:** Both `handleCallStateChange()` and `stopMonitoring()` were sending CALL_ENDED events, causing duplicate call logs
- **Fix:** Removed CALL_ENDED event from `stopMonitoring()` - it's now only sent from `handleCallStateChange()`

### 2. **False Positive on IDLE State**
- **Problem:** When monitoring started, if call state was IDLE, it would immediately trigger CALL_ENDED event
- **Fix:** Changed condition to only trigger CALL_ENDED if previous state was RINGING or OFFHOOK (not IDLE)

### 3. **Call Start Time Tracking**
- **Problem:** Call start time was set when dialer opened, not when call actually started ringing
- **Fix:** Updated call start time when RINGING state is detected (actual call start)

### 4. **Timeout Mechanism**
- **Problem:** If user cancelled dialer or app was backgrounded, monitoring would continue indefinitely
- **Fix:** Added 5-minute timeout to auto-stop monitoring if no call activity detected

### 5. **Better Logging**
- **Problem:** Difficult to debug call tracking issues
- **Fix:** Added comprehensive logging with `[CALL_TRACKING]` prefix in frontend and detailed logs in Android

## How It Works Now

### Call Flow:
1. **User clicks Call button** → `initiateCall()` called
2. **Dialer opens** → Monitoring starts, call state = IDLE
3. **User presses call button** → Call state changes to RINGING
   - Call start time updated
   - CALL_RINGING event sent
4. **Call answered** → Call state changes to OFFHOOK
   - CALL_CONNECTED event sent
   - Connected time recorded
5. **Call ends** → Call state changes to IDLE
   - CALL_ENDED event sent with duration and status
   - Frontend logs call to backend API
   - Call logs refreshed in UI

### Missed Call Flow:
1. **User clicks Call button** → `initiateCall()` called
2. **Dialer opens** → Monitoring starts
3. **Call rings but not answered** → Call state: IDLE → RINGING → IDLE
   - CALL_ENDED event sent with status="missed"
   - Duration = time from RINGING to IDLE

### Cancelled Call Flow:
1. **User clicks Call button** → `initiateCall()` called
2. **Dialer opens** → Monitoring starts
3. **User cancels before dialing** → No state change
   - Timeout (5 min) stops monitoring
   - No CALL_ENDED event (correct behavior)

## Testing

### Test Scenarios:

1. **Completed Call:**
   - Click call button → Answer call → Talk → Hang up
   - **Expected:** Call logged with status="completed" and correct duration

2. **Missed Call (Not Answered):**
   - Click call button → Let it ring → Hang up without answering
   - **Expected:** Call logged with status="missed" and ring duration

3. **Cancelled Call:**
   - Click call button → Cancel dialer before calling
   - **Expected:** No call logged (correct - no actual call happened)

4. **Check Call Logs:**
   - Open lead detail dialog → Go to "Calls" tab
   - **Expected:** See logged calls with correct status and duration

## Debugging

### Frontend Console Logs:
- `[CALL_TRACKING] Initiating call via native bridge`
- `[CALL_TRACKING] CALL_ENDED event received`
- `[CALL_TRACKING] Logging call to backend`
- `[CALL_TRACKING] Call logged successfully`

### Android Logcat:
- `CallStateMonitor: Starting call monitoring`
- `CallStateMonitor: Call state changed`
- `CallStateMonitor: Sending CALL_ENDED event`
- `CallTrackingBridge: Call logged successfully to backend`

## Next Steps

1. **Rebuild Android app** to apply native code changes
2. **Test call tracking** with various scenarios
3. **Check browser console** for `[CALL_TRACKING]` logs
4. **Check Android Logcat** for detailed call state changes
5. **Verify call logs** appear in lead detail dialog

