# How to Clear Cache and See Changes

## The Problem
The service worker is caching the old version. Even though the code is fixed, the cached version is still being served.

## Solution: Clear Service Worker Cache

### Method 1: Unregister Service Worker (Recommended)

1. **In your Android app**, open the browser console (if possible) or:
2. **On your computer**, open Chrome and go to: `chrome://inspect`
3. Find your device and click "Inspect"
4. In the console, run:
   ```javascript
   navigator.serviceWorker.getRegistrations().then(function(registrations) {
     for(let registration of registrations) {
       registration.unregister()
     }
   })
   ```
5. **Clear browser cache:**
   - In DevTools, go to **Application** tab
   - Click **Clear storage** on the left
   - Check "Cache storage" and "Service Workers"
   - Click **Clear site data**
6. **Reload the app**

### Method 2: Clear App Data (Nuclear Option)

1. On your Android phone: **Settings → Apps → BharatCRM**
2. Tap **Storage**
3. Tap **Clear Data** (this will log you out, but clears everything)
4. Reopen the app and log in again

### Method 3: Force Service Worker Update

I've bumped the service worker version to `v6`. To force it to update:

1. **Close the app completely**
2. **Wait 30 seconds**
3. **Reopen the app**
4. The service worker should detect the new version and update

### Method 4: Disable Service Worker Temporarily

If you're testing locally, you can temporarily disable the service worker:

1. In Chrome DevTools (via `chrome://inspect`)
2. Go to **Application** tab
3. Click **Service Workers** on the left
4. Check **"Bypass for network"**
5. Reload the app

## Verify the Fix

After clearing cache, you should see:
- ✅ "by neesac.ai" (correct spelling)
- ✅ Better mobile spacing
- ✅ Improved UI

## If Still Not Working

If you still see "neeac.ai" after clearing cache:

1. **Check if you're testing locally:**
   - Make sure `npm run dev` is running
   - Check the URL in the app matches your dev server

2. **Check if you're testing production:**
   - Make sure you've deployed the changes to your server
   - The changes need to be on the server, not just local

3. **Check the actual file:**
   - Open `src/app/(auth)/login/page.tsx`
   - Line 100 should say: `by neesac.ai`
   - If it says "neeac", that's the problem

Let me know which method works for you!

