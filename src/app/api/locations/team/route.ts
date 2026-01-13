import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/locations/team
 * Get real-time team locations (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('id, org_id, role')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Only admins can view team locations
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get latest location for each user in the org
    let query = supabase
      .from('team_locations')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('org_id', profile.org_id)
      .order('recorded_at', { ascending: false })
      .limit(limit)

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: locations, error } = await query

    if (error) {
      console.error('Error fetching team locations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch team locations', details: error.message },
        { status: 500 }
      )
    }

    // Group by user_id and get latest location for each user
    const latestLocations = new Map()
    locations?.forEach((location: any) => {
      const userId = location.user_id
      if (!latestLocations.has(userId) ||
        new Date(location.recorded_at) > new Date(latestLocations.get(userId).recorded_at)) {
        latestLocations.set(userId, location)
      }
    })

    return NextResponse.json({
      locations: Array.from(latestLocations.values()),
      total: latestLocations.size
    })
  } catch (error) {
    console.error('Team locations error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


