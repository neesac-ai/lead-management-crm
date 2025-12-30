import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
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

    if (!adminProfile || adminProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete team members' }, { status: 403 })
    }

    // Get the user to be deleted
    const { data: targetUser, error: userError } = await adminSupabase
      .from('users')
      .select('id, auth_id, org_id, role, name')
      .eq('id', userId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify target user belongs to the same org
    if (targetUser.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'Cannot delete users from other organizations' }, { status: 403 })
    }

    // Cannot delete admins through this endpoint
    if (targetUser.role === 'admin') {
      return NextResponse.json({ error: 'Cannot delete admin accounts through this endpoint' }, { status: 403 })
    }

    // Step 1: Unassign all leads and clear created_by (preserve the lead data)
    // First, unassign leads assigned to this user
    const { error: assignedLeadsError } = await adminSupabase
      .from('leads')
      .update({ 
        assigned_to: null, 
        updated_at: new Date().toISOString() 
      })
      .eq('assigned_to', userId)

    if (assignedLeadsError) {
      console.error('Error unassigning leads:', assignedLeadsError)
    }

    // Second, clear created_by for leads created by this user
    const { error: createdLeadsError } = await adminSupabase
      .from('leads')
      .update({ 
        created_by: null, 
        updated_at: new Date().toISOString() 
      })
      .eq('created_by', userId)

    if (createdLeadsError) {
      console.error('Error clearing created_by from leads:', createdLeadsError)
      return NextResponse.json({ 
        error: `Failed to update leads: ${createdLeadsError.message}` 
      }, { status: 500 })
    }

    // Step 2: Update user_id in lead_activities to admin (preserve activity history)
    const { error: activitiesError } = await adminSupabase
      .from('lead_activities')
      .update({ user_id: adminProfile.id })
      .eq('user_id', userId)

    if (activitiesError) {
      console.error('Error updating lead_activities:', activitiesError)
    }

    // Step 3: Update approved_by references to point to admin (for other users this user approved)
    const { error: approvedByError } = await adminSupabase
      .from('users')
      .update({ approved_by: adminProfile.id })
      .eq('approved_by', userId)

    if (approvedByError) {
      console.error('Error updating approved_by:', approvedByError)
    }

    // Step 3b: Update subscription_approvals references (if table exists)
    try {
      // Clear created_by, approved_by, and requested_by references
      const { error: approvalsError } = await adminSupabase
        .from('subscription_approvals')
        .update({ 
          created_by: adminProfile.id,
          approved_by: adminProfile.id,
          requested_by: adminProfile.id
        })
        .or(`created_by.eq.${userId},approved_by.eq.${userId},requested_by.eq.${userId}`)

      if (approvalsError && approvalsError.code !== '42P01' && approvalsError.code !== 'PGRST116') {
        console.error('Error updating subscription_approvals:', approvalsError)
      }
    } catch (err) {
      // Table might not exist, ignore
      console.log('subscription_approvals table may not exist')
    }

    // Step 4: Delete impersonation logs for this user (if any)
    const { error: impersonationError } = await adminSupabase
      .from('impersonation_logs')
      .delete()
      .eq('target_user_id', userId)

    if (impersonationError && impersonationError.code !== 'PGRST204') {
      console.error('Error deleting impersonation logs:', impersonationError)
    }

    // Step 5: Verify user still exists before delete
    const { data: checkUser } = await adminSupabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (!checkUser) {
      console.log('User already deleted from database:', userId)
      // User already deleted, just cleanup auth
      if (targetUser.auth_id) {
        await adminSupabase.auth.admin.deleteUser(targetUser.auth_id)
      }
      return NextResponse.json({ 
        message: `User ${targetUser.name} has been deleted.`,
        success: true
      })
    }

    // Step 6: Delete the user profile from users table
    const { error: deleteUserError, count } = await adminSupabase
      .from('users')
      .delete({ count: 'exact' })
      .eq('id', userId)

    if (deleteUserError) {
      console.error('Error deleting user profile:', deleteUserError)
      return NextResponse.json({ 
        error: `Failed to delete user profile: ${deleteUserError.message}` 
      }, { status: 500 })
    }

    console.log('Delete result - rows affected:', count)

    // Verify the user was actually deleted
    const { data: verifyUser } = await adminSupabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (verifyUser) {
      console.error('User still exists after delete! RLS may be blocking.')
      return NextResponse.json({ 
        error: 'Delete failed - user still exists. Please check database permissions.' 
      }, { status: 500 })
    }

    console.log('User profile deleted for userId:', userId)

    // Revalidate the team page to show updated data
    revalidatePath('/[orgSlug]/team', 'page')

    // Step 7: Delete from Supabase Auth (this frees up the email)
    if (targetUser.auth_id) {
      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(
        targetUser.auth_id
      )

      if (authDeleteError) {
        // If user not found in auth, that's okay - they're already gone
        if (authDeleteError.code === 'user_not_found') {
          console.log('Auth user already deleted or never existed:', targetUser.auth_id)
          return NextResponse.json({ 
            message: `User ${targetUser.name} has been permanently deleted.`,
            success: true
          })
        }
        
        console.error('Error deleting auth user:', authDeleteError)
        // User profile is already deleted, so we continue but log the error
        return NextResponse.json({ 
          message: 'User profile deleted but auth cleanup failed. Email may still be in use.',
          warning: true 
        })
      }
    }

    return NextResponse.json({ 
      message: `User ${targetUser.name} has been permanently deleted. Their email can now be reused.`,
      success: true
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
