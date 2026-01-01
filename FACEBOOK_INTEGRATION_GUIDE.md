# Facebook Lead Ads Integration - Complete Setup Guide

This guide walks you through connecting Facebook Lead Ads to BharatCRM using the automated OAuth flow. The setup is now much simpler - no manual token copying required!

## Prerequisites

1. ✅ Database migration `028_platform_integrations.sql` has been run
2. ✅ You have admin access to your CRM organization
3. ✅ You have a Facebook Business account
4. ✅ You have a Facebook App (or can create one)
5. ✅ Environment variables are configured (see Step 2)

---

## Step 1: Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** as the app type
4. Fill in:
   - **App Name**: "BharatCRM Integration" (or your preferred name)
   - **App Contact Email**: Your email
5. Click **"Create App"**

---

## Step 2: Configure Facebook App Settings

### 2.1 Add Products

1. In your app dashboard, go to **"Add Products"**
2. Add these products:
   - **Facebook Login** (required for OAuth)
   - **Marketing API** (required for Lead Ads)

### 2.2 Configure Facebook Login

1. Go to **Facebook Login** → **Settings**
2. Add **Valid OAuth Redirect URIs**:
   ```
   http://localhost:3000/api/integrations/[id]/oauth/callback
   https://yourdomain.com/api/integrations/[id]/oauth/callback
   ```
   (Replace `yourdomain.com` with your actual production domain)

3. **Important**: The `[id]` in the URL is a placeholder - Facebook will accept this pattern for all integration IDs.

4. Save changes

### 2.3 Request Permissions

1. Go to **App Review** → **Permissions and Features**
2. Request these permissions:
   - `leads_retrieval` - To access Lead Gen Forms
   - `ads_read` - To read ad accounts and campaigns
   - `ads_management` - To manage ads (optional, for advanced features)
   - `business_management` - To access business assets

3. **Note**: Some permissions require App Review. For testing with your own ad account, you can use these permissions without review.

### 2.4 Get App Credentials

