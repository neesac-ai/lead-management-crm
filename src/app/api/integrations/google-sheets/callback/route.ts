import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleSheetsTokensFromCode } from '@/lib/google/sheets-oauth'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state') // integration id
  const error = request.nextUrl.searchParams.get('error')
  const errorDescription = request.nextUrl.searchParams.get('error_description')

  if (error) {
    return NextResponse.redirect(
      new URL(`/?google_sheets_oauth=error&message=${encodeURIComponent(errorDescription || error)}`, request.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?google_sheets_oauth=missing_params', request.url))
  }

  const integrationId = state
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=unauthorized', request.url))
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=no_profile', request.url))
    }
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=forbidden', request.url))
    }

    // Load integration
    let q = supabase
      .from('platform_integrations')
      .select('*')
      .eq('id', integrationId)
    if (profile.role !== 'super_admin') {
      q = q.eq('org_id', profile.org_id)
    }
    const { data: integration } = await q.single()
    if (!integration) {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=integration_not_found', request.url))
    }
    if (integration.platform !== 'google_sheets') {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=wrong_platform', request.url))
    }

    const tokens = await getGoogleSheetsTokensFromCode(code)
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=no_access_token', request.url))
    }

    // Note: refresh_token is only returned on first consent (prompt=consent helps).
    const existingCreds = (integration.credentials || {}) as Record<string, unknown>
    const refreshToken = (tokens.refresh_token || (existingCreds.refresh_token as string | undefined)) || null

    const updatedCredentials = {
      ...existingCreds,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    }

    const { error: updateError } = await supabase
      .from('platform_integrations')
      .update({
        credentials: updatedCredentials,
        sync_status: 'idle',
        error_message: null,
      })
      .eq('id', integrationId)

    if (updateError) {
      return NextResponse.redirect(new URL('/?google_sheets_oauth=save_error', request.url))
    }

    // Resolve org slug so we can redirect back to the integration page.
    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('id', integration.org_id)
      .single()

    const orgSlug = org?.slug || 'neesac-ai'
    return NextResponse.redirect(new URL(`/${orgSlug}/integrations/${integrationId}?oauth=success`, request.url))
  } catch (err) {
    return NextResponse.redirect(
      new URL(
        `/?google_sheets_oauth=error&message=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`,
        request.url
      )
    )
  }
}

