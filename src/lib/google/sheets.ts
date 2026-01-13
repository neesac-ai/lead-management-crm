import { google } from 'googleapis'
import { getSheetsAuthedOAuthClient } from './sheets-oauth'

export function extractSpreadsheetId(sheetUrlOrId: string): string | null {
  const input = sheetUrlOrId.trim()
  if (!input) return null

  // If it's already an ID (most are 40+ chars with letters, numbers, -, _)
  if (!input.startsWith('http')) {
    return input
  }

  // Common URL format: https://docs.google.com/spreadsheets/d/{ID}/edit...
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m?.[1]) return m[1]

  // Alternate: ...?id={ID}
  const url = new URL(input)
  const id = url.searchParams.get('id')
  return id || null
}

export function getSheetsClient(accessToken: string, refreshToken?: string) {
  const auth = getSheetsAuthedOAuthClient(accessToken, refreshToken)
  return google.sheets({ version: 'v4', auth })
}

