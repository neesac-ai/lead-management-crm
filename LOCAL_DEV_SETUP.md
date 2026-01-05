# Setting Up Local Development for Android App

## Current Status

❌ **Your Android app is currently loading from PRODUCTION** (`https://bharatcrm.neesac.ai`)

✅ **To load from localhost, you need to:**

## Step 1: Update Android App URL

**⚠️ IMPORTANT: This is for LOCAL DEVELOPMENT ONLY. Revert before pushing to git!**

Update `android/app/src/main/res/values/strings.xml` to:
```xml
<string name="pwa_url">http://YOUR_LOCAL_IP:3000</string>
```

**To find your computer's IP:**
```bash
ipconfig  # Look for IPv4 Address (e.g., 192.168.0.101)
```

**Example:**
```xml
<string name="pwa_url">http://192.168.0.101:3000</string>
```

## Step 2: Start Dev Server for Network Access

**Important:** Next.js dev server by default only listens on `localhost`, which your phone can't access.

You have two options:

### Option A: Use the Network Script (Recommended)
```bash
npm run dev:network
```

This runs `next dev -H 0.0.0.0` which makes it accessible from your network.

### Option B: Modify the dev script
If `dev:network` doesn't work, run:
```bash
next dev -H 0.0.0.0
```

## Step 3: Ensure Phone and Computer are on Same WiFi

- ✅ Your phone and computer must be on the **same WiFi network**
- ✅ Make sure your firewall allows connections on port 3000

## Step 4: Rebuild Android App

After changing `strings.xml`, you need to rebuild:

1. In Android Studio: **Build → Rebuild Project**
2. Click the **green Run button** again
3. The app will now load from `http://192.168.0.101:3000`

## Step 5: Verify It's Working

1. Check the dev server console - you should see requests from your phone's IP
2. In the Android app, you should see your latest changes immediately
3. No more cache issues - fresh code on every reload!

## Troubleshooting

### "Can't connect" or "Network error"
- Make sure `npm run dev:network` is running (not just `npm run dev`)
- Check firewall isn't blocking port 3000
- Verify phone and computer are on same WiFi
- Try accessing `http://192.168.0.101:3000` from your phone's browser first

### Still seeing old content
- Close the Android app completely
- Rebuild and reinstall the app
- The URL change requires a rebuild

### IP Address Changed
If your computer's IP changes, update `strings.xml` with the new IP:
```bash
ipconfig  # Find your IPv4 address
```

## For Production

**⚠️ CRITICAL: Before pushing to git, ALWAYS revert to production URL:**

```xml
<string name="pwa_url">https://bharatcrm.neesac.ai</string>
```

**Current status:** ✅ Already set to production URL (ready for git push)

**Note:** The production URL is already configured in the repo. Only change it locally when testing, and revert before committing.

