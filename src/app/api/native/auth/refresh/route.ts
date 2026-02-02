import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * POST /api/native/auth/refresh
 *
 * Exchanges a Supabase refresh token for a new access token.
 * Used by native background services (so they can keep uploading even if the WebView isn't open).
 *
 * Body: { refresh_token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const refreshToken = String(body?.refresh_token || '').trim()
    if (!refreshToken) {
      return NextResponse.json({ error: 'Missing refresh_token' }, { status: 400 })
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data?.session) {
      return NextResponse.json({ error: 'Failed to refresh session' }, { status: 401 })
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Internal server error', details: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

