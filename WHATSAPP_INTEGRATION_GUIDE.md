# WhatsApp Business API Integration Guide

## Understanding WhatsApp Campaigns vs Facebook Lead Ads

**Key Difference:**
- **Facebook Lead Ads**: Users fill out a form directly on Facebook → Lead is captured → Sent to CRM
- **WhatsApp Campaigns**: Users click an ad → Opens WhatsApp chat → Conversation happens → Lead is captured from the conversation

---

## How WhatsApp Campaigns Work

### 1. **Click-to-WhatsApp Ads** (Primary Method)

This is the main way leads are generated through WhatsApp:

#### How It Works:
1. **Create Ad on Facebook/Instagram**
   - Objective: "Messages" or "Conversions"
   - Call-to-Action: "Send WhatsApp Message"
   - User clicks the ad → WhatsApp opens with a pre-filled message

2. **User Initiates Chat**
   - WhatsApp opens with your business number
   - User sends a message (e.g., "Hi, I'm interested in your product")
   - This creates a conversation/lead

3. **Lead Capture**
   - Conversation is received via WhatsApp Business API webhook
   - Extract lead information from:
     - Initial message
     - Conversation flow (if using chatbot)
     - User profile (phone number, name)

#### Example Flow:
```
User sees ad on Facebook
    ↓
Clicks "Send WhatsApp Message" button
    ↓
WhatsApp opens with pre-filled message: "Hi, I'm interested"
    ↓
User sends message to your business
    ↓
Webhook receives message event
    ↓
Lead created in CRM with:
  - Phone number
  - Name (from WhatsApp profile)
  - Initial message
  - Ad campaign info
```

---

### 2. **WhatsApp Business API Features**

#### A. **Message Templates** (For Outbound Campaigns)
- Pre-approved message templates for sending notifications
- Used for:
  - Order confirmations
  - Shipping updates
  - Promotional messages (to opted-in users)
  - Appointment reminders

#### B. **Conversation-Based Lead Generation**
- Leads come from **conversations**, not forms
- Information extracted from:
  - User's WhatsApp profile (name, phone)
  - Conversation messages
  - Chatbot interactions
  - Form submissions within chat (if using chatbot)

#### C. **Webhooks for Real-Time Lead Capture**
- WhatsApp sends webhook events for:
  - New messages
  - Message status updates (sent, delivered, read)
  - User profile updates

---

## WhatsApp Business API Setup Requirements

### 1. **WhatsApp Business Account**
- You need a **WhatsApp Business Account** (not regular WhatsApp)
- Can be obtained through:
  - **Meta Business Manager** (recommended)
  - **WhatsApp Business API Providers** (Twilio, MessageBird, etc.)

### 2. **Phone Number Verification**
- Business phone number must be verified
- Can use a new number or migrate existing WhatsApp Business number
- Number must be able to receive SMS for verification

### 3. **Meta Business Account**
- Required for Click-to-WhatsApp ads
- Must be linked to your Facebook/Instagram ad account

### 4. **API Credentials**
- **Phone Number ID**: Your WhatsApp Business phone number ID
- **Access Token**: API access token from Meta
- **App Secret**: For webhook verification
- **Business Account ID**: Your Meta Business Account ID

---

## Integration Architecture

### Lead Generation Flow:

```
┌─────────────────┐
│ Facebook/Instagram Ad │
│ (Click-to-WhatsApp)   │
└────────┬──────────────┘
         │
         │ User clicks ad
         ↓
┌─────────────────┐
│   WhatsApp Opens │
│   (Pre-filled msg) │
└────────┬──────────────┘
         │
         │ User sends message
         ↓
┌─────────────────┐
│ WhatsApp Business API │
│   (Receives message)   │
└────────┬──────────────┘
         │
         │ Webhook event
         ↓
┌─────────────────┐
│   Your CRM      │
│  (Webhook Handler) │
└────────┬──────────────┘
         │
         │ Extract lead data
         ↓
┌─────────────────┐
│   Lead Created  │
│   in CRM        │
└─────────────────┘
```

---

## What Data Can We Capture?

### From Click-to-WhatsApp Ads:
1. **Phone Number** (always available)
2. **Name** (from WhatsApp profile)
3. **Initial Message** (what user sent)
4. **Ad Campaign Info**:
   - Campaign ID
   - Ad Set ID
   - Ad ID
   - Click timestamp
5. **User Context**:
   - Device type
   - Location (if available)

### From Conversations:
1. **Message History** (if storing conversations)
2. **Engagement Metrics**:
   - Response time
   - Message count
   - Last interaction

---

## Implementation Approach

### Option 1: **Meta Cloud API** (Recommended for Most)
- Managed by Meta
- Easier setup
- Built-in webhook support
- Good for small to medium businesses

**Setup Steps:**
1. Create Meta Business Account
2. Add WhatsApp product
3. Verify phone number
4. Get API credentials
5. Configure webhooks

### Option 2: **Third-Party Providers** (Twilio, MessageBird, etc.)
- More features (chatbots, automation)
- Better for enterprise
- Additional costs
- More complex setup

