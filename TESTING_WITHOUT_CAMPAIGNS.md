# Testing Facebook Integration Without Campaigns

If you've connected your personal Facebook account and don't have any campaigns yet, here's how to test the integration:

## Option 1: Test Connection Only (Quick Test)

You can test if the connection is working without needing campaigns:

1. **Go to Overview tab** in your integration
2. **Click "Test Connection"** button
3. **Expected Result:**
   - ✅ "Connection test successful"
   - Shows your Ad Account details
   - Shows token expiration date

**This confirms:**
- ✅ Facebook OAuth is working
- ✅ Access token is valid
- ✅ API permissions are correct
- ✅ You can access your Ad Account

---

## Option 2: Create a Test Lead Gen Form (Recommended)

Even without active campaigns, you can create a Lead Gen Form to test lead syncing:

### Step 1: Create a Test Form in Facebook Ads Manager

1. Go to [Facebook Ads Manager](https://business.facebook.com/adsmanager/)
2. Click **"Forms Library"** in the left sidebar
3. Click **"Create Form"** button
4. Fill in:
   - **Form Name**: "Test Form - BharatCRM"
   - **Form Type**: Choose "More volume" or "Higher intent"
   - **Questions**: Add a few test fields:
     - Full Name
     - Email
     - Phone Number (optional)
5. Click **"Create"**
6. **Copy the Form ID** from the URL (looks like `form_id=123456789`)

### Step 2: Configure Form ID in CRM

1. Go to your integration's **Settings** tab
2. Find **"Lead Gen Form ID"** field (if available)
3. Enter the Form ID you copied
4. Click **"Save Settings"**

### Step 3: Test Manual Sync

1. Go to **Overview** tab
2. Click **"Sync Now"** button
3. **Expected Result:**
   - Sync completes successfully
   - Shows "0 leads" if no leads exist yet (this is normal)

### Step 4: Submit a Test Lead (Optional)

1. Go back to Facebook Ads Manager → **Forms Library**
2. Click on your test form
3. Click **"Preview"** or **"Test Form"**
4. Fill in the form with test data
5. Submit the form
6. Wait 1-2 minutes
7. Go back to CRM → **Overview** tab
8. Click **"Sync Now"** again
9. **Expected Result:**
   - Lead appears in your CRM **Leads** page
   - Lead source shows as "facebook"
   - Lead has integration metadata

---

## Option 3: Use Graph API Explorer to Test

You can test the API directly without campaigns:

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app from the dropdown
3. Click **"Get Token"** → **"Get User Access Token"**
4. Select permissions:
   - `leads_retrieval`
   - `ads_read`
5. Click **"Generate Access Token"**
6. Test queries:
   - `me/adaccounts` - Get your ad accounts
   - `{ad_account_id}/leadgen_forms` - Get Lead Gen Forms
   - `{form_id}/leads` - Get leads from a form

---

## Option 4: Create a Test Campaign (Full Test)

If you want to test the complete flow with campaigns:

### Step 1: Create a Test Campaign

1. Go to [Facebook Ads Manager](https://business.facebook.com/adsmanager/)
2. Click **"Create"** → **"Ad"**
3. Choose **"Leads"** as your objective
4. Fill in:
   - **Campaign Name**: "Test Campaign - BharatCRM"
   - **Ad Set**: Use default settings
   - **Ad**: Create a simple ad
   - **Form**: Select or create a Lead Gen Form
5. **Don't publish the campaign** - just save it as draft
6. **Copy the Campaign ID** from the URL

### Step 2: Configure in CRM

1. Go to integration's **Settings** tab
2. Select your Ad Account (should already be selected)
3. Click **"Fetch Campaigns"**
4. Your test campaign should appear in the list
5. **Check the box** next to your test campaign
6. Click **"Save Campaign Selection"**

### Step 3: Test Sync

1. Go to **Overview** tab
2. Click **"Sync Now"**
3. Check if leads are synced (if any exist)

---

## What You Can Test Without Campaigns

Even without campaigns, you can verify:

✅ **Connection Status**
- Facebook OAuth works
- Access token is valid
- API permissions are granted

✅ **Ad Account Access**
- Can fetch ad accounts
- Can access account details

✅ **Form Access** (if you create a test form)
- Can fetch Lead Gen Forms
- Can sync leads from forms

✅ **Manual Sync**
- Sync process works
- Error handling works

---

## What Requires Campaigns

These features need active campaigns:

❌ **Campaign Assignments**
- Assigning leads to sales reps based on campaigns
- Campaign-based routing

❌ **Campaign-Specific Lead Sync**
- Syncing leads from specific campaigns only
- Campaign filtering

---

## Quick Test Checklist

- [ ] Facebook App created and configured
- [ ] App ID and App Secret saved in CRM
- [ ] Facebook account connected (OAuth successful)
- [ ] "Test Connection" button works
- [ ] Connection status shows "Connected" in Overview
- [ ] Ad Account is visible in Settings
- [ ] (Optional) Test Lead Gen Form created
- [ ] (Optional) Manual sync tested

---

## Troubleshooting

### "No campaigns found"
- **This is normal** if you don't have active campaigns
- You can still test connection and form access
- Create a test form to test lead syncing

### "Ad Account not found"
- Make sure you selected the correct Ad Account in Settings
- Verify the Ad Account ID is correct
- Check that you have access to the Ad Account in Facebook

### "Connection test fails"
- Check App ID and App Secret are correct
- Verify OAuth permissions were granted
- Check token hasn't expired (reconnect if needed)

---

## Next Steps

Once you have campaigns or a test form:

1. ✅ Configure campaign assignments (if you have campaigns)
2. ✅ Set up webhooks for real-time lead capture
3. ✅ Test with real leads
4. ✅ Verify lead assignment logic

---

**Remember:** For testing purposes, you don't need active, running campaigns. A draft campaign or a simple Lead Gen Form is enough to test the integration functionality.

