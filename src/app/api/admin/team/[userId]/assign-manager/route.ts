import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { validateManagerAssignment } from '@/lib/utils/hierarchy-validation'

export async function POST(
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
      return NextResponse.json({ error: 'Only admins can assign managers' }, { status: 403 })
    }

    // Get request body
    const body = await request.json()
    const { managerId } = body

    if (!managerId) {
      return NextResponse.json({ error: 'Manager ID is required' }, { status: 400 })
    }

    // Get the target user
    const { data: targetUser, error: userError } = await adminSupabase
      .from('users')
      .select('id, org_id, name')
      .eq('id', userId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify target user belongs to the same org (unless super admin)
    if (adminProfile.role !== 'super_admin' && targetUser.org_id !== adminProfile.org_id) {
      return NextResponse.json({ error: 'Cannot assign managers to users from other organizations' }, { status: 403 })
    }

    // Validate the assignment
    const validation = await validateManagerAssignment(userId, managerId)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Update the user's manager_id
    const { error: updateError } = await adminSupabase
      .from('users')
      .update({ manager_id: managerId })
      .eq('id', userId)

    if (updateError) {
      console.error('Error assigning manager:', updateError)
      return NextResponse.json({ error: 'Failed to assign manager' }, { status: 500 })
    }

    revalidatePath('/[orgSlug]/team', 'page')

    return NextResponse.json({ 
      success: true,
      message: 'Manager assigned successfully'
    })
  } catch (error: any) {
    console.error('Error in assign-manager:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

