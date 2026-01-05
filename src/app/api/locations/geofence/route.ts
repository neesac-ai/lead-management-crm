import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/locations/geofence
 * Create or update a geofence for a lead
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
      radius_meters,
      name,
      auto_checkin_enabled = true,
    } = body

    // Validate required fields
    if (!lead_id || latitude === undefined || longitude === undefined || !radius_meters) {
      return NextResponse.json(
        { error: 'Missing required fields: lead_id, latitude, longitude, radius_meters' },
        { status: 400 }
      )
    }

    // Verify lead exists and user has access
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

    // Check if geofence already exists for this lead
    const { data: existingGeofence } = await supabase
      .from('geofences')
      .select('id')
      .eq('lead_id', lead_id)
      .single()

    let geofence
    if (existingGeofence) {
      // Update existing geofence
      const { data: updated, error } = await supabase
        .from('geofences')
        .update({
          latitude: latitude,
          longitude: longitude,
          radius_meters: radius_meters,
          name: name || null,
          auto_checkin_enabled: auto_checkin_enabled,
        })
        .eq('id', existingGeofence.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating geofence:', error)
        return NextResponse.json(
          { error: 'Failed to update geofence', details: error.message },
          { status: 500 }
        )
      }
      geofence = updated
    } else {
      // Create new geofence
      const { data: created, error } = await supabase
        .from('geofences')
        .insert({
          org_id: profile.org_id,
          lead_id: lead_id,
          latitude: latitude,
          longitude: longitude,
          radius_meters: radius_meters,
          name: name || null,
          auto_checkin_enabled: auto_checkin_enabled,
          created_by: profile.id,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating geofence:', error)
        return NextResponse.json(
          { error: 'Failed to create geofence', details: error.message },
          { status: 500 }
        )
      }
      geofence = created
    }

    return NextResponse.json({ geofence, message: 'Geofence saved successfully' })
  } catch (error) {
    console.error('Geofence error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/locations/geofence
 * Remove a geofence
 */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const leadId = searchParams.get('lead_id')

    if (!leadId) {
      return NextResponse.json({ error: 'Missing lead_id parameter' }, { status: 400 })
    }

    // Delete geofence
    const { error } = await supabase
      .from('geofences')
      .delete()
      .eq('lead_id', leadId)
      .eq('org_id', profile.org_id)

    if (error) {
      console.error('Error deleting geofence:', error)
      return NextResponse.json(
        { error: 'Failed to delete geofence', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Geofence deleted successfully' })
  } catch (error) {
    console.error('Delete geofence error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


