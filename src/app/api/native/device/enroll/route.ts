import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/native/device/enroll
 *
 * One-time enrollment (requires logged-in cookie session).
 * Returns a revocable device_key that Android can store and use even if user logs out later.
 *
 * Body: { device_label?: string, platform?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, org_id, role')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const deviceLabel = typeof body?.device_label === 'string' ? body.device_label.slice(0, 120) : null
    const platform = typeof body?.platform === 'string' ? body.platform.slice(0, 20) : 'android'

    // Generate a strong random device key (store only hash in DB)
    const deviceKey = crypto.randomBytes(32).toString('hex') // 64 hex chars
    const deviceKeyHash = crypto.createHash('sha256').update(deviceKey).digest('hex')
    const deviceKeyPrefix = deviceKey.slice(0, 12)

    const admin = await createAdminClient()

    const { data: device, error } = await admin
      .from('org_devices')
      .insert({
        org_id: (profile as any).org_id,
        assigned_user_id: (profile as any).id,
        platform,
        device_label: deviceLabel,
        device_key_hash: deviceKeyHash,
        device_key_prefix: deviceKeyPrefix,
        last_seen_at: new Date().toISOString(),
      })
      .select('id, org_id, assigned_user_id, platform, device_label, device_key_prefix, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to enroll device', details: error.message }, { status: 500 })
    }

    const { data: assignedUser } = await admin
      .from('users')
      .select('id, name, email')
      .eq('id', (profile as any).id)
      .single()

    return NextResponse.json({
      device: device,
      assigned_user: assignedUser || null,
      device_key: deviceKey,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Internal server error', details: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

