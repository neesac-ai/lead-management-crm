import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Approve or reject organization
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { action } = await request.json()

    if (!['approve', 'reject', 'suspend'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check if requester is super admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the organization
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let newStatus: string
    switch (action) {
      case 'approve':
        newStatus = 'active'
        break
      case 'reject':
        newStatus = 'deleted'
        break
      case 'suspend':
        newStatus = 'suspended'
        break
      default:
        newStatus = 'pending'
    }

    // Update organization status
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating organization:', updateError)
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    // If approved, also approve the admin user
    if (action === 'approve') {
      const { data: superAdmin } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      await supabase
        .from('users')
        .update({ 
          is_approved: true, 
          approved_by: superAdmin?.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('org_id', id)
        .eq('role', 'admin')
    }

    return NextResponse.json({
      success: true,
      message: `Organization ${action}ed successfully`,
    })
  } catch (error) {
    console.error('Organization action error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// Delete organization
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check if requester is super admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete the organization (cascade will delete users)
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting organization:', error)
      return NextResponse.json(
        { error: 'Failed to delete organization' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully',
    })
  } catch (error) {
    console.error('Delete organization error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}