1. Go to **Settings** → **Basic**
2. Copy these values (you'll need them in Step 3):
   - **App ID**
   - **App Secret** (click "Show" to reveal)

---

## Step 3: Create Integration in CRM

1. Log in to your CRM as **admin**
2. Navigate to **Integrations** (in sidebar)
3. Click **"Add Integration"** (or **"New Integration"** button)
4. Fill in the form:
   - **Integration Name**: "Facebook Main Account" (or your preferred name)
   - **Platform**: Select **Facebook Lead Ads** (📘)
   - **Webhook Secret**: 
     - Go to Facebook App → Settings → Basic
     - Copy **App Secret** (or create a custom secret for webhook verification)
     - Paste it here (optional, can add later)
5. Click **"Create Integration"**
6. You'll be redirected to the integration detail page

---

## Step 4: Configure Facebook App Credentials

1. On the integration detail page, go to the **"Settings"** tab
2. You'll see a **"Facebook App Credentials"** section
3. Enter your Facebook App credentials:
   - **Facebook App ID**: From Facebook App Dashboard → Settings → Basic → App ID
   - **Facebook App Secret**: From Facebook App Dashboard → Settings → Basic → App Secret (click "Show")
4. Click **"Save App Credentials"**

**Important**: 
- Each client (admin) uses their own Facebook App credentials
- These credentials are stored securely per integration
- You must configure these before connecting your Facebook account

---

## Step 5: Connect Facebook Account (OAuth)

1. Still in the **"Settings"** tab, scroll to **"Facebook Connection"** section
2. You'll see a **"Connect Facebook Account"** button
3. Click the button - you'll be redirected to Facebook
4. **Authorize the app** - Facebook will ask you to:
   - Log in (if not already)
   - Grant permissions (leads_retrieval, ads_read, etc.)
   - Select which ad accounts to connect
5. After authorization, you'll be redirected back to the CRM
6. **Success!** You should see:
   - ✅ "Connected to Facebook" status
   - Your ad accounts listed
   - Token expiration date

**What happens automatically:**
- ✅ Access token is obtained and stored
- ✅ Token is automatically exchanged for a long-lived token (60 days)
- ✅ Your ad accounts are fetched and listed
- ✅ Campaigns are automatically fetched for the first ad account

---

## Step 6: Select Ad Account and Campaigns

1. In the **Settings** tab, you'll see your ad accounts in a dropdown
2. **Select an Ad Account** from the dropdown (defaults to first account)
3. Click **"Fetch Campaigns"** to load campaigns for the selected account
4. **Select campaigns** you want to sync:
   - Check the boxes next to campaigns you want to track
   - Only leads from selected campaigns will be synced
5. Click **"Save Campaign Selection"**

**Note**: You can change the ad account and campaigns anytime. The system will only sync leads from selected campaigns.

---

## Step 7: Test Connection

1. On the integration detail page, go to the **"Overview"** tab
2. Click **"Test Connection"** button
3. **Expected Result**: 
   - ✅ "Connection test successful" - You're all set!
   - ❌ Error message - Check the error details

**Common Errors:**
- **"Invalid OAuth access token"**: Token expired - reconnect via OAuth
- **"Insufficient permissions"**: Need to grant `leads_retrieval` permission in Facebook
- **"Failed to connect"**: Check environment variables are set correctly

---

## Step 8: Set Up Webhook (Real-time Lead Capture)

### 8.1 Get Webhook URL

1. On integration detail page, go to **"Overview"** tab
2. Copy the **Webhook URL** (it looks like):
   ```
   https://yourdomain.com/api/integrations/webhooks/facebook?secret=your_webhook_secret
   ```

### 8.2 Configure in Facebook

1. Go to [Facebook App Dashboard](https://developers.facebook.com/apps/)
2. Select your app
3. Go to **Webhooks** → **Add Callback URL**
4. Enter:
   - **Callback URL**: Paste the webhook URL from step 8.1
   - **Verify Token**: Enter the same webhook secret you used in Step 4
5. Click **"Verify and Save"**
6. Facebook will send a GET request to verify - this should succeed automatically

### 8.3 Subscribe to Events

1. In Webhooks settings, find your callback URL
2. Click **"Edit Subscription"**
3. Subscribe to **`leadgen`** events
4. Save

**Now**: When a new lead is submitted to your Facebook Lead Form, it will automatically appear in your CRM!

---

## Step 9: Test Manual Sync (Optional)

1. On integration detail page, click **"Sync Now"** button
2. This will fetch any new leads from Facebook API for your selected campaigns
3. Check the toast notification for results:
   - "Sync completed: X leads created, Y updated"
4. Go to **Leads** page to see the imported leads

---

## Step 10: Configure Campaign Assignments (Optional)

If you want to automatically assign leads from specific campaigns to specific sales reps:

1. On integration detail page, go to **"Campaign Assignments"** tab
2. Click **"Add Assignment"**
3. Fill in:
   - **Campaign**: Select from the dropdown (campaigns are already loaded)
   - **Assign To**: Select a sales rep
   - **Active**: Checked
4. Click **"Create"**

**Result**: All future leads from this campaign will be automatically assigned to the selected sales rep.

**Note**: Campaign assignments take priority over other assignment methods (round-robin, percentage-based).

---

## Step 11: Verify Lead Capture

### Test with Real Lead

1. Submit a test lead through your Facebook Lead Ad
2. Within seconds, check your CRM:
   - Go to **Leads** page
   - The lead should appear automatically
   - Check lead details:
     - Source should be "facebook"
     - Integration metadata should show campaign info
     - Lead should be assigned (if campaign assignment is configured)

### Check Sync Logs

1. Go to integration detail page
2. Check **"Last Sync"** timestamp in the Overview tab
3. For detailed logs, check database:
   ```sql
   SELECT * FROM integration_sync_logs 
   WHERE integration_id = 'your-integration-id'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

---

## Troubleshooting

### Issue: "Failed to create integration"
**Solution**: 
- Make sure migration `028_platform_integrations.sql` has been run
- Verify you have admin access

### Issue: "OAuth redirect failed" or "Invalid redirect URI"
**Solutions**:
- Verify OAuth redirect URI is added in Facebook App → Facebook Login → Settings
- Check the redirect URI matches: `https://yourdomain.com/api/integrations/[id]/oauth/callback`
- Ensure Facebook App ID and App Secret are configured in the Settings tab

### Issue: "Facebook App ID and App Secret must be configured"
**Solutions**:
- Go to Integration → Settings tab
- Enter your Facebook App ID and App Secret in the "Facebook App Credentials" section
- Click "Save App Credentials"
- Then try connecting again

### Issue: "Connection test failed"
**Solutions**:
- Reconnect via OAuth (token may have expired)
- Check token has `leads_retrieval` permission in Facebook
- Verify Facebook App ID and App Secret are correct in Settings
- Check Facebook App permissions are granted

### Issue: "No ad accounts found"
**Solutions**:
- Ensure you have ad accounts in your Facebook Business account
- Grant `ads_read` permission during OAuth
- Check that the Facebook account you connected has access to ad accounts

### Issue: "No campaigns found"
**Solutions**:
- Verify you have active campaigns in the selected ad account
- Check campaigns are not archived
- Try selecting a different ad account

### Issue: "No leads syncing"
**Solutions**:
- Check if webhook is configured and subscribed to `leadgen` events
- Verify webhook secret matches in both places
- Check integration is active (`is_active = true`)
- Try manual sync to test API connection
- Verify campaigns are selected in Settings tab

### Issue: "Webhook not receiving data"
**Solutions**:
- Verify webhook URL is accessible (not behind firewall)
- Check webhook secret matches
- Verify webhook is subscribed to `leadgen` events in Facebook
- Check server logs for webhook requests
- Ensure webhook URL uses HTTPS in production

### Issue: "Leads not being assigned"
**Solutions**:
- Verify campaign assignment exists and is active
- Check campaign_id in lead's `integration_metadata` matches assignment
- Verify sales rep user exists and is active
- Check assignment is created for the correct integration

### Issue: "Token expired"
**Solutions**:
- Long-lived tokens expire after 60 days
- Simply reconnect via OAuth to get a new token
- The system will automatically use the new token

---

## How OAuth Works

The OAuth flow simplifies the connection process:

1. **User clicks "Connect Facebook"** → Redirected to Facebook
2. **User authorizes** → Facebook redirects back with authorization code
3. **System exchanges code for token** → Gets short-lived access token
4. **System exchanges for long-lived token** → Gets 60-day token automatically
5. **System fetches ad accounts** → Lists available ad accounts
6. **System fetches campaigns** → Loads campaigns for selected account
7. **User selects campaigns** → Only selected campaigns sync leads

**Benefits:**
- ✅ No manual token copying
- ✅ Automatic token refresh (60-day tokens)
- ✅ Secure token storage
- ✅ Easy reconnection if token expires
- ✅ Automatic ad account and campaign discovery

---

## API Reference

### Facebook Graph API Endpoints Used

1. **OAuth Authorization**: `GET /v18.0/dialog/oauth`
2. **Token Exchange**: `GET /v18.0/oauth/access_token`
3. **Long-lived Token**: `GET /v18.0/oauth/access_token` (with `grant_type=fb_exchange_token`)
4. **Test Connection**: `GET /v18.0/me?access_token=TOKEN`
5. **Fetch Ad Accounts**: `GET /v18.0/me/adaccounts?access_token=TOKEN`
6. **Fetch Campaigns**: `GET /v18.0/{ad-account-id}/campaigns?access_token=TOKEN`
7. **Fetch Leads**: `GET /v18.0/{form-id}/leads?access_token=TOKEN`
8. **Webhook Verification**: `GET /webhook?hub.mode=subscribe&hub.verify_token=SECRET&hub.challenge=CHALLENGE`
9. **Webhook Lead Data**: `POST /webhook` (Facebook sends this)

---

## Security Best Practices

1. **Store tokens securely**: Access tokens are stored encrypted in `credentials` JSONB field
2. **Store app credentials securely**: Facebook App ID and App Secret are stored in `config` JSONB field (encrypted at database level)
3. **Use long-lived tokens**: System automatically exchanges for 60-day tokens
4. **Rotate tokens**: Reconnect via OAuth when token expires (every 60 days)
5. **Webhook secret**: Use a strong, random secret for webhook verification
6. **HTTPS only**: Always use HTTPS for webhook URLs in production
7. **App permissions**: Only request permissions you actually need
8. **Per-client credentials**: Each client uses their own Facebook App, ensuring data isolation

---

## Token Management

### Token Lifecycle

- **Short-lived token**: 1-2 hours (obtained during OAuth)
- **Long-lived token**: 60 days (automatically obtained)
- **Token refresh**: Reconnect via OAuth before expiration

### When to Reconnect

- Token expires (after 60 days)
- Permissions changed in Facebook
- Ad account access revoked
- Connection test fails

### How to Reconnect

1. Go to Integration → Settings tab
2. Click **"Disconnect"** (if already connected)
3. Click **"Connect Facebook Account"** again
4. Authorize and you're done!

---

## Next Steps

- ✅ Set up automatic token refresh notifications
- ✅ Configure multiple Facebook ad accounts (create separate integrations)
- ✅ Set up campaign-based lead routing
- ✅ Monitor integration health
- ✅ Set up alerts for failed syncs
- ✅ Configure lead assignment rules

---

## Quick Reference

| Item | Where to Find |
|------|---------------|
| **App ID** | Facebook App Dashboard → Settings → Basic → Enter in Integration Settings |
| **App Secret** | Facebook App Dashboard → Settings → Basic (click "Show") → Enter in Integration Settings |
| **Access Token** | Automatically obtained via OAuth (stored in CRM) |
| **Ad Account ID** | Automatically fetched (shown in Settings tab) |
| **Campaigns** | Automatically fetched (shown in Settings tab) |
| **Webhook URL** | Integration detail page → Overview tab |
| **Webhook Secret** | You set this when creating integration |

---

## Support

If you encounter issues:

1. Check the error message in the integration detail page
2. Review sync logs in `integration_sync_logs` table
3. Verify environment variables are set correctly
4. Check Facebook App permissions are granted
5. Ensure webhook is properly configured
6. Try reconnecting via OAuth if connection fails
7. Check Facebook App Dashboard for any restrictions or issues

---

## Migration from Manual Setup

If you previously set up Facebook integration manually (with manual token entry):

1. Go to your existing integration
2. Go to **Settings** tab
3. Click **"Disconnect"** (if connected)
4. Click **"Connect Facebook Account"** to use the new OAuth flow
5. Your existing webhook and campaign assignments will be preserved

---

**That's it!** The OAuth flow makes Facebook integration much simpler. No more manual token copying or Graph API Explorer steps. Just click "Connect" and authorize!
