import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Verify the requesting user is an admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await adminSupabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Only admins can view reportees' }, { status: 403 })
    }

    // Get the target user
    const { data: targetUser, error: userError } = await adminSupabase
      .from('users')
      .select('id, org_id')
      .eq('id', userId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify target user belongs to the same org (unless super admin)
    if (adminProfile.role !== 'super_admin' && targetUser.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'Cannot view reportees of users from other organizations' }, { status: 403 })
    }

    // Get all reportees (direct and indirect)
    const { data: reportees, error: reporteesError } = await adminSupabase
      .rpc('get_all_reportees', { manager_user_id: userId })

    if (reporteesError) {
      console.error('Error fetching reportees:', reporteesError)
      return NextResponse.json({ error: 'Failed to fetch reportees' }, { status: 500 })
    }

    const reporteeIds = reportees?.map((r: { reportee_id: string }) => r.reportee_id) || []

    if (reporteeIds.length === 0) {
      return NextResponse.json({ reportees: [] })
    }

    // Get full user details for reportees
    const { data: reporteeUsers, error: usersError } = await adminSupabase
      .from('users')
      .select('id, name, email, role, is_active, manager_id')
      .in('id', reporteeIds)
      .order('name')

    if (usersError) {
      console.error('Error fetching reportee users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch reportee details' }, { status: 500 })
    }

    return NextResponse.json({ reportees: reporteeUsers || [] })
  } catch (error: any) {
    console.error('Error in reportees:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

