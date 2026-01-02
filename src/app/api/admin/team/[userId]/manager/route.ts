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
      return NextResponse.json({ error: 'Only admins can view manager information' }, { status: 403 })
    }

    // Get the target user
    const { data: targetUser, error: userError } = await adminSupabase
      .from('users')
      .select('id, org_id, manager_id')
      .eq('id', userId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify target user belongs to the same org (unless super admin)
    if (adminProfile.role !== 'super_admin' && targetUser.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'Cannot view manager of users from other organizations' }, { status: 403 })
    }

    if (!targetUser.manager_id) {
      return NextResponse.json({ manager: null })
    }

    // Get manager details
    const { data: manager, error: managerError } = await adminSupabase
      .from('users')
      .select('id, name, email, role, is_active')
      .eq('id', targetUser.manager_id)
      .single()

    if (managerError || !manager) {
      return NextResponse.json({ error: 'Manager not found' }, { status: 404 })
    }

    return NextResponse.json({ manager })
  } catch (error: any) {
    console.error('Error in manager:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

