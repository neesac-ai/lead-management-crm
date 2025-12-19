import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getTokensFromCode } from '@/lib/google/oauth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // This is the user's auth_id
  const error = searchParams.get('error')

  // Handle error from Google
  if (error) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(new URL('/?google_auth=error', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?google_auth=missing_params', request.url))
  }

  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code)
    
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('Missing tokens from Google')
      return NextResponse.redirect(new URL('/?google_auth=no_tokens', request.url))
    }

    // Use admin client to update user tokens (bypasses RLS)
    const supabase = await createAdminClient()
    
    // Find the user by auth_id and update their tokens
    const { error: updateError } = await supabase
      .from('users')
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date 
          ? new Date(tokens.expiry_date).toISOString() 
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_id', state)

    if (updateError) {
      console.error('Error saving Google tokens:', updateError)
      return NextResponse.redirect(new URL('/?google_auth=save_error', request.url))
    }

    // Redirect back to home (will redirect to dashboard) with success
    return NextResponse.redirect(new URL('/?google_auth=success', request.url))
  } catch (err) {
    console.error('Error in Google OAuth callback:', err)
    return NextResponse.redirect(new URL('/?google_auth=error', request.url))
  }
}

