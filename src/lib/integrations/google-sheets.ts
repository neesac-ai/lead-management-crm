import { BaseIntegrationClass, type LeadData } from './base'
import { extractSpreadsheetId, getSheetsClient } from '@/lib/google/sheets'
import { refreshGoogleSheetsAccessToken } from '@/lib/google/sheets-oauth'

type SheetsCredentials = {
  access_token?: string
  refresh_token?: string
  token_expiry?: string | null
}

type SheetsConfig = {
  sheet_url?: string
  sheet_tab_name?: string
  column_mapping?: {
    phone?: string
    name?: string
    email?: string
    company?: string
    source?: string
  }
  cursor_last_row?: number
  max_rows_per_sync?: number
}

function normalizeHeader(s: string) {
  return s.trim().toLowerCase()
}

function digitsOnly(s: string) {
  return s.replace(/\D/g, '')
}

function pickHeaderIndex(headers: string[], desiredHeader?: string, fallbacks: string[] = []) {
  const normalized = headers.map(normalizeHeader)
  if (desiredHeader) {
    const idx = normalized.indexOf(normalizeHeader(desiredHeader))
    if (idx >= 0) return idx
  }
  for (const fb of fallbacks) {
    const idx = normalized.indexOf(normalizeHeader(fb))
    if (idx >= 0) return idx
  }
  return -1
}

export class GoogleSheetsIntegration extends BaseIntegrationClass {
  platform = 'google_sheets' as const
  name = 'Google Sheets'

  verifyWebhookSignature(): boolean {
    // Not used (polling-based)
    return false
  }

  extractLeadFromWebhook(): LeadData | null {
    // Not used (polling-based)
    return null
  }

  async fetchCampaigns(): Promise<Array<{ id: string; name: string }>> {
    return []
  }

  async testConnection(credentials: Record<string, unknown>, config: Record<string, unknown>) {
    const creds = credentials as SheetsCredentials
    const cfg = config as SheetsConfig
    if (!creds.refresh_token && !creds.access_token) {
      return { success: false, message: 'Google account not connected' }
    }
    if (!cfg.sheet_url || !cfg.sheet_tab_name) {
      return { success: false, message: 'Sheet URL and Tab Name are required' }
    }
    const spreadsheetId = extractSpreadsheetId(cfg.sheet_url)
    if (!spreadsheetId) {
      return { success: false, message: 'Invalid Google Sheet URL' }
    }
    return { success: true }
  }

  async fetchLeads(
    credentials: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<LeadData[]> {
    const creds = credentials as SheetsCredentials
    const cfg = config as SheetsConfig

    if (!cfg.sheet_url || !cfg.sheet_tab_name) {
      throw new Error('Missing sheet_url or sheet_tab_name in integration config')
    }

    const spreadsheetId = extractSpreadsheetId(cfg.sheet_url)
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheet URL')
    }

    if (!creds.access_token && !creds.refresh_token) {
      throw new Error('Google Sheets not connected (missing access_token/refresh_token)')
    }

    // Refresh token best-effort (like Drive sync does)
    let accessToken = creds.access_token
    if (creds.refresh_token) {
      try {
        const refreshed = await refreshGoogleSheetsAccessToken(creds.refresh_token)
        if (refreshed.access_token) {
          accessToken = refreshed.access_token
        }
      } catch {
        // If refresh fails, we fall back to current access token (may still work)
      }
    }
    if (!accessToken) {
      throw new Error('Missing Google access token')
    }

    const sheets = getSheetsClient(accessToken, creds.refresh_token || undefined)
    const tab = cfg.sheet_tab_name

    // Read header row
    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!1:1`,
      majorDimension: 'ROWS',
    })

    const headers = (headerResp.data.values?.[0] || []).map((v) => String(v))
    if (headers.length === 0) return []

    const mapping = cfg.column_mapping || {}

    const phoneIdx = pickHeaderIndex(headers, mapping.phone, ['phone', 'phone number', 'mobile', 'mobile number', 'contact'])
    const nameIdx = pickHeaderIndex(headers, mapping.name, ['name', 'full name'])
    const emailIdx = pickHeaderIndex(headers, mapping.email, ['email', 'email id'])
    const companyIdx = pickHeaderIndex(headers, mapping.company, ['company', 'organization'])
    const sourceIdx = pickHeaderIndex(headers, mapping.source, ['source', 'lead source'])

    // We require phone for CRM ingest (user preference)
    if (phoneIdx < 0) return []

    const cursorLastRow = typeof cfg.cursor_last_row === 'number' ? cfg.cursor_last_row : 1
    const startRow = Math.max(2, cursorLastRow + 1) // row 1 is header
    const maxRows = typeof cfg.max_rows_per_sync === 'number' ? cfg.max_rows_per_sync : 500

    // Pull rows from startRow onward (cap by maxRows)
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!A${startRow}:ZZ${startRow + maxRows - 1}`,
      majorDimension: 'ROWS',
    })

    const rows = dataResp.data.values || []
    if (rows.length === 0) return []

    const leads: LeadData[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || []
      const rowNumber = startRow + i

      const phoneRaw = phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : ''
      const phone = digitsOnly(phoneRaw)
      if (!phone) continue

      const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : ''
      const email = emailIdx >= 0 ? String(row[emailIdx] || '').trim() : ''
      const company = companyIdx >= 0 ? String(row[companyIdx] || '').trim() : ''
      const source = sourceIdx >= 0 ? String(row[sourceIdx] || '').trim() : ''

      leads.push({
        name: name || 'Unknown',
        email: email || undefined,
        phone,
        company: company || undefined,
        external_id: `gsheets:${spreadsheetId}:${tab}:${rowNumber}`,
        metadata: {
          gsheets_spreadsheet_id: spreadsheetId,
          gsheets_tab: tab,
          gsheets_row: rowNumber,
          ...(source ? { source } : {}),
        },
      })
    }

    return leads
  }
}

