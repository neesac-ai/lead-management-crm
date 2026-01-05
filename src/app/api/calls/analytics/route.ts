import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/calls/analytics
 * Get call analytics for the organization
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

    // Only admins can view analytics
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const userId = searchParams.get('user_id')

    // Build query
    let query = supabase
      .from('call_logs')
      .select('*')
      .eq('org_id', profile.org_id)

    if (startDate) {
      query = query.gte('call_started_at', startDate)
    }

    if (endDate) {
      query = query.lte('call_started_at', endDate)
    }

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: callLogs, error } = await query.order('call_started_at', { ascending: false })

    if (error) {
      console.error('Error fetching call analytics:', error)
      return NextResponse.json(
        { error: 'Failed to fetch call analytics', details: error.message },
        { status: 500 }
      )
    }

    // Calculate analytics
    const totalCalls = callLogs?.length || 0
    const completedCalls = callLogs?.filter(c => c.call_status === 'completed').length || 0
    const missedCalls = callLogs?.filter(c => c.call_status === 'missed').length || 0
    const totalDuration = callLogs?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0
    const totalTalkTime = callLogs?.reduce((sum, c) => sum + (c.talk_time_seconds || 0), 0) || 0
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0
    const avgTalkTime = completedCalls > 0 ? Math.round(totalTalkTime / completedCalls) : 0

    const analytics = {
      total_calls: totalCalls,
      completed_calls: completedCalls,
      missed_calls: missedCalls,
      total_duration_seconds: totalDuration,
      total_talk_time_seconds: totalTalkTime,
      avg_duration_seconds: avgDuration,
      avg_talk_time_seconds: avgTalkTime,
      completion_rate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
      call_logs: callLogs || [],
    }

    return NextResponse.json(analytics)
  } catch (error) {
    console.error('Call analytics error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


