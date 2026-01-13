import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET/POST /api/locations/settings
 * Manage per-user location tracking preferences (team member only).
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user: authUser } } = await supabase.auth.getUser()

        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('users')
            .select('id, org_id')
            .eq('auth_id', authUser.id)
            .single()

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const { data: settings, error } = await supabase
            .from('location_tracking_settings')
            .select('is_tracking_enabled')
            .eq('user_id', profile.id)
            .single()

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = No rows found
            console.error('Error fetching location tracking settings:', error)
            return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
        }

        return NextResponse.json({
            is_tracking_enabled: settings?.is_tracking_enabled ?? false,
        })
    } catch (e) {
        console.error('Location settings GET error:', e)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user: authUser } } = await supabase.auth.getUser()

        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('users')
            .select('id, org_id')
            .eq('auth_id', authUser.id)
            .single()

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const body = await request.json()
        const enabled = !!body?.is_tracking_enabled

        const { data: settings, error } = await supabase
            .from('location_tracking_settings')
            .upsert({
                user_id: profile.id,
                org_id: profile.org_id,
                is_tracking_enabled: enabled,
            }, { onConflict: 'user_id' })
            .select('is_tracking_enabled')
            .single()

        if (error) {
            console.error('Error updating location tracking settings:', error)
            return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
        }

        return NextResponse.json({ is_tracking_enabled: settings?.is_tracking_enabled ?? enabled })
    } catch (e) {
        console.error('Location settings POST error:', e)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}


