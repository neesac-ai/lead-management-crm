import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/calls/log
 * Log a call attempt with exact duration and status
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
            phone_number,
            call_direction,
            call_status,
            call_started_at,
            call_ended_at,
            duration_seconds,
            ring_duration_seconds,
            talk_time_seconds,
            device_info,
            network_type,
        } = body

        // Validate required fields
        if (!phone_number || !call_direction || !call_status || !call_started_at) {
            return NextResponse.json(
                { error: 'Missing required fields: phone_number, call_direction, call_status, call_started_at' },
                { status: 400 }
            )
        }

        // Validate call_direction
        const validDirections = ['incoming', 'outgoing', 'missed', 'rejected', 'blocked']
        if (!validDirections.includes(call_direction)) {
            return NextResponse.json(
                { error: `Invalid call_direction. Must be one of: ${validDirections.join(', ')}` },
                { status: 400 }
            )
        }

        // Validate call_status
        const validStatuses = ['completed', 'missed', 'rejected', 'blocked', 'busy', 'failed']
        if (!validStatuses.includes(call_status)) {
            return NextResponse.json(
                { error: `Invalid call_status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            )
        }

        // Insert call log
        const { data: callLog, error } = await supabase
            .from('call_logs')
            .insert({
                org_id: profile.org_id,
                lead_id: lead_id || null,
                user_id: profile.id,
                phone_number,
                call_direction,
                call_status,
                call_started_at,
                call_ended_at: call_ended_at || null,
                duration_seconds: duration_seconds || 0,
                ring_duration_seconds: ring_duration_seconds || 0,
                talk_time_seconds: talk_time_seconds || 0,
                device_info: device_info || null,
                network_type: network_type || null,
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating call log:', error)
            return NextResponse.json(
                { error: 'Failed to create call log', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ call_log: callLog, message: 'Call logged successfully' })
    } catch (error) {
        console.error('Call log error:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

