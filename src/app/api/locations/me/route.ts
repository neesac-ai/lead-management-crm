import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/locations/me
 * Returns the latest location for the authenticated user.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: location, error } = await supabase
      .from('team_locations')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('user_id', profile.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching my location:', error)
      return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 })
    }

    return NextResponse.json({ location: location ?? null })
  } catch (e) {
    console.error('My location GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


