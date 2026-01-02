import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  try {
    const { approvalId } = await params
    const body = await request.json()
    const { action, rejection_reason } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await adminSupabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user is accountant, admin, or super_admin
    if (!['accountant', 'admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the approval record
    const { data: approval, error: approvalError } = await adminSupabase
      .from('subscription_approvals')
      .select('*, org_id, lead_id')
      .eq('id', approvalId)
      .single()

    if (approvalError || !approval) {
      return NextResponse.json(
        { error: 'Approval not found' },
        { status: 404 }
      )
    }

    // Verify org access
    if (approval.org_id !== profile.org_id && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if already processed
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Approval already ${approval.status}` },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      // Update approval status
      const { error: updateError } = await adminSupabase
        .from('subscription_approvals')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', approvalId)

      if (updateError) {
        console.error('Error updating approval:', updateError)
        return NextResponse.json(
          { error: 'Failed to update approval' },
          { status: 500 }
        )
      }

      // Create subscription using the database function
      const { data: subscriptionId, error: createError } = await adminSupabase
        .rpc('create_subscription_from_approval', { approval_id: approvalId })

      if (createError) {
        console.error('Error creating subscription:', createError)
        // Rollback approval status
        await adminSupabase
          .from('subscription_approvals')
          .update({
            status: 'pending',
            approved_by: null,
            approved_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', approvalId)

        return NextResponse.json(
          { error: 'Failed to create subscription: ' + createError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Subscription approved and created successfully',
        subscription_id: subscriptionId,
      })
    } else {
      // Reject approval
      if (!rejection_reason || !rejection_reason.trim()) {
        return NextResponse.json(
          { error: 'Rejection reason is required' },
          { status: 400 }
        )
      }

      const { error: updateError } = await adminSupabase
        .from('subscription_approvals')
        .update({
          status: 'rejected',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejection_reason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', approvalId)

      if (updateError) {
        console.error('Error updating approval:', updateError)
        return NextResponse.json(
          { error: 'Failed to reject approval' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Subscription rejected successfully',
      })
    }
  } catch (error) {
    console.error('Approval action error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

