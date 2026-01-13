import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const assignedTo = typeof body?.assignedTo === 'string' ? body.assignedTo : null
    if (!assignedTo) {
      return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 })
    }

    let q = supabase.from('platform_integrations').select('*').eq('id', id)
    if (profile.role !== 'super_admin') {
      q = q.eq('org_id', profile.org_id)
    }
    const { data: integration } = await q.single()
    if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    if (integration.platform !== 'google_sheets') {
      return NextResponse.json({ error: 'Not a Google Sheets integration' }, { status: 400 })
    }

    const existingConfig = (integration.config || {}) as Record<string, unknown>
    const nextConfig = { ...existingConfig, sheet_assigned_to: assignedTo }

    const { error: updateIntegrationError } = await supabase
      .from('platform_integrations')
      .update({ config: nextConfig })
      .eq('id', id)

    if (updateIntegrationError) {
      return NextResponse.json(
        { error: 'Failed to save sheet assignment', details: updateIntegrationError.message },
        { status: 500 }
      )
    }

    // Assign all existing leads imported from this integration to the selected rep.
    // Note: assigned_to is the key for visibility; created_by is not required once assigned.
    const { error: updateLeadsError } = await supabase
      .from('leads')
      .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
      .eq('org_id', integration.org_id)
      .eq('integration_id', id)

    if (updateLeadsError) {
      return NextResponse.json(
        { error: 'Saved assignment but failed to update existing leads', details: updateLeadsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

