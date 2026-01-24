import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * PATCH /api/subscriptions/[id]
 * Update a subscription
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Only admins can update subscriptions
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use admin client to check and update pending approvals (bypasses RLS)
    const adminSupabase = await createAdminClient()

    // Check if it's a pending approval (in subscription_approvals table)
    const { data: pendingApproval } = await adminSupabase
      .from('subscription_approvals')
      .select('org_id, status')
      .eq('id', id)
      .single()

    if (pendingApproval) {
      // It's a pending approval
      if (pendingApproval.org_id !== profile.org_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Build update object with only provided fields
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }

      // Only include fields that are provided in the body
      if (body.deal_value !== undefined) updateData.deal_value = body.deal_value
      if (body.amount_credited !== undefined) updateData.amount_credited = body.amount_credited
      if (body.start_date !== undefined) updateData.start_date = body.start_date
      if (body.end_date !== undefined) updateData.end_date = body.end_date
      if (body.validity_days !== undefined) updateData.validity_days = body.validity_days
      if (body.notes !== undefined) updateData.notes = body.notes

      // Handle product_id - only include if provided
      if (body.product_id !== undefined) {
        if (body.product_id !== null && body.product_id !== 'none') {
          updateData.product_id = body.product_id
        } else {
          updateData.product_id = null
        }
      }

      // Update the pending approval using admin client (bypasses RLS)
      const { data: updated, error } = await adminSupabase
        .from('subscription_approvals')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating pending approval:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ subscription: updated })
    }

    // If not found in subscription_approvals, check customer_subscriptions
    const { data: subscription } = await supabase
      .from('customer_subscriptions')
      .select('org_id')
      .eq('id', id)
      .single()

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    if (subscription.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Only include fields that are provided in the body
    if (body.deal_value !== undefined) updateData.deal_value = body.deal_value
    if (body.amount_credited !== undefined) updateData.amount_credited = body.amount_credited
    if (body.start_date !== undefined) updateData.start_date = body.start_date
    if (body.end_date !== undefined) updateData.end_date = body.end_date
    if (body.validity_days !== undefined) updateData.validity_days = body.validity_days
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.status !== undefined) updateData.status = body.status

    // Handle product_id - only include if provided and column exists
    // Note: This requires migration 020 to be applied (adds product_id column)
    let includeProductId = false
    if (body.product_id !== undefined) {
      if (body.product_id !== null && body.product_id !== 'none') {
        updateData.product_id = body.product_id
        includeProductId = true
      } else {
        // Try to set to null, but handle gracefully if column doesn't exist
        updateData.product_id = null
        includeProductId = true
      }
    }

    // Update the subscription
    let { data: updated, error } = await supabase
      .from('customer_subscriptions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    // If error is about product_id column not existing, retry without it
    if (error && error.message?.includes('product_id') && includeProductId) {
      console.warn('product_id column not found, retrying without it. Please apply migration 020.')
      delete updateData.product_id
      const retryResult = await supabase
        .from('customer_subscriptions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (retryResult.error) {
        console.error('Error updating subscription:', retryResult.error)
        return NextResponse.json({ error: retryResult.error.message }, { status: 500 })
      }
      updated = retryResult.data
    } else if (error) {
      console.error('Error updating subscription:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ subscription: updated })
  } catch (error) {
    console.error('Error in PATCH /api/subscriptions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/subscriptions/[id]
 * Delete a subscription
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
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Only admins can delete subscriptions
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use admin client to check and delete pending approvals (bypasses RLS)
    const adminSupabase = await createAdminClient()

    // Check if it's a pending approval (in subscription_approvals table)
    const { data: pendingApproval } = await adminSupabase
      .from('subscription_approvals')
      .select('org_id, status')
      .eq('id', id)
      .single()

    if (pendingApproval) {
      // It's a pending approval
      if (pendingApproval.org_id !== profile.org_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Delete from subscription_approvals using admin client (bypasses RLS)
      const { error } = await adminSupabase
        .from('subscription_approvals')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting pending approval:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // If not found in subscription_approvals, check customer_subscriptions
    const { data: subscription } = await supabase
      .from('customer_subscriptions')
      .select('org_id')
      .eq('id', id)
      .single()

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    if (subscription.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete the subscription (cascade will handle payments and invoices)
    const { error } = await supabase
      .from('customer_subscriptions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting subscription:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/subscriptions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
