# Duplicate Lead Submission Fix

## Problem
When adding a lead in a specific account, duplicate entries were being created automatically. This issue only occurred on one system but worked fine when logging in from a different system. This indicates a **browser/system-specific issue** rather than a code-level problem.

## Root Causes Identified

1. **Race Condition in Form Submission**
   - The `handleSubmit` function didn't check if a submission was already in progress
   - Multiple rapid clicks or form submissions could trigger multiple API calls before the `isSaving` state was set
   - React state updates are asynchronous, so checking `isSaving` wasn't sufficient to prevent race conditions

2. **No Request Deduplication**
   - No mechanism to prevent submitting the same phone number multiple times in quick succession
   - Browser autofill or form autocomplete could trigger duplicate submissions

3. **Browser-Specific Issues (Account + System Specific)**
   - Browser autofill/form autocomplete triggering duplicate submissions
   - Browser extensions (password managers, form fillers) auto-submitting forms
   - Corrupted browser state/cache for that specific account
   - Service worker cache issues
   - Multiple tabs/windows open with the same form
   - Browser form data persistence and restoration
   - Event listeners being registered multiple times by extensions

## Solution Implemented

### 1. Added Submission Guard Using Refs
- Used `useRef` to track submission state (more reliable than state for preventing race conditions)
- Added `isSubmittingRef` to track if a submission is in progress
- Added `lastSubmittedPhoneRef` to prevent submitting the same phone number twice quickly
- Added `formSubmissionIdRef` with unique IDs to prevent browser replay attacks
- Added `formSubmissionTimeRef` to prevent rapid re-submissions (1-second cooldown)

### 2. Enhanced Form Submission Handler
- Added `e.stopPropagation()` to prevent event bubbling (browser extensions might trigger multiple events)
- Added early return checks at the start of `handleSubmit` to prevent duplicate submissions
- Added unique submission ID generation to prevent browser replay attacks
- Added time-based cooldown (1 second minimum between submissions)
- Added phone number deduplication check with 3-second window
- Added proper cleanup in `finally` block with a 2-second cooldown period

### 3. Improved `addLead` Function
- Added double-check to prevent duplicate calls
- Properly reset submission flags after completion
- Added timeout to reset phone ref after successful submission

### 4. Enhanced Button State
- Submit button now checks multiple conditions: `isSaving`, `isCheckingDuplicate`, and `isSubmittingRef.current`
- Button shows appropriate loading state

### 5. Dialog Cleanup
- Reset all submission flags when dialog closes
- Ensures clean state for next submission

### 6. Browser Autofill Prevention
- Added `autoComplete="off"` to form and all input fields
- Added `noValidate` to form to prevent browser validation that might trigger events
- Added proper `name` and `type` attributes to all inputs
- Prevents browser autofill from triggering duplicate submissions

## Code Changes

### Key Additions:
```typescript
// Refs for preventing duplicate submissions
const isSubmittingRef = useRef(false)
const lastSubmittedPhoneRef = useRef<string | null>(null)
const formSubmissionIdRef = useRef<string | null>(null)
const formSubmissionTimeRef = useRef<number>(0)
```

### Form Element:
```tsx
<form
  onSubmit={handleSubmit}
  autoComplete="off"  // Prevent browser autofill
  noValidate          // Prevent browser validation
  id="add-lead-form"
>
```

### Input Fields:
```tsx
<Input
  autoComplete="off"  // Prevent autofill on each field
  name="phone"        // Proper name attribute
  type="tel"          // Proper type attribute
/>
```

### Enhanced `handleSubmit`:
- `e.stopPropagation()` to prevent event bubbling
- Unique submission ID generation
- Time-based cooldown check (1 second minimum)
- Early return if already submitting
- Phone number deduplication check (3-second window)
- Proper cleanup with timeout

### Enhanced `addLead`:
- Double-check before proceeding
- Proper flag management

## Testing Recommendations

1. **Test Rapid Clicks**: Click the submit button multiple times rapidly
2. **Test Browser Autofill**: Use browser autofill to fill the form
3. **Test Multiple Tabs**: Open the same form in multiple tabs and submit
4. **Test Service Worker**: Clear browser cache and service worker
5. **Test Network Delays**: Simulate slow network to test race conditions

