import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleSheetsAuthUrl } from '@/lib/google/sheets-oauth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
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

    // Ensure integration exists and is google_sheets
    let q = supabase
      .from('platform_integrations')
      .select('id, org_id, platform')
      .eq('id', id)

    if (profile.role !== 'super_admin') {
      q = q.eq('org_id', profile.org_id)
    }

    const { data: integration } = await q.single()
    if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    if (integration.platform !== 'google_sheets') {
      return NextResponse.json({ error: 'This OAuth route is only for Google Sheets integrations' }, { status: 400 })
    }

    // state carries integration id
    const authUrl = getGoogleSheetsAuthUrl(id)
    return NextResponse.redirect(authUrl)
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to start Google OAuth', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

