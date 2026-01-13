import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractSpreadsheetId, getSheetsClient } from '@/lib/google/sheets'
import { refreshGoogleSheetsAccessToken } from '@/lib/google/sheets-oauth'

type PreviewRow = {
  rowNumber: number
  cells: Record<string, string>
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let q = supabase.from('platform_integrations').select('*').eq('id', id)
    if (profile.role !== 'super_admin') {
      q = q.eq('org_id', profile.org_id)
    }
    const { data: integration } = await q.single()
    if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    if (integration.platform !== 'google_sheets') {
      return NextResponse.json({ error: 'Not a Google Sheets integration' }, { status: 400 })
    }

    const config = (integration.config || {}) as Record<string, unknown>
    const sheetUrl = String(config.sheet_url || '')
    const tabName = String(config.sheet_tab_name || '')
    if (!sheetUrl || !tabName) {
      return NextResponse.json({ error: 'Missing sheet_url or sheet_tab_name in config' }, { status: 400 })
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Invalid Google Sheet URL' }, { status: 400 })
    }

    const creds = (integration.credentials || {}) as Record<string, unknown>
    const refreshToken = (creds.refresh_token as string | undefined) || undefined
    let accessToken = (creds.access_token as string | undefined) || undefined
    if (refreshToken) {
      const refreshed = await refreshGoogleSheetsAccessToken(refreshToken)
      if (refreshed.access_token) accessToken = refreshed.access_token
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
    }

    const maxRows = Number(request.nextUrl.searchParams.get('max_rows') || '200')
    const clampedMaxRows = Number.isFinite(maxRows) ? Math.min(Math.max(maxRows, 1), 2000) : 200

    const sheets = getSheetsClient(accessToken, refreshToken)

    // Read header row (Row 1)
    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!1:1`,
      majorDimension: 'ROWS',
    })
    const headers = (headerResp.data.values?.[0] || []).map((v) => String(v).trim()).filter(Boolean)
    if (headers.length === 0) {
      return NextResponse.json({ headers: [], rows: [] })
    }

    // Read all columns for N rows (starting row 2)
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A2:ZZ${clampedMaxRows + 1}`,
      majorDimension: 'ROWS',
    })

    const values = dataResp.data.values || []
    const rows: PreviewRow[] = values.map((row, idx) => {
      const rowNumber = 2 + idx
      const cells: Record<string, string> = {}
      for (let i = 0; i < headers.length; i++) {
        cells[headers[i]] = String(row?.[i] ?? '').trim()
      }
      return { rowNumber, cells }
    })

    return NextResponse.json({ headers, rows })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to preview sheet', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

