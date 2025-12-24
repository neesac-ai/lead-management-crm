import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const body = await request.json()
    const { deleteTeam } = body

    // Verify caller is super_admin
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerProfile } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', authUser.id)
      .single()

    if (callerProfile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the user to be deleted
    const adminClient = await createAdminClient()
    const { data: targetUser } = await adminClient
      .from('users')
      .select('id, role, org_id, auth_id')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // If deleting an admin with deleteTeam flag, cascade delete
    if (targetUser.role === 'admin' && deleteTeam && targetUser.org_id) {
      // Delete all team members first
      const { error: teamError } = await adminClient
        .from('users')
        .delete()
        .eq('org_id', targetUser.org_id)
        .neq('role', 'admin')

      if (teamError) {
        console.error('Error deleting team:', teamError)
      }

      // Delete leads for this org
      const { error: leadsError } = await adminClient
        .from('leads')
        .delete()
        .eq('org_id', targetUser.org_id)

      if (leadsError) {
        console.error('Error deleting leads:', leadsError)
      }

      // Delete the admin
      const { error: adminError } = await adminClient
        .from('users')
        .delete()
        .eq('id', userId)

      if (adminError) {
        return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 })
      }

      // Delete the organization
      const { error: orgError } = await adminClient
        .from('organizations')
        .delete()
        .eq('id', targetUser.org_id)

      if (orgError) {
        console.error('Error deleting organization:', orgError)
      }

      return NextResponse.json({ 
        message: 'Admin and team deleted successfully',
        deletedOrg: true 
      })
    }

    // Simple user deletion
    const { error: deleteError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }

    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

