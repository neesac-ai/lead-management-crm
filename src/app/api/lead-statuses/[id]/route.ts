import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Protected statuses that cannot be deleted
const PROTECTED_STATUSES = ['follow_up_again', 'demo_booked', 'deal_won']

/**
 * PATCH /api/lead-statuses/[id]
 * Update a lead status (label, color, display_order, is_active)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Only admins can update statuses
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { label, color, display_order, is_active } = body

    // Get the existing status to check if it's protected
    const { data: existingStatus } = await supabase
      .from('lead_statuses')
      .select('status_value, org_id')
      .eq('id', id)
      .single()

    if (!existingStatus) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    if (existingStatus.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build update object
    const updates: any = {}
    if (label !== undefined) updates.label = label
    if (color !== undefined) updates.color = color
    if (display_order !== undefined) updates.display_order = display_order
    if (is_active !== undefined) updates.is_active = is_active
    updates.updated_at = new Date().toISOString()

    // Update the status
    const { data: updatedStatus, error } = await supabase
      .from('lead_statuses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating lead status:', error)
      return NextResponse.json({ error: 'Failed to update lead status' }, { status: 500 })
    }

    return NextResponse.json({ status: updatedStatus })
  } catch (error) {
    console.error('Error in PATCH /api/lead-statuses/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/lead-statuses/[id]
 * Delete a lead status (only if not protected)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Only admins can delete statuses
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the existing status to check if it's protected
    const { data: existingStatus } = await supabase
      .from('lead_statuses')
      .select('status_value, org_id')
      .eq('id', id)
      .single()

    if (!existingStatus) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 })
    }

    if (existingStatus.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if status is protected
    if (PROTECTED_STATUSES.includes(existingStatus.status_value)) {
      return NextResponse.json({
        error: 'This status cannot be deleted because it is linked to Follow-ups, Meetings, or Subscriptions'
      }, { status: 400 })
    }

    // Check if any leads are using this status
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .eq('status', existingStatus.status_value)

    if (count && count > 0) {
      return NextResponse.json({
        error: `Cannot delete status: ${count} lead(s) are currently using this status. Please update those leads first.`
      }, { status: 400 })
    }

    // Soft delete: set is_active to false instead of hard delete
    // This prevents default statuses from reappearing
    const { error } = await supabase
      .from('lead_statuses')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      console.error('Error deleting lead status:', error)
      return NextResponse.json({ error: 'Failed to delete lead status' }, { status: 500 })
    }

    console.log('[DELETE] Soft deleted status:', id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/lead-statuses/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
