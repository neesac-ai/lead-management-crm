# Testing Guide - After Migrations Applied ✅

Now that your tables are created, let's test the functionality!

## Quick Test Checklist

- [ ] Start dev server
- [ ] Test location check-in (browser)
- [ ] Test API endpoints
- [ ] Verify data in Supabase
- [ ] Test call tracking (when Android app is ready)

---

## Step 1: Start Your Dev Server

```bash
npm run dev
```

Your app should be running at `http://localhost:3000`

---

## Step 2: Test Location Check-In (Browser Fallback)

### Option A: Test via UI (Easiest)

1. **Login to your app**
   - Go to `http://localhost:3000`
   - Login with your credentials

2. **Open a Lead**
   - Navigate to Leads page
   - Click on any lead to open detail dialog

3. **Check-In Button**
   - If you see a "Check In" button, click it
   - **Note:** The button only shows when native app is detected
   - In browser, you can test the API directly (see Option B)

### Option B: Test via Browser Console

1. **Open Browser DevTools** (F12)
2. **Go to Console tab**
3. **Run this JavaScript:**

```javascript
// Test location check-in API
async function testCheckIn() {
  // First, get a lead ID from your app
  // You can find it by opening a lead and checking the URL or console

  const leadId = 'YOUR_LEAD_ID_HERE'; // Replace with actual lead ID

  // Get current location
  navigator.geolocation.getCurrentPosition(async (position) => {
    const { latitude, longitude, accuracy } = position.coords;

    console.log('Location:', { latitude, longitude, accuracy });

    // Call the API
    const response = await fetch('/api/locations/checkin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: leadId,
        latitude: latitude,
        longitude: longitude,
        accuracy: accuracy,
        notes: 'Test check-in from browser'
      })
    });

    const data = await response.json();
    console.log('Check-in result:', data);

    if (response.ok) {
      console.log('✅ Check-in successful!');
    } else {
      console.error('❌ Check-in failed:', data);
    }
  }, (error) => {
    console.error('Geolocation error:', error);
  });
}

// Run the test
testCheckIn();
```

**To get a lead ID:**
- Open any lead in your app
- Check the browser console or network tab
- Or check the URL: `/[orgSlug]/leads` and inspect the lead data

---

## Step 3: Test API Endpoints Directly

### Test Call Log API

Open Browser Console (F12) and run:

```javascript
async function testCallLog() {
  const leadId = 'YOUR_LEAD_ID_HERE'; // Replace with actual lead ID

  const response = await fetch('/api/calls/log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lead_id: leadId,
      phone_number: '+1234567890',
      call_direction: 'OUTGOING',
      call_status: 'COMPLETED',
      call_started_at: new Date().toISOString(),
      call_ended_at: new Date(Date.now() + 120000).toISOString(), // 2 minutes later
      duration_seconds: 120,
      talk_time_seconds: 115,
      ring_duration_seconds: 5,
      device_info: {
        platform: 'android',
        model: 'Test Device'
      }
    })
  });

  const data = await response.json();
  console.log('Call log result:', data);

  if (response.ok) {
    console.log('✅ Call logged successfully!');
  } else {
    console.error('❌ Call log failed:', data);
  }
}

testCallLog();
```

### Test Location Tracking API

```javascript
async function testLocationTrack() {
  const leadId = 'YOUR_LEAD_ID_HERE'; // Replace with actual lead ID

  const response = await fetch('/api/locations/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lead_id: leadId,
      latitude: 12.9716, // Bangalore coordinates
      longitude: 77.5946,
      accuracy: 10.5,
      location_type: 'tracking',
      tracking_session_id: 'test-session-123',
      notes: 'Test tracking point'
    })
  });

  const data = await response.json();
  console.log('Location track result:', data);

  if (response.ok) {
    console.log('✅ Location tracked successfully!');
  } else {
    console.error('❌ Location track failed:', data);
  }
}

testLocationTrack();
```

### Test Get Location History

```javascript
async function testGetLocations() {
  const leadId = 'YOUR_LEAD_ID_HERE'; // Replace with actual lead ID

  const response = await fetch(`/api/locations/${leadId}`);
  const data = await response.json();

  console.log('Location history:', data);

  if (response.ok) {
    console.log(`✅ Found ${data.locations?.length || 0} location entries`);
  } else {
    console.error('❌ Failed to get locations:', data);
  }
}

testGetLocations();
```

