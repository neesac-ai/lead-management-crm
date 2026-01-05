import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/calls/[leadId]
 * Get call history for a specific lead
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
      .select('id, org_id, phone')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Verify lead is in user's org
    if (lead.org_id !== profile.org_id && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Lead not in your organization' }, { status: 403 })
    }

    // Get call logs for this lead
    const { data: callLogs, error } = await supabase
      .from('call_logs')
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
      .order('call_started_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Error fetching call logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch call logs', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ call_logs: callLogs || [] })
  } catch (error) {
    console.error('Get call logs error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


