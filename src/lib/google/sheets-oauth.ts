import { google } from 'googleapis'

// Minimal scopes for reading Google Sheets (no Drive picker)
const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

export function getSheetsOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  const redirectUri = `${baseUrl || 'http://localhost:3000'}/api/integrations/google-sheets/callback`

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getGoogleSheetsAuthUrl(state: string) {
  const oauth2Client = getSheetsOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SHEETS_SCOPES,
    prompt: 'consent',
    state,
  })
}

export async function getGoogleSheetsTokensFromCode(code: string) {
  const oauth2Client = getSheetsOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function refreshGoogleSheetsAccessToken(refreshToken: string) {
  const oauth2Client = getSheetsOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

export function getSheetsAuthedOAuthClient(accessToken: string, refreshToken?: string) {
  const oauth2Client = getSheetsOAuth2Client()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return oauth2Client
}

