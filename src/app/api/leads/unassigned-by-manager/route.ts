import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get caller's profile
    const { data: callerProfile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Only allow sales users (managers or regular sales)
    if (callerProfile.role !== 'sales') {
      return NextResponse.json({ error: 'Only sales users can access this endpoint' }, { status: 403 })
    }

    // Get reportees if manager
    const { data: reportees } = await supabase
      .rpc('get_all_reportees', { manager_user_id: callerProfile.id } as any)

    const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r: { reportee_id: string }) => r.reportee_id) || []
    const accessibleUserIds = [callerProfile.id, ...reporteeIds]

    // Use admin client to bypass RLS and fetch unassigned leads created by manager/reportees
    const adminClient = await createAdminClient()
    const { data: unassignedLeads, error } = await adminClient
      .from('leads')
      .select('id, name, email, phone, source, status, subscription_type, custom_fields, created_at, created_by, assigned_to')
      .eq('org_id', callerProfile.org_id)
      .is('assigned_to', null)
      .in('created_by', accessibleUserIds)

    if (error) {
      console.error('Error fetching unassigned leads:', error)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    return NextResponse.json({ leads: unassignedLeads || [] })
  } catch (error) {
    console.error('Error in unassigned-by-manager endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

