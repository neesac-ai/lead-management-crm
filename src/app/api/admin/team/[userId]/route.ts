import { createClient } from '@/lib/supabase/server'
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

// Remove team member
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
      return NextResponse.json({ error: 'Only admins can remove team members' }, { status: 403 })
    }

    // Get the team member
    const { data: teamMember } = await supabase
      .from('users')
      .select('id, org_id, role')
      .eq('id', userId)
      .single()

    if (!teamMember) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify they're in the same org
    if (teamMember.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'User not in your organization' }, { status: 403 })
    }

    // Can't remove another admin
    if (teamMember.role === 'admin') {
      return NextResponse.json({ error: 'Cannot remove admin users' }, { status: 403 })
    }

    // Delete user
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)

    if (error) {
      console.error('Error removing user:', error)
      return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Team member removed',
    })
  } catch (error) {
    console.error('Remove team member error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}








