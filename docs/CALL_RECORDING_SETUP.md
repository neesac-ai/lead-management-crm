# Call Recording Setup Guide

This guide explains how to set up call recording for LeadFlow CRM. Recordings are automatically synced from Google Drive and analyzed using AI.

## Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Recording App  │ --> │  Google Drive   │ --> │  LeadFlow CRM   │
│  (Phone)        │     │  (Auto-sync)    │     │  (AI Analysis)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Android Setup (Recommended)

### Step 1: Install Cube ACR

1. Open Google Play Store
2. Search for "Cube ACR" or [download here](https://play.google.com/store/apps/details?id=com.catalinagroup.callrecorder)
3. Install the app

### Step 2: Grant Permissions

1. Open Cube ACR
2. Grant the following permissions:
   - Phone (for call detection)
   - Microphone (for recording)
   - Storage (for saving files)
   - Accessibility (required for call recording)

### Step 3: Configure Google Drive Backup

1. Open Cube ACR Settings (gear icon)
2. Go to **Cloud Backup**
3. Select **Google Drive**
4. Sign in with your Google account
5. Create or select folder: `LeadFlow_Recordings`
6. Enable **Auto-backup after each call**

### Step 4: Configure Recording Settings

1. Go to **Recording** settings
2. Enable **Record all calls** OR select specific contacts
3. Set audio format to **MP3** (recommended for compatibility)
4. Enable **Include phone number in filename** (important for matching)

### Filename Format

Configure the app to name files with the phone number:
- Example: `Call_+919876543210_2024-01-15_10-30-45.mp3`
- This allows LeadFlow to match recordings to leads automatically

---

## iOS Setup

### Important Note
iOS is more restrictive with call recording. The recommended app uses a conference call method.

### Step 1: Install Rev Call Recorder

1. Open App Store
2. Search for "Rev Call Recorder" or [download here](https://apps.apple.com/app/rev-call-recorder/id1314427365)
3. Install the app

### Step 2: How It Works

Rev Call Recorder uses a 3-way calling method:
1. Start your call
2. Open Rev app and tap "Record"
3. Merge the calls
4. Recording is captured through the conference

### Step 3: Configure Google Drive

1. Open Rev app settings
2. Connect to Google Drive
3. Select the `LeadFlow_Recordings` folder
4. Enable automatic uploads

### Alternative iOS Apps

- **TapeACall** - Similar conference-based recording
- **Call Recorder - IntCall** - Uses callback method

---

## LeadFlow CRM Setup

### Step 1: Configure AI Providers (Admin Only)

1. Go to **Settings > AI Configuration**
2. Add at least one AI provider:
   - **Groq** (Free tier) - Recommended for transcription
   - **OpenAI** - Best quality, paid
   - **Gemini** - Good for summaries, free tier available

### Step 2: Connect Google Account

1. Go to **Call Analytics**
2. Click **Sync from Drive**
3. If not connected, click to authorize Google Drive access
4. Select the recordings folder

### Step 3: Sync and Analyze

1. Click **Sync from Drive** to import new recordings
2. Only recordings matching lead phone numbers are imported
3. Click **Analyze** on pending recordings to transcribe and summarize

---

## How Matching Works

LeadFlow matches recordings to leads by phone number:

1. Recording filename: `Call_+919876543210_2024-01-15.mp3`
2. System extracts: `+919876543210`
3. Normalizes to: `+919876543210`
4. Matches to lead with phone: `9876543210` or `+91-9876543210`

**Phone Number Formats Supported:**
- `9876543210` (10 digit)
- `+919876543210` (with country code)
- `91-9876543210` (with country code and separator)
- `+91 98765 43210` (with spaces)

---

## Troubleshooting

### Recordings Not Syncing

1. Check Google Drive connection in LeadFlow
2. Verify recordings are in the correct folder
3. Ensure phone number is in the filename
4. Check if the phone number matches a lead

### Analysis Failed

1. Verify AI provider is configured and active
2. Check API key is valid (use "Test" button)
3. Ensure recording is not corrupted
4. Check file format (MP3, M4A, WAV supported)

### Phone Number Not Matching

1. Ensure lead's phone number is saved correctly
2. Use consistent format (preferably 10-digit)
3. Include country code if needed

---

## Privacy & Security

- Recordings are stored in YOUR Google Drive (not LeadFlow servers)
- Only recordings matching your leads are imported
- Personal calls are ignored during sync
- Transcripts and summaries are stored in your database
- You can delete recordings anytime from both Drive and LeadFlow

---

## Cost Estimation

| Component | Cost |
|-----------|------|
| Cube ACR (Android) | Free |
| Rev Call Recorder (iOS) | Free with limits |
| Google Drive (15GB) | Free |
| Groq Transcription | Free (rate limited) |
| Gemini Summary | Free tier |
| OpenAI (alternative) | ~$0.006/minute |

**Typical cost per 5-minute call: ₹0-3**