---

## Step 4: Verify Data in Supabase

1. **Go to Supabase Dashboard**
   - Visit https://supabase.com/dashboard
   - Select your project

2. **Check Table Editor**
   - Click "Table Editor" in left sidebar
   - Select `call_logs` table
   - You should see your test call log entry

3. **Check Location Data**
   - Select `team_locations` table
   - You should see your test check-in/location entries

---

## Step 5: Test from PWA UI (When Ready)

### Test Call Tracking (Requires Android App)

Once you build and install the Android app:
1. Open a lead in the app
2. Click "Call" button
3. Make a call (or just open dialer)
4. Check if call is logged in `call_logs` table

### Test Location Check-In (Browser Works!)

1. Open a lead detail dialog
2. Click "Check In" button (if visible)
3. Allow location permission
4. Add notes and submit
5. Verify in `team_locations` table

---

## Step 6: Verify API Endpoints Work

### Using curl (if you have it)

```bash
# Test check-in (replace with your auth cookie)
curl -X POST http://localhost:3000/api/locations/checkin \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "lead_id": "your-lead-id",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracy": 10.5
  }'
```

### Using Postman

1. Create a new POST request
2. URL: `http://localhost:3000/api/locations/checkin`
3. Headers:
   - `Content-Type: application/json`
   - Add your auth cookie (copy from browser)
4. Body (JSON):
```json
{
  "lead_id": "your-lead-id",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "accuracy": 10.5,
  "notes": "Test check-in"
}
```

---

## Common Issues & Solutions

### ❌ Error: "Unauthorized"
- **Cause:** Not logged in or session expired
- **Fix:** Make sure you're logged in to the app first

### ❌ Error: "Lead not found"
- **Cause:** Invalid lead_id
- **Fix:** Use a valid lead ID from your database

### ❌ Error: "Missing required fields"
- **Cause:** Missing latitude, longitude, or lead_id
- **Fix:** Check your request body includes all required fields

### ❌ Error: "Failed to create check-in"
- **Cause:** Database error or RLS policy issue
- **Fix:**
  - Check Supabase logs
  - Verify RLS policies are correct
  - Make sure user has proper permissions

---

## Quick Test Script

Save this as `test-apis.html` and open in browser (while logged into your app):

```html
<!DOCTYPE html>
<html>
<head>
  <title>API Test</title>
</head>
<body>
  <h1>API Testing</h1>
  <input type="text" id="leadId" placeholder="Enter Lead ID">
  <button onclick="testCheckIn()">Test Check-In</button>
  <button onclick="testCallLog()">Test Call Log</button>
  <pre id="result"></pre>

  <script>
    async function testCheckIn() {
      const leadId = document.getElementById('leadId').value;
      if (!leadId) {
        alert('Enter a Lead ID first');
        return;
      }

      navigator.geolocation.getCurrentPosition(async (pos) => {
        const response = await fetch('/api/locations/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            notes: 'Test from browser'
          })
        });

        const data = await response.json();
        document.getElementById('result').textContent = JSON.stringify(data, null, 2);
      });
    }

    async function testCallLog() {
      const leadId = document.getElementById('leadId').value;
      if (!leadId) {
        alert('Enter a Lead ID first');
        return;
      }

      const response = await fetch('/api/calls/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          phone_number: '+1234567890',
          call_direction: 'OUTGOING',
          call_status: 'COMPLETED',
          call_started_at: new Date().toISOString(),
          duration_seconds: 120
        })
      });

      const data = await response.json();
      document.getElementById('result').textContent = JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>
```

---

## Next Steps

Once basic testing works:
1. ✅ Test from Android app (when built)
2. ✅ Test geofencing features
3. ✅ Test call recording (Phase 3)
4. ✅ Test continuous location tracking

---

## Summary

**What you can test NOW:**
- ✅ Location check-in API (browser Geolocation)
- ✅ Call log API (manual test data)
- ✅ Location tracking API
- ✅ Get location history API

**What needs Android app:**
- ⏳ Automatic call tracking
- ⏳ GPS location tracking
- ⏳ Geofencing

Happy testing! 🚀

