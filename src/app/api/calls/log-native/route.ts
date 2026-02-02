import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { normalizePhone } from '@/lib/leads/duplicate-check'

/**
 * POST /api/calls/log-native
 *
 * Same as /api/calls/log but authenticates using Authorization: Bearer <supabase_access_token>.
 * This is used by Android background/foreground services where cookies/WebView are not available.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { data: userResult, error: userError } = await supabase.auth.getUser()
    if (userError || !userResult?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authUser = userResult.user

    // Get user profile (org + internal user id)
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

    if (!phone_number || !call_direction || !call_status || !call_started_at) {
      return NextResponse.json(
        { error: 'Missing required fields: phone_number, call_direction, call_status, call_started_at' },
        { status: 400 }
      )
    }

    const validDirections = ['incoming', 'outgoing']
    if (!validDirections.includes(call_direction)) {
      return NextResponse.json(
        { error: `Invalid call_direction. Must be one of: ${validDirections.join(', ')}` },
        { status: 400 }
      )
    }

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

    // Lead mapping by phone if missing
    let resolvedLeadId: string | null = lead_id || null
    if (!resolvedLeadId && typeof phone_number === 'string') {
      try {
        const normalized = normalizePhone(phone_number)
        const last10 = normalized.replace(/[^\d]/g, '').slice(-10)

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
      } catch {
        // ignore mapping errors; still log call
      }
    }

    // Deduplicate (same logic as /api/calls/log)
    const callStartTime = new Date(call_started_at)
    const tenSecondsBefore = new Date(callStartTime.getTime() - 10000)
    const tenSecondsAfter = new Date(callStartTime.getTime() + 10000)
    const durationSeconds = duration_seconds || 0
    const durationTolerance = 5

    const { data: existingLogs } = await supabase
      .from('call_logs')
      .select('id, duration_seconds')
      .eq('user_id', profile.id)
      .eq('phone_number', phone_number)
      .gte('call_started_at', tenSecondsBefore.toISOString())
      .lte('call_started_at', tenSecondsAfter.toISOString())
      .limit(10)

    const duplicateLog = existingLogs?.find((log: any) => {
      const existingDuration = log.duration_seconds || 0
      const durationDiff = Math.abs(existingDuration - durationSeconds)
      return durationDiff <= durationTolerance
    })

    if (duplicateLog) {
      return NextResponse.json({
        call_log: duplicateLog,
        message: 'Call already logged (duplicate prevented)',
        duplicate: true,
      })
    }

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
      return NextResponse.json(
        { error: 'Failed to create call log', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ call_log: callLog, message: 'Call logged successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

