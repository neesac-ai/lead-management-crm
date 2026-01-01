# Platform Integrations Testing Guide

## Prerequisites

1. **Run the database migration**
   ```sql
   -- Execute in Supabase SQL Editor
   -- File: supabase/migrations/028_platform_integrations.sql
   ```

2. **Verify migration success**
   - Check that these tables exist:
     - `platform_integrations`
     - `integration_sync_logs`
     - `campaign_assignments`
   - Check that `leads` table has new columns:
     - `integration_id`
     - `external_id`
     - `integration_metadata`

## Testing Steps

### 1. Access Integrations Page

1. Log in as an **admin** user
2. Navigate to **Integrations** in the sidebar (should appear for admin role)
3. Verify the page loads and shows "No Integrations" message

### 2. Create a Facebook Integration

1. Click **"Add Integration"** button
2. Fill in the form:
   - **Integration Name**: "Facebook Test Integration"
   - **Platform**: Select Facebook (📘)
   - **Webhook Secret**: Enter a test secret (e.g., "test_secret_123")
3. Click **"Create Integration"**
4. Verify:
   - Redirects to integration detail page
   - Integration shows as "Active" with "idle" status
   - Webhook URL is displayed

### 3. Test Connection

1. On the integration detail page, click **"Test Connection"**
2. **Expected**: Should show error (since credentials aren't configured yet)
3. This is expected - we'll configure credentials next

### 4. Configure Integration Credentials

1. Go to **Settings** tab on integration detail page
2. Update integration via API (for testing):
   ```bash
   # Get your integration ID from the URL
   curl -X PATCH http://localhost:3000/api/integrations/{integration_id} \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{
       "credentials": {
         "access_token": "your-facebook-access-token"
       },
       "config": {
         "form_id": "your-lead-form-id",
         "ad_account_id": "your-ad-account-id"
       }
     }'
   ```
3. Or update directly in Supabase:
   ```sql
   UPDATE platform_integrations
   SET credentials = '{"access_token": "your-token"}'::jsonb,
       config = '{"form_id": "your-form-id", "ad_account_id": "your-ad-account-id"}'::jsonb
   WHERE id = 'your-integration-id';
   ```

### 5. Test Connection Again

1. Click **"Test Connection"** button
2. **Expected**: 
   - If credentials are valid: "Connection test successful"
   - If invalid: Error message with details

### 6. Test Manual Sync

1. Click **"Sync Now"** button
2. **Expected**:
   - Button shows "Syncing..." state
   - After completion: Toast shows "Sync completed: X leads created"
   - Integration status updates
   - Check `integration_sync_logs` table for sync record

### 7. Test Campaign Assignment

1. Go to **"Campaign Assignments"** tab
2. Click **"Fetch Campaigns"** button
   - **Expected**: Fetches campaigns from Facebook API (if configured)
3. Click **"Add Assignment"** button
4. Fill in the form:
   - **Campaign ID**: "123456789" (test ID)
   - **Campaign Name**: "Test Campaign"
   - **Assign To**: Select a sales rep from dropdown
   - **Active**: Checked
5. Click **"Create"**
6. **Verify**:
   - Assignment appears in the table
   - Shows campaign name, ID, assigned user, and status

### 8. Test Webhook (Facebook)

#### Option A: Using Facebook Developer Console

1. Go to Facebook Developer Console
2. Navigate to your app → Webhooks
3. Add webhook URL: `https://yourdomain.com/api/integrations/webhooks/facebook?secret=test_secret_123`
4. Subscribe to `leadgen` events
5. Facebook will send a verification GET request
6. **Verify**: Webhook is verified successfully

#### Option B: Manual Webhook Test

1. Use a tool like Postman or curl:
   ```bash
   curl -X POST http://localhost:3000/api/integrations/webhooks/facebook?secret=test_secret_123 \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=calculated_signature" \
     -d '{
       "object": "page",
       "entry": [{
         "changes": [{
           "value": {
             "leadgen_id": "test_lead_123",
             "form_id": "form_123",
             "page_id": "page_123",
             "adgroup_id": "campaign_123",
             "ad_id": "ad_123",
             "created_time": 1234567890,
             "field_data": [
               {"name": "full_name", "values": ["John Doe"]},
               {"name": "email", "values": ["john@example.com"]},
               {"name": "phone_number", "values": ["+1234567890"]}
             ]
           }
         }]
       }]
     }'
   ```

2. **Verify**:
   - Lead is created in `leads` table
   - Lead has `integration_id` set
   - Lead has `external_id` = "test_lead_123"
   - Lead has `integration_metadata` with campaign data
   - Lead is assigned based on campaign assignment (if configured)
   - Check `integration_sync_logs` for webhook log entry

### 9. Verify Lead Assignment Logic

#### Test Campaign-Based Assignment

1. Create a campaign assignment for a specific campaign ID
2. Create a lead via webhook with that campaign ID in metadata
3. **Verify**: Lead is assigned to the configured sales rep

#### Test Fallback Assignment

1. Create a lead via webhook with a campaign ID that has NO assignment
2. **Verify**: Lead follows normal assignment rules (percentage/round-robin)

### 10. Test Polling Service

1. Call the polling endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/integrations/poll \
     -H "Authorization: Bearer your-polling-secret"
   ```

2. **Verify**:
   - All active integrations are polled
   - New leads are fetched and created
   - `integration_sync_logs` shows scheduled sync entries
   - Integration `last_sync_at` is updated

### 11. Verify Lead Appears in CRM

1. Go to **Leads** page
2. **Verify**:
   - Integration-created leads appear in the list
   - Source shows as "facebook" (or platform name)
   - Lead detail shows integration metadata
   - Lead is assigned correctly

### 12. Test Error Handling

1. Deactivate an integration
2. Try to sync
3. **Expected**: Error message "Integration is not active"

4. Create integration with invalid credentials
5. Test connection
6. **Expected**: Error message with details

7. Send invalid webhook payload
8. **Expected**: Error logged, no lead created

### 13. Test RLS Policies

1. Log in as a **sales** user
2. Try to access `/integrations` page
3. **Expected**: Access denied or page not visible

4. Log in as **admin**
5. Create integration
6. **Verify**: Only admin can see/manage integrations

### 14. Test Campaign Assignment Updates

1. Edit an existing campaign assignment
2. Change assigned user
3. **Verify**: Assignment updates successfully

4. Toggle assignment active/inactive
5. **Verify**: Status updates, affects new lead assignments

6. Delete an assignment
7. **Verify**: Assignment removed, future leads use fallback logic

## Database Verification Queries

```sql
-- Check integrations
SELECT * FROM platform_integrations;

-- Check sync logs
SELECT * FROM integration_sync_logs ORDER BY created_at DESC LIMIT 10;

-- Check campaign assignments
SELECT ca.*, u.name as assigned_user_name
FROM campaign_assignments ca
LEFT JOIN users u ON ca.assigned_to = u.id;

-- Check leads created by integrations
SELECT l.*, pi.name as integration_name, pi.platform
FROM leads l
LEFT JOIN platform_integrations pi ON l.integration_id = pi.id
WHERE l.integration_id IS NOT NULL
ORDER BY l.created_at DESC;

-- Check integration metadata
SELECT 
  id,
  name,
  integration_metadata->>'campaign_id' as campaign_id,
  integration_metadata->>'campaign_name' as campaign_name
FROM leads
WHERE integration_metadata IS NOT NULL;
```

## Common Issues & Solutions

### Issue: "Integration not found" error
- **Solution**: Verify integration exists and user has access (same org)

### Issue: Webhook signature verification fails
- **Solution**: Ensure webhook secret matches in integration config

### Issue: Leads not being assigned
- **Solution**: 
  - Check campaign assignment exists and is active
  - Verify campaign_id in lead's integration_metadata matches assignment
  - Check sales team members exist and are active

### Issue: Polling service returns 401
- **Solution**: Set `POLLING_SECRET` env variable and include in Authorization header

### Issue: Campaigns not fetching
- **Solution**: 
  - Verify credentials are configured
  - Check ad_account_id is set in config
  - Verify API permissions

## Next Steps for Full Implementation

1. **Complete WhatsApp Integration**:
   - Implement webhook signature verification
   - Implement lead extraction
   - Implement API client

2. **Complete LinkedIn Integration**:
   - Implement OAuth flow
   - Implement webhook handler
   - Implement API client

3. **Complete Instagram Integration**:
   - Uses Facebook infrastructure (mostly done)
   - Test with Instagram-specific endpoints

4. **Add OAuth Flow UI**:
   - Create OAuth initiation pages
   - Handle OAuth callbacks
   - Store tokens securely

5. **Add Monitoring**:
   - Dashboard for integration health
   - Alerts for failed syncs
   - Metrics and analytics