**Setup Steps:**
1. Sign up with provider
2. Get WhatsApp Business API access
3. Configure webhooks
4. Set up chatbot (optional)

---

## Webhook Events We Need to Handle

### 1. **messages** Event
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "1234567890",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": {
            "name": "John Doe"
          },
          "wa_id": "1234567890"
        }],
        "messages": [{
          "from": "1234567890",
          "id": "MESSAGE_ID",
          "timestamp": "1234567890",
          "text": {
            "body": "Hi, I'm interested"
          },
          "type": "text"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### 2. **message_status** Event
- Tracks message delivery status
- Useful for engagement metrics

### 3. **user_profile** Event
- User profile updates
- Name changes, etc.

---

## Campaign Tracking

### How to Track Which Campaign Generated a Lead:

1. **From Webhook**:
   - Check `referral` object in message (if available)
   - Contains ad campaign information

2. **From Click-to-WhatsApp Ad**:
   - Meta includes campaign data in webhook
   - Can extract: `ad_id`, `campaign_id`, `adset_id`

3. **Custom Parameters**:
   - Add UTM parameters to ad
   - Parse from initial message or referral data

---

## Differences from Facebook Lead Ads

| Feature | Facebook Lead Ads | WhatsApp Campaigns |
|---------|------------------|-------------------|
| **Lead Format** | Form submission | Conversation/Message |
| **User Action** | Fill form on Facebook | Click ad → Chat on WhatsApp |
| **Data Capture** | Form fields | Message content + Profile |
| **Real-time** | Yes (webhook) | Yes (webhook) |
| **Campaign Type** | Lead Ads | Click-to-WhatsApp Ads |
| **Setup Complexity** | Medium | Higher (needs WhatsApp Business API) |
| **Cost** | Ad spend only | Ad spend + WhatsApp API costs |
| **Engagement** | One-time form | Ongoing conversation |

---

## Implementation Plan for BharatCRM

### Phase 1: Basic Integration
1. ✅ Create WhatsApp integration structure (already done)
2. ⏳ Implement webhook handler for WhatsApp
3. ⏳ Extract lead data from webhook payload
4. ⏳ Map to CRM lead structure
5. ⏳ Store campaign metadata

### Phase 2: Campaign Tracking
1. ⏳ Fetch Click-to-WhatsApp campaigns from Meta API
2. ⏳ Track campaign assignments
3. ⏳ Assign leads based on campaign

### Phase 3: Advanced Features
1. ⏳ Conversation history storage
2. ⏳ Chatbot integration (optional)
3. ⏳ Message status tracking
4. ⏳ Engagement metrics

---

## Testing WhatsApp Integration

### Without Real Campaigns:

1. **Use Meta Graph API Explorer**:
   - Test webhook payloads
   - Simulate message events
   - Verify data extraction

2. **Create Test Click-to-WhatsApp Ad**:
   - Create a test ad in Facebook Ads Manager
   - Use test mode
   - Click the ad yourself
   - Verify webhook receives event

3. **Manual Webhook Testing**:
   - Use Postman/curl to send test webhook payloads
   - Verify lead creation in CRM

---

## Required API Permissions

For WhatsApp Business API:
- `whatsapp_business_messaging` - Send/receive messages
- `whatsapp_business_management` - Manage business account
- `ads_read` - Read ad campaigns (for Click-to-WhatsApp)
- `ads_management` - Manage ads (optional)

---

## Cost Considerations

1. **Meta Cloud API**:
   - Free tier: Limited messages/month
   - Paid: Per conversation (varies by country)
   - Ad costs: Separate (Facebook/Instagram ad spend)

2. **Third-Party Providers**:
   - Monthly subscription + per-message costs
   - Additional features (chatbots, automation)

---

## Next Steps for Implementation

1. **Decide on API Provider**:
   - Meta Cloud API (simpler, managed)
   - Third-party (more features, more complex)

2. **Set Up WhatsApp Business Account**:
   - Verify phone number
   - Get API credentials
   - Configure webhooks

3. **Implement Webhook Handler**:
   - Similar to Facebook webhook handler
   - Extract message data
   - Create leads in CRM

4. **Test with Click-to-WhatsApp Ad**:
   - Create test ad
   - Verify end-to-end flow

---

## Key Takeaways

✅ **WhatsApp campaigns are different from Facebook Lead Ads**
- Leads come from **conversations**, not forms
- User clicks ad → Opens WhatsApp → Sends message → Lead created

✅ **Click-to-WhatsApp Ads are the primary method**
- Ads on Facebook/Instagram
- Button opens WhatsApp chat
- Conversation = Lead

✅ **Webhooks are essential**
- Real-time lead capture
- Message events trigger lead creation
- Campaign metadata included

✅ **More complex than Facebook**
- Requires WhatsApp Business API
- Phone number verification
- Additional setup steps

---

**Questions to Consider:**
1. Do you want to use Meta Cloud API or a third-party provider?
2. Do you need chatbot functionality?
3. Do you want to store conversation history?
4. What's your expected message volume?

Let me know which approach you'd like to take, and I can help implement it!

