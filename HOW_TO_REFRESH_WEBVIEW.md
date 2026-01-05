# How to Refresh WebView to See PWA Changes

## Important: PWA Changes Don't Require Android Rebuild

The changes we made are in the **PWA code** (React/Next.js), not Android code. The Android app is just a WebView wrapper that loads your PWA.

## How to See the Changes

### Method 1: Pull to Refresh (Easiest)
1. In your Android app, **pull down from the top** of the screen
2. This will refresh the WebView and load the latest PWA code
3. You should see the changes immediately

### Method 2: Close and Reopen App
1. **Close the app completely** (swipe it away from recent apps)
2. **Reopen the app**
3. The WebView will load fresh

### Method 3: Clear WebView Cache (If changes still don't appear)
1. On your Android phone: **Settings → Apps → BharatCRM**
2. Tap **Storage**
3. Tap **Clear Cache** (NOT Clear Data - that will log you out)
4. Reopen the app

### Method 4: Force Refresh via Android Studio
1. In Android Studio, click the **green Run button** again
2. This will reload the WebView

## If Testing Locally

If you're testing against `http://localhost:3000`:

1. **Make sure your dev server is running:**
   ```bash
   npm run dev
   ```

2. **Check the URL in Android app:**
   - Should be: `http://10.0.2.2:3000` (for emulator)
   - Or: `http://YOUR_COMPUTER_IP:3000` (for physical device)

3. **Refresh the WebView** using Method 1 or 2 above

## If Testing on Production

If you're testing against `https://bharatcrm.neesac.ai`:

1. **Make sure you've deployed the changes** to your server
2. **Refresh the WebView** using Method 1 or 2 above

## Verify Changes

After refreshing, you should see:
- ✅ "by neesac.ai" (not "neeac.ai") on login page
- ✅ Better mobile spacing in lead cards
- ✅ Better mobile spacing in lead detail dialog
- ✅ Tabs are more visible and properly sized

## Troubleshooting

**If changes still don't appear:**
1. Check if dev server is running (if local)
2. Check browser console for errors (if accessible)
3. Try Method 3 (Clear Cache)
4. Make sure you saved all files in your code editor

**If "neeac.ai" still appears:**
- The typo might be in cached content
- Try Method 3 (Clear Cache)
- Or check if there's a service worker cache issue

---

**Remember:** You only need to rebuild the Android app if you change Android/Kotlin code. PWA changes just need a WebView refresh!

