# How to Apply Database Migrations

You have two options to apply the migrations:

## Option 1: Using Supabase Dashboard (Recommended - Easiest)

This is the simplest method and works for everyone:

### Steps:

1. **Go to your Supabase Dashboard**
   - Visit https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Apply Migration 032 (Call Logs)**
   - Open the file: `supabase/migrations/032_call_logs.sql`
   - Copy ALL the SQL content
   - Paste it into the SQL Editor
   - Click "Run" (or press Ctrl+Enter)
   - Wait for "Success" message

4. **Apply Migration 033 (Location Tracking)**
   - Open the file: `supabase/migrations/033_location_tracking.sql`
   - Copy ALL the SQL content
   - Paste it into the SQL Editor
   - Click "Run" (or press Ctrl+Enter)
   - Wait for "Success" message

5. **Verify Tables Created**
   - Go to "Table Editor" in the left sidebar
   - You should see these new tables:
     - `call_logs`
     - `team_locations`
     - `geofences`
     - `visit_sessions`
     - `location_tracking_settings`

### ✅ Done! Your migrations are applied.

---

## Option 2: Using Node.js Script (Alternative)

If you prefer automation, you can use the provided script:

### Prerequisites:
- Node.js installed
- `dotenv` package installed: `npm install dotenv`

### Steps:

1. **Install dotenv (if not already installed)**
   ```bash
   npm install dotenv
   ```

2. **Make sure you have `.env.local` file with:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. **Run the script:**
   ```bash
   node scripts/apply-migrations.js
   ```

**Note:** The script may not work if your Supabase project doesn't have the `exec_sql` RPC function enabled. In that case, use Option 1 (Dashboard method).

---

## Option 3: Using Supabase CLI (If you install it)

If you want to use Supabase CLI:

1. **Install Supabase CLI:**
   ```bash
   # Windows (using Scoop)
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase

   # Or download from: https://github.com/supabase/cli/releases
   ```

2. **Link your project:**
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. **Apply migrations:**
   ```bash
   supabase db push
   ```

---

## Verification

After applying migrations, verify they worked:

1. **Check Tables:**
   - Go to Supabase Dashboard → Table Editor
   - Look for: `call_logs`, `team_locations`, `geofences`, `visit_sessions`, `location_tracking_settings`

2. **Test API Endpoints:**
   - Start your dev server: `npm run dev`
   - Try calling `/api/calls/log` or `/api/locations/checkin` (you'll need to be authenticated)

3. **Check for Errors:**
   - If you see any errors about missing tables, the migrations didn't apply correctly
   - Re-run the migration SQL in the Dashboard

---

## Troubleshooting

### Error: "relation already exists"
- This means the table already exists. You can either:
  - Skip that part of the migration
  - Or drop the table first (be careful!)

### Error: "function does not exist"
- Some migrations create functions. Make sure you run the entire SQL file, not just parts of it.

### Error: "permission denied"
- Make sure you're using the Service Role Key (not the anon key) if using the script
- Or use the Dashboard method which uses your admin credentials

---

## Need Help?

If migrations fail:
1. Check the error message in Supabase Dashboard
2. Make sure you copied the ENTIRE SQL file (not just parts)
3. Try running statements one at a time to identify which one fails
4. Check that all previous migrations (001-031) have been applied

