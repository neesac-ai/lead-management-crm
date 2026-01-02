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

    if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Only admins can remove managers' }, { status: 403 })
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
      return NextResponse.json({ error: 'Cannot remove managers from users in other organizations' }, { status: 403 })
    }

    // Check if user has a manager
    if (!targetUser.manager_id) {
      return NextResponse.json({ error: 'User does not have a manager assigned' }, { status: 400 })
    }

    // Remove the manager assignment
    const { error: updateError } = await adminSupabase
      .from('users')
      .update({ manager_id: null })
      .eq('id', userId)

    if (updateError) {
      console.error('Error removing manager:', updateError)
      return NextResponse.json({ error: 'Failed to remove manager' }, { status: 500 })
    }

    revalidatePath('/[orgSlug]/team', 'page')

    return NextResponse.json({ 
      success: true,
      message: 'Manager removed successfully'
    })
  } catch (error: any) {
    console.error('Error in remove-manager:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

