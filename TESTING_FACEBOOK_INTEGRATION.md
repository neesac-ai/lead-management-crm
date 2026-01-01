# Testing Facebook Integration with Personal Account

This is a quick guide to test the Facebook Lead Ads integration using your personal Facebook account.

## Prerequisites

- ✅ Personal Facebook account
- ✅ Admin access to your CRM
- ✅ Local development server running (`npm run dev`)

---

## Step 1: Create a Facebook App (5 minutes)

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** as the app type
4. Fill in:
   - **App Name**: "BharatCRM Test" (or any name)
   - **App Contact Email**: Your email
5. Click **"Create App"**

---

## Step 2: Configure Facebook App (10 minutes)

### 2.1 Add Products

1. In your app dashboard, click **"Add Products"** or go to **"Products"** in the left sidebar
2. Find and add:
   - **Facebook Login** → Click "Set Up"
   - **Marketing API** → Click "Set Up"

### 2.2 Configure Facebook Login

1. Go to **Facebook Login** → **Settings**
2. Under **"Valid OAuth Redirect URIs"**, add:
   ```
   http://localhost:3000/api/integrations/*/oauth/callback
   ```
   (The `*` wildcard allows any integration ID)
3. Click **"Save Changes"**

### 2.3 Get App Credentials

1. Go to **Settings** → **Basic**
2. Copy these values (you'll need them in Step 4):
   - **App ID** (visible immediately)
   - **App Secret** (click "Show" to reveal)

**Important**: Keep these credentials safe. You'll enter them in the CRM.

---

## Step 3: Create Integration in CRM (2 minutes)

1. Log in to your CRM as **admin**
2. Navigate to **Integrations** (in sidebar)
3. Click on **Facebook Lead Ads** card
4. Click **"Add Integration"** button
5. Fill in:
   - **Integration Name**: "My Facebook Test" (or any name)
   - **Webhook Secret**: Leave empty (will auto-generate)
6. Click **"Create Integration"**
7. You'll be redirected to the integration detail page

---

## Step 4: Configure App Credentials (2 minutes)

1. On the integration detail page, go to the **"Settings"** tab
2. Scroll to **"Facebook App Credentials"** section
3. Enter:
   - **Facebook App ID**: Paste the App ID from Step 2.3
   - **Facebook App Secret**: Paste the App Secret from Step 2.3
4. Click **"Save App Credentials"**
5. You should see a success message

---

## Step 5: Connect Facebook Account (2 minutes)

1. Still on the **"Settings"** tab
2. Click **"Connect Facebook Account"** button
3. You'll be redirected to Facebook
4. Log in with your personal Facebook account (if not already logged in)
5. Review and approve the permissions:
   - Access your ad accounts
   - Access your Lead Gen Forms
   - Manage your ads
6. Click **"Continue"** or **"Allow"**
7. You'll be redirected back to the CRM
8. You should see a success message: "Facebook connected successfully!"

---

## Step 6: Get Your Ad Account ID (3 minutes)

After connecting, you need to find your Ad Account ID:

### Option A: From Facebook Ads Manager

1. Go to [Facebook Ads Manager](https://business.facebook.com/adsmanager/)
2. Look at the URL - it will contain `act=XXXXXXXXX` where `XXXXXXXXX` is your Ad Account ID
3. Or go to **Account Settings** → Your Ad Account ID is shown at the top

### Option B: From CRM (if available)

1. Go to the integration's **"Settings"** tab
2. After connecting, the system may have fetched your ad accounts
3. Check if there's a dropdown or list showing your ad accounts

### Option C: Use Graph API Explorer

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app from the dropdown
3. Add token: Click "Get Token" → "Get User Access Token"
4. Select permissions: `ads_read`, `leads_retrieval`
5. In the query field, enter: `me/adaccounts`
6. Click "Submit"
7. Copy the `account_id` from the response

---

## Step 7: Configure Ad Account and Lead Gen Form (5 minutes)

1. Go back to the integration's **"Settings"** tab
2. Find **"Ad Account ID"** field
3. Enter your Ad Account ID (from Step 6)
4. Find **"Lead Gen Form ID"** field

### To Get Lead Gen Form ID:

**Option A: If you have an existing Lead Gen Form:**

1. Go to [Facebook Ads Manager](https://business.facebook.com/adsmanager/)
2. Go to **"Forms Library"** (in left sidebar)
3. Click on a form
4. Look at the URL - it will contain `form_id=XXXXXXXXX` where `XXXXXXXXX` is your Form ID
5. Copy this ID

**Option B: Create a Test Lead Gen Form:**

1. Go to [Facebook Ads Manager](https://business.facebook.com/adsmanager/)
2. Click **"Create"** → **"Ad"**
3. Choose **"Leads"** as your objective
4. Follow the wizard to create a simple form
5. Once created, go to **"Forms Library"** to get the Form ID

**Option C: Use Graph API Explorer:**

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Add token (same as Step 6, Option C)
4. Query: `{ad_account_id}/leadgen_forms` (replace `{ad_account_id}` with your Ad Account ID)
5. Copy a `id` from the response

5. Enter the Lead Gen Form ID in the CRM
6. Click **"Save Settings"**

---

## Step 8: Test the Connection (1 minute)

1. Go to the **"Overview"** tab
2. Click **"Test Connection"** button
3. You should see:
   - ✅ Connection successful
   - Ad Account details
   - Lead Gen Form details

If you see errors, check:
- App ID and App Secret are correct
- Ad Account ID is correct
- Lead Gen Form ID is correct
- Permissions were granted during OAuth

---

## Step 9: Test Lead Sync (Optional)

### Option A: Manual Sync

1. Go to **"Overview"** tab
2. Click **"Sync Now"** button
3. Wait for the sync to complete
4. Check the **"Last Synced"** timestamp

### Option B: Create a Test Lead

1. Go to your Lead Gen Form in Facebook Ads Manager
2. Submit a test lead (if the form allows)
3. Wait a few minutes
4. Click **"Sync Now"** in the CRM
5. Check your **Leads** page to see if the lead appears

---

## Troubleshooting

### Error: "Facebook App ID and App Secret must be configured"

**Solution**: Make sure you've saved the App ID and App Secret in the Settings tab before clicking "Connect Facebook Account".

### Error: "Invalid OAuth redirect URI"

**Solution**: 
1. Go to Facebook App → Facebook Login → Settings
2. Make sure you added: `http://localhost:3000/api/integrations/*/oauth/callback`
3. Save changes
4. Try connecting again

### Error: "Permission denied" or "Insufficient permissions"

**Solution**:
1. Make sure you approved all permissions during OAuth
2. Go to Facebook App → App Review → Permissions and Features
3. Request these permissions if needed:
   - `leads_retrieval`
   - `ads_read`
   - `ads_management`
   - `business_management`

**Note**: For testing with your own account, you can use these permissions without App Review.

### Error: "Ad Account not found"

**Solution**:
1. Make sure you're using the correct Ad Account ID
2. The Ad Account must belong to the Facebook account you connected
3. Try getting the Ad Account ID again using Graph API Explorer

### Error: "Lead Gen Form not found"

**Solution**:
1. Make sure the Form ID is correct
2. The form must belong to the Ad Account you specified
3. Try querying forms using Graph API Explorer to verify the Form ID

### No leads syncing

**Possible causes**:
1. Webhook not configured (for real-time sync)
2. No new leads in the form
3. Sync hasn't run yet

**Solution**:
- Use **"Sync Now"** button for manual sync
- Check if there are any leads in your Lead Gen Form
- For real-time sync, you'll need to configure webhooks (see main guide)

---

## Next Steps

Once testing is successful:

1. ✅ Integration is working
2. ✅ Leads can be synced manually
3. 🔄 Configure webhooks for automatic lead capture (see `FACEBOOK_INTEGRATION_GUIDE.md`)
4. 🔄 Set up campaign assignments to route leads to sales reps
5. 🔄 Test with real campaigns

---

## Quick Reference

- **Facebook Developers**: https://developers.facebook.com/
- **Facebook Ads Manager**: https://business.facebook.com/adsmanager/
- **Graph API Explorer**: https://developers.facebook.com/tools/explorer/
- **Forms Library**: https://business.facebook.com/adsmanager/manage/forms

---

## Notes for Personal Account Testing

- ✅ You can test all features with a personal account
- ✅ No App Review needed for your own account
- ✅ You can create test Lead Gen Forms
- ⚠️ Some features may be limited (e.g., Business Manager features)
- ⚠️ For production, consider using a Facebook Business account

---

**Need Help?** Check the main guide: `FACEBOOK_INTEGRATION_GUIDE.md`

