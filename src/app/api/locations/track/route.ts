import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/locations/track
 * Log continuous tracking point or geofence event
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
      lead_id,
      latitude,
      longitude,
      accuracy,
      address,
      location_type,
      tracking_session_id,
      notes,
    } = body

    // Validate required fields
    if (latitude === undefined || longitude === undefined || !location_type) {
      return NextResponse.json(
        { error: 'Missing required fields: latitude, longitude, location_type' },
        { status: 400 }
      )
    }

    // Validate location_type
    const validTypes = ['checkin', 'tracking', 'geofence']
    if (!validTypes.includes(location_type)) {
      return NextResponse.json(
        { error: `Invalid location_type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify lead if provided
    if (lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, org_id')
        .eq('id', lead_id)
        .single()

      if (leadError || !lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      }

      // Verify lead is in user's org
      if (lead.org_id !== profile.org_id && profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Lead not in your organization' }, { status: 403 })
      }
    }

    // Insert location entry
    const { data: location, error } = await supabase
      .from('team_locations')
      .insert({
        org_id: profile.org_id,
        user_id: profile.id,
        lead_id: lead_id || null,
        latitude: latitude,
        longitude: longitude,
        accuracy: accuracy || null,
        address: address || null,
        location_type: location_type,
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


