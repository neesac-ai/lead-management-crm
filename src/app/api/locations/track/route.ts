import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/locations/track
 * Log a team member tracking point (team member only).
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const {
      latitude,
      longitude,
      accuracy,
      address,
      location_type,
      tracking_session_id,
      notes,
    } = body

    // Validate required fields
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: latitude, longitude' },
        { status: 400 }
      )
    }

    // Validate location_type
    const normalizedType = typeof location_type === 'string' ? location_type : 'tracking'
    const validTypes = ['tracking']
    if (!validTypes.includes(normalizedType)) {
      return NextResponse.json(
        { error: `Invalid location_type. Must be: tracking` },
        { status: 400 }
      )
    }

    // Insert location entry
    const { data: location, error } = await supabase
      .from('team_locations')
      .insert({
        org_id: profile.org_id,
        user_id: profile.id,
        lead_id: null,
        latitude: latitude,
        longitude: longitude,
        accuracy: accuracy || null,
        address: address || null,
        location_type: 'tracking',
        tracking_session_id: tracking_session_id || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating location entry:', error)
      return NextResponse.json(
        { error: 'Failed to create location entry', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ location, message: 'Location logged successfully' })
  } catch (error) {
    console.error('Location track error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


