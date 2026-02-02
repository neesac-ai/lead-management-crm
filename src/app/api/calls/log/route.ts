import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/leads/duplicate-check'

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
        const validDirections = ['incoming', 'outgoing']
        if (!validDirections.includes(call_direction)) {
            return NextResponse.json(
                { error: `Invalid call_direction. Must be one of: ${validDirections.join(', ')}` },
                { status: 400 }
            )
        }

        // Validate call_status
        const validStatuses = [
            'completed',
            'missed',
            'rejected',
            'blocked',
            'busy',
            'failed',
            'voicemail',
            'answered_externally',
            'unknown',
        ]
        if (!validStatuses.includes(call_status)) {
            return NextResponse.json(
                { error: `Invalid call_status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            )
        }

        // Lead mapping: if lead_id not provided, try to map by phone number within org.
        let resolvedLeadId: string | null = lead_id || null
        if (!resolvedLeadId && typeof phone_number === 'string') {
            try {
                const normalized = normalizePhone(phone_number)
                const last10 = normalized.replace(/[^\d]/g, '').slice(-10)

                // Fetch a small candidate set; then do strict normalization compare in JS.
                const { data: candidates } = await supabase
                    .from('leads')
                    .select('id, phone, updated_at')
                    .eq('org_id', profile.org_id)
                    .not('phone', 'is', null)
                    .ilike('phone', `%${last10}`)
                    .order('updated_at', { ascending: false })
                    .limit(50)

                const best = (candidates || []).find((l: any) => {
                    const leadPhone = typeof l.phone === 'string' ? l.phone : ''
                    const leadNorm = normalizePhone(leadPhone)
                    if (leadNorm === normalized) return true
                    const leadLast10 = leadNorm.replace(/[^\d]/g, '').slice(-10)
                    return leadLast10 === last10
                })

                if (best?.id) resolvedLeadId = String(best.id)
            } catch (e) {
                console.warn('Lead mapping failed, continuing without lead_id', e)
            }
        }

        // Check for duplicate call log (same user, phone, start time within 10 seconds, and similar duration)
        const callStartTime = new Date(call_started_at)
        const tenSecondsBefore = new Date(callStartTime.getTime() - 10000)
        const tenSecondsAfter = new Date(callStartTime.getTime() + 10000)
        const durationSeconds = duration_seconds || 0
        const durationTolerance = 5 // Allow ±5 seconds difference in duration

        const { data: existingLogs } = await supabase
            .from('call_logs')
            .select('id, duration_seconds')
            .eq('user_id', profile.id)
            .eq('phone_number', phone_number)
            .gte('call_started_at', tenSecondsBefore.toISOString())
            .lte('call_started_at', tenSecondsAfter.toISOString())
            .limit(10) // Get multiple to check duration

        // Filter by duration similarity
        const duplicateLog = existingLogs?.find(log => {
            const existingDuration = log.duration_seconds || 0
            const durationDiff = Math.abs(existingDuration - durationSeconds)
            return durationDiff <= durationTolerance
        })

        if (duplicateLog) {
            console.log('Duplicate call log detected, skipping insert:', {
                user_id: profile.id,
                phone_number,
                call_started_at,
                duration_seconds,
                existing_id: duplicateLog.id,
                existing_duration: duplicateLog.duration_seconds
            })
            return NextResponse.json({
                call_log: duplicateLog,
                message: 'Call already logged (duplicate prevented)',
                duplicate: true
            })
        }

        // Insert call log
        const { data: callLog, error } = await supabase
            .from('call_logs')
            .insert({
                org_id: profile.org_id,
                lead_id: resolvedLeadId,
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

