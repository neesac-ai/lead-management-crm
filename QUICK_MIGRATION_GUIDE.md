# Quick Migration Guide - Apply in 2 Minutes! ⚡

## Step-by-Step Instructions

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project

### Step 2: Open SQL Editor
1. Click **"SQL Editor"** in the left sidebar
2. Click **"New query"** button

### Step 3: Apply First Migration (Call Logs)
1. Open this file: `supabase/migrations/032_call_logs.sql`
2. **Copy ALL the content** (Ctrl+A, Ctrl+C)
3. **Paste** into the SQL Editor
4. Click **"Run"** button (or press Ctrl+Enter)
5. Wait for ✅ "Success" message

### Step 4: Apply Second Migration (Location Tracking)
1. Open this file: `supabase/migrations/033_location_tracking.sql`
2. **Copy ALL the content** (Ctrl+A, Ctrl+C)
3. **Paste** into the SQL Editor (you can clear the previous query first)
4. Click **"Run"** button
5. Wait for ✅ "Success" message

### Step 5: Verify It Worked
1. Go to **"Table Editor"** in the left sidebar
2. You should see these new tables:
   - ✅ `call_logs`
   - ✅ `team_locations`
   - ✅ `geofences`
   - ✅ `visit_sessions`
   - ✅ `location_tracking_settings`

## ✅ Done!

Your migrations are now applied. You can test the API endpoints!

---

## Troubleshooting

**If you see "relation already exists":**
- The table already exists, which is fine. The migration uses `CREATE TABLE IF NOT EXISTS` so it's safe.

**If you see any other error:**
- Make sure you copied the ENTIRE file content
- Check that all previous migrations (001-031) have been applied
- Try running the SQL statements one section at a time

---

## What These Migrations Do

### Migration 032: Call Logs
- Creates `call_logs` table for tracking phone calls
- Stores call duration, status, and device info
- Sets up RLS policies for security

### Migration 033: Location Tracking
- Creates `team_locations` table for GPS tracking
- Creates `geofences` table for automatic check-ins
- Creates `visit_sessions` table for visit tracking
- Creates `location_tracking_settings` for user preferences
- Sets up RLS policies for security

