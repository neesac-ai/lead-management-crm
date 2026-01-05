import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/locations/[leadId]
 * Get location history for a specific lead
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
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

    // Verify lead exists and user has access
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, org_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Verify lead is in user's org
    if (lead.org_id !== profile.org_id && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Lead not in your organization' }, { status: 403 })
    }

    // Get location history for this lead
    const { data: locations, error } = await supabase
      .from('team_locations')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('lead_id', leadId)
      .eq('org_id', profile.org_id)
      .order('recorded_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Error fetching locations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch locations', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ locations: locations || [] })
  } catch (error) {
    console.error('Get locations error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