## Additional Troubleshooting Steps (For Account + System Specific Issues)

If duplicates still occur on a specific system/account:

1. **Clear Browser Data for That Account**
   - Open DevTools → Application → Storage → Clear site data
   - Unregister service worker: Application → Service Workers → Unregister
   - Clear browser cache and cookies for the site
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

2. **Disable Browser Extensions**
   - Test in incognito/private mode (extensions usually disabled)
   - Disable password managers (LastPass, 1Password, etc.)
   - Disable form fillers or automation extensions
   - Check `chrome://extensions/` for form-related extensions

3. **Check Browser Autofill Settings**
   - Disable "Autofill forms" in browser settings
   - Clear saved form data for the site
   - Check if browser is auto-submitting on autofill

4. **Check for Multiple Tabs/Windows**
   - Close all tabs except one
   - Check if multiple windows are open with the same form
   - Use browser's "Close other tabs" feature

5. **Check Network Tab**
   - Open DevTools → Network tab
   - Verify if duplicate API calls are being made
   - Check request timestamps and headers
   - Look for requests with identical payloads

6. **Check Console Logs**
   - Look for warning messages:
     - `[DUPLICATE PREVENTION] Submission already in progress`
     - `[DUPLICATE PREVENTION] Same phone number submitted recently`
     - `[DUPLICATE PREVENTION] Too soon after last submission`
     - `[DUPLICATE PREVENTION] Duplicate submission ID detected`
   - Check for extension-injected scripts
   - Look for duplicate event listeners

7. **Browser-Specific Checks**
   - **Chrome**: Check `chrome://extensions/` for form-related extensions
   - **Firefox**: Check `about:addons` for form-related addons
   - **Edge**: Check extensions in settings
   - Clear browser's saved passwords/autofill data for the site

8. **Service Worker Issues**
   - Unregister service worker: DevTools → Application → Service Workers
   - Clear cache storage: DevTools → Application → Cache Storage
   - Hard reload the page after clearing

## Prevention Measures

The fix includes:
- ✅ Race condition prevention using refs
- ✅ Request deduplication based on phone number
- ✅ Unique submission ID tracking to prevent browser replay attacks
- ✅ Time-based cooldown (1 second minimum between submissions)
- ✅ Proper state management
- ✅ Button disable during submission
- ✅ Cleanup on dialog close
- ✅ Cooldown period to prevent rapid re-submissions
- ✅ Browser autofill prevention (`autoComplete="off"`)
- ✅ Event propagation stopping (`stopPropagation()`)
- ✅ Form validation prevention (`noValidate`)
- ✅ Proper input attributes (`name`, `type`)

## Notes

- The 2-second cooldown period prevents rapid re-submissions of the same phone number
- The 1-second minimum time check prevents rapid re-submissions in general
- The 3-second window for phone number deduplication prevents submitting the same phone quickly
- Refs are used instead of state for submission tracking because they update synchronously
- Console warnings are logged when duplicate submissions are detected (helpful for debugging)
- All warnings are prefixed with `[DUPLICATE PREVENTION]` for easy filtering in console
- Browser autofill is disabled to prevent extension-triggered duplicate submissions
- Event propagation is stopped to prevent browser extensions from triggering multiple submissions

## Why Account + System Specific?

If the issue only occurs for one account on one system but works fine elsewhere, it's likely:

1. **Browser Autofill Data**: That browser has saved form data for that account and is auto-submitting
2. **Browser Extensions**: Extensions specific to that browser/account are interfering
3. **Corrupted Cache**: Browser cache or service worker cache is corrupted for that account
4. **Browser Settings**: Autofill or form submission settings are different on that system
5. **Multiple Tabs**: Multiple tabs with the same form open on that system

The fixes implemented address all these scenarios by:
- Preventing autofill from triggering submissions
- Adding multiple layers of duplicate detection
- Using unique IDs to prevent replay attacks
- Adding time-based cooldowns
- Stopping event propagation to prevent extension interference

