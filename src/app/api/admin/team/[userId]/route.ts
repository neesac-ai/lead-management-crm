import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Approve or reject team member
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const { action } = await request.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's profile
    const { data: adminProfile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!adminProfile || adminProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can manage team members' }, { status: 403 })
    }

    // Get the team member
    const { data: teamMember } = await supabase
      .from('users')
      .select('id, org_id, role, name')
      .eq('id', userId)
      .single()

    if (!teamMember) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify they're in the same org
    if (teamMember.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'User not in your organization' }, { status: 403 })
    }

    // Can't approve/reject another admin
    if (teamMember.role === 'admin') {
      return NextResponse.json({ error: 'Cannot modify admin users' }, { status: 403 })
    }

    if (action === 'approve') {
      // Check quota before approving
      const adminClient = await createAdminClient()
      
      // Get current approved count for this role
      const { count: currentCount } = await adminClient
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', adminProfile.org_id)
        .eq('role', teamMember.role)
        .eq('is_approved', true)
        .eq('is_active', true)

      // Get quota from org_subscriptions
      const { data: subscription } = await adminClient
        .from('org_subscriptions')
        .select('sales_quota, accountant_quota, status')
        .eq('org_id', adminProfile.org_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (subscription && subscription.status === 'active') {
        const quota = teamMember.role === 'sales' ? subscription.sales_quota : subscription.accountant_quota
        
        // If quota is not null (not unlimited) and current count >= quota, deny approval
        if (quota !== null && (currentCount || 0) >= quota) {
          const roleLabel = teamMember.role === 'sales' ? 'Sales Rep' : 'Accountant'
          return NextResponse.json({ 
            error: `${roleLabel} quota is full (${currentCount}/${quota}). Cannot approve more team members of this role. Please contact super admin to increase quota.` 
          }, { status: 400 })
        }
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          is_approved: true, 
          approved_by: adminProfile.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('id', userId)

      if (updateError) {
        console.error('Error approving user:', updateError)
        return NextResponse.json({ error: 'Failed to approve user' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `${teamMember.name} has been approved`,
      })
    } else {
      // Reject - delete the user
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId)

      if (deleteError) {
        console.error('Error rejecting user:', deleteError)
        return NextResponse.json({ error: 'Failed to reject user' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'User request rejected',
      })
    }
  } catch (error) {
    console.error('Team action error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// Deactivate/Reactivate team member
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's profile
    const { data: adminProfile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!adminProfile || adminProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can manage team members' }, { status: 403 })
    }

    // Get the team member
    const { data: teamMember } = await supabase
      .from('users')
      .select('id, org_id, role, is_active')
      .eq('id', userId)
      .single()

    if (!teamMember) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify they're in the same org
    if (teamMember.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'User not in your organization' }, { status: 403 })
    }

    // Can't deactivate another admin
    if (teamMember.role === 'admin') {
      return NextResponse.json({ error: 'Cannot deactivate admin users' }, { status: 403 })
    }

    // Use admin client to bypass RLS
    const adminClient = await createAdminClient()

    // Toggle is_active status
    const newStatus = !teamMember.is_active

    // If deactivating, unassign all leads from this user
    if (!newStatus) {
      await adminClient
        .from('leads')
        .update({ assigned_to: null })
        .eq('assigned_to', userId)
    }

    // Update user status
    const { error } = await adminClient
      .from('users')
      .update({ 
        is_active: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (error) {
      console.error('Error updating user status:', error)
      return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: newStatus 
        ? 'Team member reactivated successfully.' 
        : 'Team member deactivated. Their leads have been unassigned.',
      isActive: newStatus
    })
  } catch (error) {
    console.error('Team member status error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}









